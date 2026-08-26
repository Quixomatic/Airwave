import { adminProcedure, router } from "../index";
import { getOnboardingStatus } from "../services/onboarding/status";

export const onboardingRouter = router({
  /** Live onboarding progress for the sidebar "Get set up" checklist (computed from data, no stored state). */
  status: adminProcedure.query(({ ctx }) => getOnboardingStatus(ctx.prisma)),
});
