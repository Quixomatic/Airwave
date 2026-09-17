import { createMDX } from "fumadocs-mdx/next";
import { generateChangelogDoc } from "./scripts/gen-changelog-doc.mjs";
import { syncInstallAssets } from "./scripts/sync-install-assets.mjs";

// Regenerate content/docs/changelog.mdx from the root CHANGELOG.md before fumadocs scans the content dir.
// Runs on every `next dev` / `next build` (config is always loaded), so it's reliable on Vercel too.
generateChangelogDoc();

// Copy the one-line installer assets into public/ (served at /install.sh, /install.ps1, /docker-compose.yml).
syncInstallAssets();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

const withMDX = createMDX();

export default withMDX(config);
