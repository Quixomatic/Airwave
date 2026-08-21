import { createFileRoute } from "@tanstack/react-router";

import { AboutPage } from "../../../features/settings/settings-pages";

/** /settings/about — app identity + version. */
export const Route = createFileRoute("/_auth/settings/about")({
  component: AboutPage,
});
