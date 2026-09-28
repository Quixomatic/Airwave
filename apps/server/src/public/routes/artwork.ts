import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { resolveChannelSource } from "@airwave/api/services/playback/broker";
import prisma from "@airwave/db";

import { streamPlexArt } from "../../lib/plex-art";
import type { PublicVars } from "../context";
import { errorResponses } from "../dtos";

export const artworkRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

// poster/thumb map to Plex's portrait `thumb`; background maps to the landscape `art` (fanart).
const ArtKind = z.enum(["poster", "background", "thumb"]).openapi("ArtworkKind");
const artSuffix = (kind: z.infer<typeof ArtKind>) => (kind === "background" ? "art" : "thumb");

/**
 * Public artwork proxy. TOKENLESS on purpose (the auth middleware in ../index.ts skips `/artwork/`): an
 * <img>, a Home Assistant `entity_picture`, or a Tidbyt fetch can't send an API key. It streams a program's
 * art from the channel's own Plex source (resolving the server + admin token from the channel), so the caller
 * never sees a Plex token or a raw `/library/metadata/...` path — those stay internal to the public contract.
 *
 * Consumers should use the `artworkUrl` a program/session hands back rather than hand-building this. When they
 * do build it, they pass the rating key for the art they want (e.g. the SHOW's key for an episode poster);
 * `kind` only selects portrait poster/thumb vs. landscape background.
 */
artworkRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels/{channelId}/artwork/{ratingKey}",
    tags: ["Artwork"],
    summary: "Program artwork (image proxy)",
    description:
      "Streams program artwork from the channel's Plex source. No API key or Plex token needed, so the URL " +
      "drops straight into an <img>, a Home Assistant entity_picture, or a Tidbyt. `kind` selects the poster " +
      "(portrait, default), the background (landscape fanart), or the item's own thumb. Prefer the " +
      "`artworkUrl` a program or session gives you.",
    request: {
      params: z.object({
        channelId: z.string().openapi({ example: "clx9k2p0a0001abcd" }),
        ratingKey: z.string().openapi({ example: "45210" }),
      }),
      query: z.object({
        kind: ArtKind.optional().openapi({ param: { name: "kind", in: "query" }, example: "poster" }),
      }),
    },
    responses: {
      200: {
        description: "The image (streamed from Plex).",
        content: { "image/*": { schema: z.string().openapi({ format: "binary" }) } },
      },
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const { channelId, ratingKey } = c.req.valid("param");
    const kind = c.req.valid("query").kind ?? "poster";
    try {
      const { source } = await resolveChannelSource(prisma, channelId);
      return await streamPlexArt(c, source, `/library/metadata/${ratingKey}/${artSuffix(kind)}`);
    } catch {
      return c.json({ error: { code: "not_found", message: "Artwork not found." } }, 404);
    }
  },
);
