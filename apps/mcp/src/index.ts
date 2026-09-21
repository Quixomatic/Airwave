#!/usr/bin/env bun
/**
 * Airwave MCP server (stdio) — exposes a running Airwave server's tool surface to any MCP-capable agent.
 *
 * This process is a THIN transport shim: it holds no DB/Plex/auth. On start it fetches the tool list from the
 * Airwave server's authenticated dispatch endpoint (`/api/v1/tools/list`), declares each as an MCP tool, and
 * forwards every call to `/api/v1/tools/call`. All logic + auth live on the server; parity with the AI
 * assistant is automatic (whatever the server lists, we expose).
 *
 * Config (env):
 *   AIRWAVE_URL      — base URL of the running server, e.g. https://airwave.example.com
 *   AIRWAVE_API_KEY  — an admin API key (starts with `airwave_`), sent as `x-api-key`
 *
 * Run with bun: `bun run src/index.ts` (dev) or the built `dist/index.js` (`bun run dist/index.js`).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import pkg from "../package.json" with { type: "json" };

const BASE = process.env.AIRWAVE_URL?.replace(/\/+$/, "");
const KEY = process.env.AIRWAVE_API_KEY;

if (!BASE || !KEY) {
  console.error("[airwave-mcp] Set AIRWAVE_URL and AIRWAVE_API_KEY.");
  process.exit(1);
}

/** Authenticated call to the Airwave server's tool dispatch surface. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-api-key": KEY!, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

type ToolDescriptor = { name: string; description: string; inputSchema: Record<string, unknown> };

const server = new Server(
  { name: "airwave", version: pkg.version },
  { capabilities: { tools: {} } },
);

// Advertise whatever the server lists — full parity, no per-tool wiring.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools } = await api<{ tools: ToolDescriptor[] }>("/api/v1/tools/list");
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      // The server hands back JSON Schema already (zod→JSON Schema); MCP expects an object schema.
      inputSchema: (t.inputSchema ?? { type: "object" }) as { type: "object" },
    })),
  };
});

// Forward a call to the server and return its JSON result as text content.
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const { result } = await api<{ result: unknown }>("/api/v1/tools/call", {
      method: "POST",
      body: JSON.stringify({ name, args: args ?? {} }),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[airwave-mcp] connected — proxying tools from ${BASE}`);
