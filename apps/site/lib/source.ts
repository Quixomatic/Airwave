import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";

// The `/docs` source, backed by the fumadocs-mdx `content/docs` collection (generated into `.source`).
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
