import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree } from "./routeTree.gen";
import { queryClient } from "./utils/query";
import "./styles.css";

// A packaged webOS app is served from file:// with no URL bar — use in-memory history
// (real paths/pushState would break). The auth gate (_auth) redirects "/" → "/login"
// when there's no bearer token.
const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
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
