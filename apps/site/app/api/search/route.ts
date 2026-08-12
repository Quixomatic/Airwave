import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Static search index built from the docs source (fumadocs' built-in client-side search).
export const { GET } = createFromSource(source, {
  language: "english",
});
