import { protectedProcedure, publicProcedure, router } from "../index";
import { plexRouter } from "./plex";
import { sourcesRouter } from "./sources";
import { usersRouter } from "./users";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  plex: plexRouter,
  sources: sourcesRouter,
  users: usersRouter,
});
export type AppRouter = typeof appRouter;
