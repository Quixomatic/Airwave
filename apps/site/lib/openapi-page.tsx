"use client";

import { createOpenAPIPage } from "fumadocs-openapi/ui";

// The client component that renders an operation (or page of operations) with the interactive playground.
// Kept in its own "use client" module so the server-only openapi instance (which reads the spec) never leaks
// into the client bundle.
export const APIPage = createOpenAPIPage();
