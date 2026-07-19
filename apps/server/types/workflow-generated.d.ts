/**
 * Types for the Workflow SDK's GENERATED handler bundles.
 *
 * `bunx workflow build` emits `.well-known/workflow/v1/{flow,step,webhook}.js` — plain
 * JS with no declarations, and gitignored (they're ~20MB and rebuilt every time). Without
 * these shims `tsc` fails with TS7016 on a clean checkout where the bundles don't exist
 * yet. Each handler takes a Web-standard `Request` and returns a `Response`, which is why
 * they mount on Hono (or a bare `Bun.serve`) unchanged.
 */
declare module "*/.well-known/workflow/v1/flow.js" {
  const handler: { POST: (req: Request) => Promise<Response> };
  export default handler;
}

declare module "*/.well-known/workflow/v1/step.js" {
  const handler: { POST: (req: Request) => Promise<Response> };
  export default handler;
}

declare module "*/.well-known/workflow/v1/webhook.js" {
  export const POST: (req: Request) => Promise<Response>;
  export const GET: (req: Request) => Promise<Response>;
}
