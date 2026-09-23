import { adminProcedure, router } from "../index";
import {
  disableRemoteAccess,
  enableRemoteAccess,
  refreshRemoteAccess,
  remoteAccessView,
  unpairRemoteAccess,
} from "../services/remote-access/remote-access";

export const remoteAccessRouter = router({
  // Returns the client-safe view (rotating code + countdown while pending); re-registers with the cloud on
  // each read so a just-bound pairing is picked up (the admin page polls this while pending).
  get: adminProcedure.query(async ({ ctx }) => remoteAccessView(await refreshRemoteAccess(ctx.prisma))),

  enable: adminProcedure.mutation(async ({ ctx }) => remoteAccessView(await enableRemoteAccess(ctx.prisma))),

  disable: adminProcedure.mutation(async ({ ctx }) => remoteAccessView(await disableRemoteAccess(ctx.prisma))),

  // Deliberately forget the pairing entirely (separate from the OFF toggle, which keeps it).
  unpair: adminProcedure.mutation(async ({ ctx }) => remoteAccessView(await unpairRemoteAccess(ctx.prisma))),
});
