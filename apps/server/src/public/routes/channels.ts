import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { isChannelAllowed } from "@airwave/api/services/access/access";
import { getTimelineWindow } from "@airwave/api/services/playback/broker";
import { getNowNext } from "@airwave/api/services/schedule/generate";
import prisma from "@airwave/db";

import type { PublicVars } from "../context";
import {
  apiKeySecurity,
  ChannelModeDTO,
  errorResponses,
  NowSlotDTO,
  PackageRefDTO,
  ProgramDTO,
  ProvenanceDTO,
} from "../dtos";
import { toNowSlot, toProgram } from "../mappers";

// ── DTO ───────────────────────────────────────────────────────────────────────────
export const ChannelDTO = z
  .object({
    id: z.string(),
    number: z.number().int(),
    name: z.string(),
    callsign: z.string().nullable(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    tint: z.string().nullable(),
    enabled: z.boolean(),
    mode: ChannelModeDTO,
    provenance: ProvenanceDTO,
    package: PackageRefDTO,
    definition: z
      .unknown()
      .optional()
      .openapi({
        description:
          "Present only with ?include=definition. The channel's authoring internals (filter tree / " +
          "membership sources / manual items, plus ordering + strategy). Opaque and NOT covered by the API " +
          "stability guarantee.",
      }),
  })
  .openapi("Channel", {
    example: {
      id: "clx9k2p0a0001abcd",
      number: 101,
      name: "90s Sitcoms",
      callsign: "SITCOM",
      description: "Comfort-watch classics from the decade of the sitcom.",
      icon: "lucide:Tv",
      tint: "amber",
      enabled: true,
      mode: "filter",
      provenance: "preset",
      package: { id: "clx9pkg01", key: "comedy", name: "Comedy & Fun", icon: "lucide:Laugh", tint: "amber" },
    },
  });

// ── mapping ─────────────────────────────────────────────────────────────────────────
export const channelSelect = (withDef: boolean) =>
  ({
    id: true,
    number: true,
    name: true,
    callsign: true,
    description: true,
    icon: true,
    tint: true,
    enabled: true,
    generated: true,
    aiGenerated: true,
    ordering: true,
    sortField: true,
    sortDir: true,
    strategy: true,
    package: { select: { id: true, key: true, name: true, icon: true, tint: true } },
    definitions: {
      orderBy: { sortIndex: "asc" as const },
      select: {
        kind: true,
        mode: true,
        sortIndex: true,
        ...(withDef
          ? { plexFilter: true, plexLibraryKey: true, sources: true, manualItemKeys: true }
          : {}),
      },
    },
  }) as const;

function deriveMode(defs: Array<{ kind: string; mode: string }>): z.infer<typeof ChannelModeDTO> {
  const include = defs.filter((d) => d.mode === "INCLUDE").map((d) => d.kind);
  const kinds = new Set(include.length ? include : defs.map((d) => d.kind));
  if (kinds.size > 1) return "mixed";
  const k = [...kinds][0];
  if (k === "MEMBERSHIP") return "membership";
  if (k === "MANUAL_ITEMS") return "manual";
  return "filter";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toChannelDTO(ch: any, withDef: boolean): z.infer<typeof ChannelDTO> {
  const provenance: z.infer<typeof ProvenanceDTO> = ch.aiGenerated
    ? "ai"
    : ch.generated
      ? "preset"
      : "manual";
  const base: z.infer<typeof ChannelDTO> = {
    id: ch.id,
    number: ch.number,
    name: ch.name,
    callsign: ch.callsign ?? null,
    description: ch.description ?? null,
    icon: ch.icon ?? null,
    tint: ch.tint ?? null,
    enabled: ch.enabled,
    mode: deriveMode(ch.definitions),
    provenance,
    package: ch.package
      ? {
          id: ch.package.id,
          key: ch.package.key ?? null,
          name: ch.package.name,
          icon: ch.package.icon ?? null,
          tint: ch.package.tint ?? null,
        }
      : null,
  };
  if (!withDef) return base;
  return {
    ...base,
    definition: {
      ordering: ch.ordering,
      sortField: ch.sortField,
      sortDir: ch.sortDir,
      strategy: ch.strategy ?? null,
      clauses: ch.definitions.map(
        (d: {
          kind: string;
          mode: string;
          sortIndex: number;
          plexFilter?: unknown;
          plexLibraryKey?: string | null;
          sources?: unknown;
          manualItemKeys?: string[];
        }) => ({
          kind: d.kind,
          mode: d.mode,
          sortIndex: d.sortIndex,
          plexFilter: d.plexFilter ?? null,
          plexLibraryKey: d.plexLibraryKey ?? null,
          sources: d.sources ?? null,
          manualItemKeys: d.manualItemKeys ?? [],
        }),
      ),
    },
  };
}

const wantsDefinition = (include?: string) =>
  (include ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("definition");

// ── routes ──────────────────────────────────────────────────────────────────────────
export const channelRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

const includeQuery = z.object({
  include: z
    .string()
    .optional()
    .openapi({ param: { name: "include", in: "query" }, example: "definition" }),
});

channelRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels",
    tags: ["Channels"],
    summary: "List channels",
    description: "Every channel you can access, in guide order. Add ?include=definition for authoring internals.",
    security: apiKeySecurity,
    request: { query: includeQuery },
    responses: {
      200: {
        description: "Channels.",
        content: { "application/json": { schema: z.object({ channels: z.array(ChannelDTO) }) } },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const access = c.get("access");
    const withDef = wantsDefinition(c.req.valid("query").include);
    const rows = await prisma.channel.findMany({
      where: { enabled: true, ...(access !== "all" ? { id: { in: [...access] } } : {}) },
      orderBy: { number: "asc" },
      select: channelSelect(withDef),
    });
    return c.json({ channels: rows.map((r) => toChannelDTO(r, withDef)) }, 200);
  },
);

channelRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels/by-number/{number}",
    tags: ["Channels"],
    summary: "Get a channel by its guide number",
    security: apiKeySecurity,
    request: {
      params: z.object({ number: z.coerce.number().int().openapi({ example: 101 }) }),
      query: includeQuery,
    },
    responses: {
      200: { description: "Channel.", content: { "application/json": { schema: ChannelDTO } } },
      401: errorResponses[401],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const access = c.get("access");
    const withDef = wantsDefinition(c.req.valid("query").include);
    const row = await prisma.channel.findUnique({
      where: { number: c.req.valid("param").number },
      select: channelSelect(withDef),
    });
    if (!row || !row.enabled || !isChannelAllowed(access, row.id)) {
      return c.json({ error: { code: "not_found", message: "Channel not found." } }, 404);
    }
    return c.json(toChannelDTO(row, withDef), 200);
  },
);

channelRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels/{id}",
    tags: ["Channels"],
    summary: "Get a channel",
    security: apiKeySecurity,
    request: {
      params: z.object({ id: z.string().openapi({ example: "clx9k2p0a0001abcd" }) }),
      query: includeQuery,
    },
    responses: {
      200: { description: "Channel.", content: { "application/json": { schema: ChannelDTO } } },
      401: errorResponses[401],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const access = c.get("access");
    const { id } = c.req.valid("param");
    const withDef = wantsDefinition(c.req.valid("query").include);
    const row = await prisma.channel.findUnique({ where: { id }, select: channelSelect(withDef) });
    if (!row || !row.enabled || !isChannelAllowed(access, id)) {
      return c.json({ error: { code: "not_found", message: "Channel not found." } }, 404);
    }
    return c.json(toChannelDTO(row, withDef), 200);
  },
);

channelRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels/{id}/now",
    tags: ["Channels"],
    summary: "What's on now & next",
    description: "The currently-airing slot (with its live offset) and the one after it.",
    security: apiKeySecurity,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: "Now & next.",
        content: {
          "application/json": {
            schema: z.object({
              current: NowSlotDTO.nullable(),
              next: NowSlotDTO.nullable(),
              endsAt: z.string().nullable().describe("When the materialized schedule runs out; ISO-8601 UTC."),
            }),
          },
        },
      },
      401: errorResponses[401],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!isChannelAllowed(c.get("access"), id)) {
      return c.json({ error: { code: "not_found", message: "Channel not found." } }, 404);
    }
    const nn = await getNowNext(prisma, id);
    return c.json(
      {
        current: nn.current ? toNowSlot(nn.current, nn.current.offsetSeconds) : null,
        next: nn.next ? toNowSlot(nn.next) : null,
        endsAt: nn.endsAt ? nn.endsAt.toISOString() : null,
      },
      200,
    );
  },
);

channelRoutes.openapi(
  createRoute({
    method: "get",
    path: "/channels/{id}/schedule",
    tags: ["Channels"],
    summary: "Upcoming schedule",
    description: "The channel's upcoming programs over the next N hours (default 3, max 24).",
    security: apiKeySecurity,
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({ hours: z.coerce.number().int().min(1).max(24).optional().openapi({ example: 6 }) }),
    },
    responses: {
      200: {
        description: "Upcoming programs.",
        content: {
          "application/json": {
            schema: z.object({
              channelId: z.string(),
              serverTime: z.string(),
              programs: z.array(ProgramDTO),
            }),
          },
        },
      },
      401: errorResponses[401],
      404: errorResponses[404],
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!isChannelAllowed(c.get("access"), id)) {
      return c.json({ error: { code: "not_found", message: "Channel not found." } }, 404);
    }
    const hours = c.req.valid("query").hours ?? 3;
    const win = await getTimelineWindow(prisma, id, 0, hours * 60);
    const programs = win.slots.filter((s) => s.kind === "PROGRAM").map((s) => toProgram(s));
    return c.json({ channelId: id, serverTime: win.serverTime.toISOString(), programs }, 200);
  },
);
