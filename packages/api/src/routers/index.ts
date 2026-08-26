import { protectedProcedure, publicProcedure, router } from "../index";
import { aiRouter } from "./ai";
import { bumperMusicRouter } from "./bumper-music";
import { bumpersRouter } from "./bumpers";
import { channelsRouter } from "./channels";
import { generatorRouter } from "./generator";
import { jobsRouter } from "./jobs";
import { onboardingRouter } from "./onboarding";
import { packagesRouter } from "./packages";
import { playbackRouter } from "./playback";
import { plexRouter } from "./plex";
import { sourcesRouter } from "./sources";
import { transferRouter } from "./transfer";
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
  ai: aiRouter,
  bumperMusic: bumperMusicRouter,
  bumpers: bumpersRouter,
  channels: channelsRouter,
  generator: generatorRouter,
  jobs: jobsRouter,
  onboarding: onboardingRouter,
  packages: packagesRouter,
  playback: playbackRouter,
  plex: plexRouter,
  sources: sourcesRouter,
  transfer: transferRouter,
  users: usersRouter,
});
export type AppRouter = typeof appRouter;
