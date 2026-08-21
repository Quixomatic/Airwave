import { createFileRoute } from "@tanstack/react-router";

import { ServerPage } from "../../../features/settings/settings-pages";

/** /settings/server — the connected Airwave server and how this device reaches Plex. */
export const Route = createFileRoute("/_auth/settings/server")({
  component: ServerPage,
});
