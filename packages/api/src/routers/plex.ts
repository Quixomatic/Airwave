import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import * as plex from "../services/plex/client";
import { importPlexUsers } from "../services/plex/import-users";

export const plexRouter = router({
  /** Current connected Plex server (no token), for the Settings page status. */
  currentSource: adminProcedure.query(async ({ ctx }) => {
    const source = await ctx.prisma.mediaSource.findFirst({
      where: { type: "PLEX" },
      orderBy: { createdAt: "asc" },
    });
    if (!source) return null;
    return {
      id: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      machineIdentifier: source.machineIdentifier,
      webAppUrl: source.webAppUrl,
    };
  }),

  /** Libraries (sections) on the connected server — the basis for channels. */
  libraries: adminProcedure.query(async ({ ctx }) => {
    const source = await ctx.prisma.mediaSource.findFirst({
      where: { type: "PLEX" },
      orderBy: { createdAt: "asc" },
    });
    if (!source?.baseUrl) return [];
    return plex.getLibraries(source.baseUrl, source.token);
  }),

  /** Begin "Sign in with Plex": create a pin + the hosted auth URL. */
  createAuthPin: adminProcedure.mutation(async () => {
    const clientId = crypto.randomUUID();
    const { id, code } = await plex.createPin(clientId);
    return { pinId: id, code, clientId, authUrl: plex.buildAuthUrl(clientId, code) };
  }),

  /** Poll the pin; once approved, return the token + Plex account. */
  checkAuthPin: adminProcedure
    .input(z.object({ pinId: z.number(), clientId: z.string() }))
    .query(async ({ input }) => {
      const token = await plex.getPinToken(input.clientId, input.pinId);
      if (!token) return { authorized: false as const };
      const user = await plex.getPlexUser(input.clientId, token);
      return { authorized: true as const, token, user };
    }),

  /** List the Plex servers this token can reach (owned + shared). */
  listServers: adminProcedure
    .input(z.object({ clientId: z.string(), token: z.string() }))
    .query(async ({ input }) => {
      return plex.getServers(input.clientId, input.token);
    }),

  /** Save the chosen server as the (owner) MediaSource used for all content. */
  saveConnection: adminProcedure
    .input(
      z.object({
        clientId: z.string(),
        token: z.string(),
        name: z.string(),
        machineIdentifier: z.string(),
        baseUrl: z.string().url(),
        webAppUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data = {
        type: "PLEX" as const,
        name: input.name,
        baseUrl: input.baseUrl,
        machineIdentifier: input.machineIdentifier,
        token: input.token,
        clientIdentifier: input.clientId,
        webAppUrl: input.webAppUrl ?? null,
        ownerUserId: ctx.session.user.id,
        enabled: true,
        isDefault: true,
      };
      const existing = await ctx.prisma.mediaSource.findFirst({
        where: { machineIdentifier: input.machineIdentifier },
      });
      const source = existing
        ? await ctx.prisma.mediaSource.update({ where: { id: existing.id }, data })
        : await ctx.prisma.mediaSource.create({ data });
      return { id: source.id, name: source.name, baseUrl: source.baseUrl };
    }),

  /** Import the connected server's shared users as Viewer accounts. */
  importUsers: adminProcedure.mutation(async ({ ctx }) => {
    const source = await ctx.prisma.mediaSource.findFirst({
      where: { type: "PLEX" },
      orderBy: { createdAt: "asc" },
    });
    if (!source) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Connect a Plex server first.",
      });
    }
    return importPlexUsers(ctx.prisma, source);
  }),
});
