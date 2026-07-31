import { adminProcedure, router } from "../index";
import { exportLineup } from "../services/transfer/export";

/**
 * Lineup transfer between Airwave instances — export the full lineup (packages + channels) as a portable
 * JSON blob, and (next) preview + import it via a durable workflow. See `services/transfer/`.
 */
export const transferRouter = router({
  /** The full lineup as a portable JSON object; the client serializes it to a download. */
  export: adminProcedure.query(({ ctx }) => exportLineup(ctx.prisma)),
});
