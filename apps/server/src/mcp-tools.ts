import { buildAgentTools } from "@airwave/api/services/agent/agent-tools";
import { auth } from "@airwave/auth";
import prisma from "@airwave/db";
import { Hono } from "hono";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Authenticated tool dispatch for the MCP server (`apps/mcp`) and any machine client. Exposes the SAME tool
 * registry the AI assistant uses (`buildAgentTools`) so MCP has automatic parity — every assistant tool, and
 * any future one, is reachable with no per-tool wiring here.
 *
 * Auth: an admin API key (better-auth `apiKey` plugin), sent as `x-api-key`. We verify it, resolve the owning
 * user, and require the `admin` role. This is a separate surface from the viewer-level `/api/v1` REST API, so
 * it has its OWN key-based guard (not the session/bearer one) — mount it BEFORE the `/api/v1` app so its
 * `*`-session middleware doesn't shadow these routes.
 *
 * Two endpoints:
 *   GET  /list  → [{ name, description, inputSchema (JSON Schema) }] — the MCP server declares these.
 *   POST /call  → { name, args } → validate against the tool's schema, run it, return the JSON result.
 */
const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", async (c, next) => {
  const key = c.req.header("x-api-key");
  if (!key) return c.json({ error: "Missing x-api-key" }, 401);
  const res = await auth.api.verifyApiKey({ body: { key } });
  const userId = res.valid ? res.key?.userId : undefined;
  if (!userId) return c.json({ error: "Invalid API key" }, 401);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (user?.role !== "admin") return c.json({ error: "Admin API key required" }, 403);
  c.set("userId", user.id);
  await next();
});

type AgentTool = {
  description?: string;
  inputSchema: z.ZodTypeAny;
  execute?: (args: unknown, opts: unknown) => Promise<unknown>;
};

app.get("/list", (c) => {
  const registry = buildAgentTools(prisma, c.get("userId")) as unknown as Record<string, AgentTool>;
  const tools = Object.entries(registry).map(([name, t]) => ({
    name,
    description: t.description ?? "",
    inputSchema: zodToJsonSchema(t.inputSchema, { target: "openApi3" }),
  }));
  return c.json({ tools });
});

app.post("/call", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: string; args?: unknown } | null;
  if (!body?.name) return c.json({ error: "Missing tool name" }, 400);

  const registry = buildAgentTools(prisma, c.get("userId")) as unknown as Record<string, AgentTool>;
  const t = registry[body.name];
  if (!t) return c.json({ error: `Unknown tool: ${body.name}` }, 404);

  const parsed = t.inputSchema.safeParse(body.args ?? {});
  if (!parsed.success) return c.json({ error: "Invalid arguments", issues: parsed.error.issues }, 400);
  if (!t.execute) return c.json({ error: `Tool ${body.name} is not executable` }, 400);

  try {
    const result = await t.execute(parsed.data, { toolCallId: "mcp", messages: [] });
    return c.json({ result });
  } catch (err) {
    console.error(`[mcp-tools] ${body.name} failed:`, err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export const mcpToolsApi = app;
