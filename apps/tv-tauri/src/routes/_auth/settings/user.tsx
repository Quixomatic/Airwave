import { createFileRoute } from "@tanstack/react-router";

import { UserPage } from "../../../features/settings/settings-pages";

/** /settings/user — who's signed in on this device, and signing out. */
export const Route = createFileRoute("/_auth/settings/user")({
  component: UserPage,
});
