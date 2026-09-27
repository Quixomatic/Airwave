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

/** Both API-key auth styles, spread into a route's `security`. */
export const apiKeySecurity = [{ ApiKeyHeader: [] }, { BearerAuth: [] }] as const;

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
  artworkPath: z
    .string()
    .nullable()
    .describe("Relative artwork path; serve it through this server's public /img proxy."),
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
  artworkPath: "/library/metadata/45217/thumb",
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
