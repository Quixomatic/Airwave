import type { MediaType } from "./channel-form";
import { normalizeFilter, type FilterGroup } from "./filter-builder";

// A copied filter is wrapped in a small versioned envelope so a paste can recognize it (and reject random
// clipboard text), and so the content types (libraries) travel with the filter tree. Bump the version if the
// shape ever changes incompatibly.
const ENVELOPE_TYPE = "airwave/filter";
const ENVELOPE_VERSION = 1;

export type FilterEnvelope = {
  type: typeof ENVELOPE_TYPE;
  v: number;
  mediaTypes: MediaType[];
  filter: FilterGroup;
};

/** Serialize the current content types + filter into the clipboard envelope (pretty-printed). */
export function encodeFilter(mediaTypes: MediaType[], filter: FilterGroup): string {
  const envelope: FilterEnvelope = { type: ENVELOPE_TYPE, v: ENVELOPE_VERSION, mediaTypes, filter };
  return JSON.stringify(envelope, null, 2);
}

export type ParseResult =
  | { ok: true; mediaTypes: MediaType[]; filter: FilterGroup }
  | { ok: false; error: string };

/** Validate + normalize pasted text into a filter + content types, or an explanatory error. */
export function parseFilterEnvelope(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste a copied filter to import." };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "That isn't valid JSON." };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "That isn't an Airwave filter." };

  const obj = raw as Record<string, unknown>;
  if (obj.type !== ENVELOPE_TYPE) return { ok: false, error: "That isn't an Airwave filter." };
  if (obj.v !== ENVELOPE_VERSION) {
    return { ok: false, error: `Unsupported filter version (this app expects v${ENVELOPE_VERSION}).` };
  }

  const mediaTypes = Array.isArray(obj.mediaTypes)
    ? obj.mediaTypes.filter((t): t is MediaType => t === "movie" || t === "show")
    : [];
  if (mediaTypes.length === 0) {
    return { ok: false, error: "The copied filter has no content types (Movies / TV Shows)." };
  }

  return { ok: true, mediaTypes, filter: normalizeFilter(obj.filter) };
}
