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

function handle(method: string, path: string[]): Response {
  const reqPath = `/${(path ?? []).join("/")}`;
  const op = matchOperation(method, reqPath);
  if (!op) {
    return Response.json(
      { error: { code: "not_found", message: `No mock for ${method} ${reqPath}.` } },
      { status: 404, headers: { "x-airwave-mock": "1" } },
    );
  }
  const schema = op.responses?.["200"]?.content?.["application/json"]?.schema;
  return Response.json(example(schema) ?? {}, { headers: { "x-airwave-mock": "1" } });
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
