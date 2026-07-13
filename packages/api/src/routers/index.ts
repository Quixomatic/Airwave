import { protectedProcedure, publicProcedure, router } from "../index";
import { bumpersRouter } from "./bumpers";
import { channelsRouter } from "./channels";
import { generatorRouter } from "./generator";
import { jobsRouter } from "./jobs";
import { packagesRouter } from "./packages";
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
  bumpers: bumpersRouter,
  channels: channelsRouter,
  generator: generatorRouter,
  jobs: jobsRouter,
  packages: packagesRouter,
  plex: plexRouter,
  sources: sourcesRouter,
  users: usersRouter,
});
export type AppRouter = typeof appRouter;
