// Spec-driven mock for the docs playground. getairwave.tv has no real Airwave behind it, so the OpenAPI
// reference's "Try it" panel targets this route (the site spec's server is /api/mock/public/v1). We read the
// committed spec, match the requested path+method (handling templated segments), and synthesize a response
// from the operation's declared example / schema — so the playground "works" with realistic fake data, and
// the examples never drift from the spec. Accepts any/no API key.
import spec from "@/openapi/spec.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const doc = spec as any;

function resolveRef(ref: string): any {
  const name = ref.split("/").pop();
  return name ? doc.components?.schemas?.[name] : undefined;
}

function example(schema: any, depth = 0): unknown {
  if (!schema || depth > 10) return null;
  if (schema.$ref) return example(resolveRef(schema.$ref), depth + 1);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  const union = schema.anyOf ?? schema.oneOf ?? schema.allOf;
  if (union) {
    const pick = union.find((s: any) => s?.type !== "null") ?? union[0];
    return example(pick, depth + 1);
  }
  if (Array.isArray(schema.type)) {
    const t = schema.type.find((x: string) => x !== "null");
    return t ? example({ ...schema, type: t }, depth + 1) : null;
  }
  if (schema.type === "object" || schema.properties) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) o[k] = example(v, depth + 1);
    return o;
  }
  if (schema.type === "array") return [example(schema.items, depth + 1)];
  if (schema.type === "string") return schema.enum?.[0] ?? "string";
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.type === "boolean") return false;
  return null;
}

function matchOperation(method: string, reqPath: string): any | null {
  const reqSegs = reqPath.split("/").filter(Boolean);
  for (const [p, item] of Object.entries<any>(doc.paths ?? {})) {
    const segs = p.split("/").filter(Boolean);
    if (segs.length !== reqSegs.length) continue;
    if (segs.every((s, i) => s.startsWith("{") || s === reqSegs[i])) {
      return (item as any)[method.toLowerCase()] ?? null;
    }
  }
  return null;
}

// A branded placeholder poster for image endpoints (e.g. the artwork proxy) — there's no real Plex behind the
// mock, so we hand back an SVG so the playground's "Try it" still renders an image instead of empty JSON.
function placeholderImage(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <rect width="300" height="450" fill="#060a14"/>
  <rect x="1" y="1" width="298" height="448" fill="none" stroke="#1b2740" stroke-width="2"/>
  <circle cx="150" cy="195" r="46" fill="none" stroke="#4a9fe0" stroke-width="3"/>
  <path d="M132 172 v46 l40 -23 z" fill="#4a9fe0"/>
  <text x="150" y="300" fill="#8fb4dc" font-family="system-ui,sans-serif" font-size="18" font-weight="600" text-anchor="middle">Artwork preview</text>
  <text x="150" y="326" fill="#4d6284" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">real posters come from your Plex</text>
</svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store", "x-airwave-mock": "1" },
  });
}

function handle(method: string, path: string[]): Response {
  const reqPath = `/${(path ?? []).join("/")}`;
  const op = matchOperation(method, reqPath);
  if (!op) {
    return Response.json(
      { error: { code: "not_found", message: `No mock for ${method} ${reqPath}.` } },
      { status: 404, headers: { "x-airwave-mock": "1" } },
    );
  }
  const content = op.responses?.["200"]?.content ?? {};
  const jsonSchema = content["application/json"]?.schema;
  // Non-JSON 200 (the artwork image proxy) — return a placeholder image so the playground still "works".
  if (!jsonSchema && Object.keys(content).some((t) => t.startsWith("image/"))) {
    return placeholderImage();
  }
  return Response.json(example(jsonSchema) ?? {}, { headers: { "x-airwave-mock": "1" } });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle("GET", (await params).path);
}
export async function POST(_req: Request, { params }: Ctx) {
  return handle("POST", (await params).path);
}
export async function PATCH(_req: Request, { params }: Ctx) {
  return handle("PATCH", (await params).path);
}
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle("DELETE", (await params).path);
}
