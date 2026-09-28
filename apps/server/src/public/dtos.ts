import { z } from "@hono/zod-openapi";

/** The standard error envelope for every non-2xx response. */
export const ErrorDTO = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi("Error", { example: { error: { code: "not_found", message: "Channel not found." } } });

/** Reusable error responses to spread into a route's `responses`. */
export const errorResponses = {
  401: {
    description: "Missing or invalid API key.",
    content: { "application/json": { schema: ErrorDTO } },
  },
  404: {
    description: "Resource not found.",
    content: { "application/json": { schema: ErrorDTO } },
  },
  422: {
    description: "Invalid request parameters.",
    content: { "application/json": { schema: ErrorDTO } },
  },
} as const;

/**
 * Both API-key auth styles, for a route's `security`. NOT `as const` — a readonly tuple isn't assignable to
 * openapi3-ts's mutable `SecurityRequirementObject[]`, which made `tsc -b` false-flag every route (and cascade
 * into `never` inference on `c.req.valid(...)`).
 */
export const apiKeySecurity: Array<Record<string, string[]>> = [{ ApiKeyHeader: [] }, { BearerAuth: [] }];

/** A channel's package, as embedded in channel/guide responses. */
export const PackageRefDTO = z
  .object({
    id: z.string(),
    key: z.string().nullable(),
    name: z.string(),
    icon: z.string().nullable(),
    tint: z.string().nullable(),
  })
  .nullable()
  .openapi("PackageRef");

/** How a channel was authored, for at-a-glance provenance. */
export const ProvenanceDTO = z.enum(["preset", "ai", "manual"]).openapi("Provenance");

/**
 * Build the tokenless, host-relative URL for a program's artwork, served by the public artwork proxy
 * (`GET /channels/{channelId}/artwork/{ratingKey}`). Returns null when we can't key it (no channel or no
 * rating key). `kind` selects poster (portrait, default), background (landscape fanart), or thumb; callers pass
 * the right rating key for the kind (e.g. the SHOW's key for an episode's poster). The consumer uses this
 * string as-is and prepends their server's base URL, so the internal image path stays decoupled from the
 * public contract.
 */
export function buildArtworkUrl(
  channelId: string | null | undefined,
  ratingKey: string | null | undefined,
  kind: "poster" | "background" | "thumb" = "poster",
): string | null {
  if (!channelId || !ratingKey) return null;
  return `/api/public/v1/channels/${channelId}/artwork/${ratingKey}?kind=${kind}`;
}

/** A channel's content mode, derived from its definition(s). */
export const ChannelModeDTO = z
  .enum(["filter", "membership", "manual", "mixed"])
  .openapi("ChannelMode", {
    description:
      "How the channel's pool is built: a metadata filter, Plex playlists/collections (membership), a " +
      "hand-picked list (manual), or a mix.",
  });

const programShape = z.object({
  ratingKey: z.string().nullable().describe("The Plex media ratingKey, or null (e.g. an interstitial bumper)."),
  title: z.string(),
  type: z.string().nullable().describe('"movie" | "episode" | "show".'),
  showTitle: z.string().nullable(),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  year: z.number().int().nullable(),
  summary: z.string().nullable(),
  startsAt: z.string().describe("ISO-8601 UTC."),
  endsAt: z.string().describe("ISO-8601 UTC."),
  durationSeconds: z.number().int(),
  artworkUrl: z
    .string()
    .nullable()
    .describe(
      "Ready-to-use, tokenless artwork URL (the portrait poster). Host-relative, so prepend your server's " +
        "base URL and use it directly in an <img> / entity_picture. Null when there's no artwork (e.g. a " +
        "bumper). Backed by GET /channels/{channelId}/artwork/{ratingKey}.",
    ),
});

const programExample = {
  ratingKey: "45217",
  title: "The One With the Blackout",
  type: "episode",
  showTitle: "Friends",
  season: 1,
  episode: 7,
  year: 1994,
  summary: "A blackout traps the gang in various parts of the city.",
  startsAt: "2026-09-27T18:00:00.000Z",
  endsAt: "2026-09-27T18:22:00.000Z",
  durationSeconds: 1320,
  artworkUrl: "/api/public/v1/channels/clx9k2p0a0001abcd/artwork/45210?kind=poster",
};

/** A scheduled program (or bumper) slot. */
export const ProgramDTO = programShape.openapi("Program", { example: programExample });

/** A now/next slot: a Program plus its slot kind and (for the current slot) the live seek offset. */
export const NowSlotDTO = programShape
  .extend({
    kind: z.enum(["program", "bumper"]),
    offsetSeconds: z
      .number()
      .int()
      .optional()
      .describe("Seconds elapsed into the current slot (present on the current slot only)."),
  })
  .openapi("NowSlot", { example: { ...programExample, kind: "program", offsetSeconds: 540 } });
