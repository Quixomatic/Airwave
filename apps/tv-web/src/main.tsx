import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createBrowserHistory,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree } from "./routeTree.gen";
import { queryClient } from "./utils/query";
import "./styles.css";

// Real path routes (`/login`, `/watch/$id`) in the browser — the dev server's SPA
// fallback serves index.html for any path, so you see and can deep-link them. On the
// packaged webOS app (served from file://) fall back to HASH routing, since clean
// paths would 404 on reload there. The auth gate (_auth) redirects "/" → "/login".
const history =
  window.location.protocol === "file:" ? createHashHistory() : createBrowserHistory();

const router = createRouter({
  routeTree,
  history,
  context: { queryClient },
  defaultPreload: "intent",
  // Mount TanStack Query here (the admin's pattern) rather than wrapping <RouterProvider>.
  Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
