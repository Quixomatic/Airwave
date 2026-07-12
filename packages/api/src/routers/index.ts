import { protectedProcedure, publicProcedure, router } from "../index";
import { channelsRouter } from "./channels";
import { jobsRouter } from "./jobs";
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
  channels: channelsRouter,
  jobs: jobsRouter,
  plex: plexRouter,
  sources: sourcesRouter,
  users: usersRouter,
});
export type AppRouter = typeof appRouter;
