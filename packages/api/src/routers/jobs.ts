import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { cancelJob, listJobs, runJob, setJobSchedule } from "../services/jobs/scheduler";

export const jobsRouter = router({
  list: adminProcedure.query(() => listJobs()),

  /** Trigger a job now (fire-and-forget; status is polled via `list`). */
  run: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    void runJob(input.id);
    return { ok: true };
  }),

  cancel: adminProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    const ok = cancelJob(input.id);
    if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
    return { ok: true };
  }),

  setSchedule: adminProcedure
    .input(z.object({ id: z.string(), schedule: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const ok = await setJobSchedule(input.id, input.schedule);
      if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid job schedule." });
      return { ok: true };
    }),
});
