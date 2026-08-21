import { createFileRoute } from "@tanstack/react-router";

import { GeneralPage } from "../../../features/settings/settings-pages";

/** /settings — General (the landing subpage). */
export const Route = createFileRoute("/_auth/settings/")({
  component: GeneralPage,
});
