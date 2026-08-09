import type { AppRouter } from "@airwave/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

export type ImportPreview = inferRouterOutputs<AppRouter>["transfer"]["importPreview"];

/**
 * Client-side hand-off from the upload page (`/settings/transfer`) to the staging page
 * (`/settings/transfer/import-preview`). A module singleton — survives client-side navigation but not a
 * hard refresh, so the staging page redirects home when it's empty. Holds the raw parsed `data` (needed to
 * dispatch the import) alongside the annotated `preview` used to render the pick-and-choose grid.
 */
export type StagedImport = {
  data: unknown;
  targetSourceId: string;
  targetName: string;
  fileName: string;
  preview: ImportPreview;
};

let staged: StagedImport | null = null;

export function setStagedImport(next: StagedImport | null): void {
  staged = next;
}
export function getStagedImport(): StagedImport | null {
  return staged;
}
