import { auth } from "@airwave/auth";
import prisma from "@airwave/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    prisma,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
