import { adminProcedure, router } from "../index";
import { syncConnector } from "../services/remote-access/connector";
import {
  cloudServiceEnabled,
  disableRemoteAccess,
  enableRemoteAccess,
  refreshRemoteAccess,
  remoteAccessView,
  unpairRemoteAccess,
} from "../services/remote-access/remote-access";

export const remoteAccessRouter = router({
  // Returns the client-safe view (rotating code + countdown while pending); re-registers with the cloud on
  // each read so a just-bound pairing is picked up (the admin page polls this while pending), then reconciles
  // the tunnel connector with the (possibly newly-bound) state.
  get: adminProcedure.query(async ({ ctx }) => {
    // `featureEnabled` gates the whole Cloud Service UI. When off, refresh/sync self-no-op, so this just
    // returns the (untouched) stored view + the flag, and the settings frame hides itself.
    const view = remoteAccessView(await refreshRemoteAccess(ctx.prisma));
    await syncConnector(ctx.prisma);
    return { ...view, featureEnabled: cloudServiceEnabled() };
  }),

  enable: adminProcedure.mutation(async ({ ctx }) => {
    const view = remoteAccessView(await enableRemoteAccess(ctx.prisma));
    await syncConnector(ctx.prisma);
    return view;
  }),

  disable: adminProcedure.mutation(async ({ ctx }) => {
    const view = remoteAccessView(await disableRemoteAccess(ctx.prisma));
    await syncConnector(ctx.prisma);
    return view;
  }),

  // Deliberately forget the pairing entirely (separate from the OFF toggle, which keeps it).
  unpair: adminProcedure.mutation(async ({ ctx }) => {
    const view = remoteAccessView(await unpairRemoteAccess(ctx.prisma));
    await syncConnector(ctx.prisma);
    return view;
  }),
});
