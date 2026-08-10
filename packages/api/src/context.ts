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
    // The raw request headers — carried through so a procedure can call better-auth server APIs
    // that authenticate the caller via the session cookie (e.g. auth.api.createUser). getSession
    // already read them above; we just also expose them instead of discarding them.
    headers: context.req.raw.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
