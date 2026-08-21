import { createFileRoute } from "@tanstack/react-router";

import { DevicePage } from "../../../features/settings/settings-pages";

/** /settings/device — device info, tools, and per-codec capability overrides. */
export const Route = createFileRoute("/_auth/settings/device")({
  component: DevicePage,
});
