import { createMDX } from "fumadocs-mdx/next";
import { generateChangelogDoc } from "./scripts/gen-changelog-doc.mjs";

// Regenerate content/docs/changelog.mdx from the root CHANGELOG.md before fumadocs scans the content dir.
// Runs on every `next dev` / `next build` (config is always loaded), so it's reliable on Vercel too.
generateChangelogDoc();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

const withMDX = createMDX();

export default withMDX(config);
