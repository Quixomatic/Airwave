// electrobun's Bun-side source (dist/api/bun/index.ts) imports `three` without shipping its types.
// We only use the tray/supervisor surface, so an `any` shim is enough to keep `tsc --noEmit` clean.
declare module "three";
