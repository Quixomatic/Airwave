import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { TitleBar } from "./components/TitleBar";
import { ServerSetup } from "./screens/ServerSetup";
import { hasServerUrl } from "./lib/server-url";
import { initStore } from "./lib/store";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./utils/query";
import "./styles.css";

// HASH history for the packaged desktop app: it's served from a custom protocol
// (`http://tauri.localhost`), where clean-path deep-links / reloads would 404. The
// `_auth` gate redirects "/" → "/login" when there's no token. Query is mounted via
// the router's `Wrap` (tv-web's pattern), not by wrapping <RouterProvider>.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
  defaultPreload: "intent",
  Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Hydrate the persisted store (server URL, token) BEFORE rendering so the onboarding gate + the
// route guards read live values. The custom titlebar is global chrome (above the router + setup).
// Until a server is onboarded, show ServerSetup instead of the router; onboarding stores the URL
// and reloads, so everything below re-initialises against it.
initStore().then(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <TitleBar />
      <div className="app-viewport">
        {hasServerUrl() ? <RouterProvider router={router} /> : <ServerSetup />}
      </div>
    </StrictMode>,
  );
});
