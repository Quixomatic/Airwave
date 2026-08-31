// Generates `content/docs/changelog.mdx` from the repo-root CHANGELOG.md at build time — the last N releases
// as a real fumadocs MDX doc page (auto-TOC, search, docs styling). Single source of truth stays CHANGELOG.md;
// this file is derived + gitignored. Run from next.config.mjs (so it fires on every dev/build, including
// Vercel) and standalone (`node scripts/gen-changelog-doc.mjs`).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHANGELOG = resolve(HERE, "../../../CHANGELOG.md"); // apps/site/scripts → repo root
const OUT = resolve(HERE, "../content/docs/changelog.mdx");
const GITHUB_CHANGELOG = "https://github.com/Quixomatic/Airwave/blob/main/CHANGELOG.md";
const COUNT = 20;

const HEADER_RE = /^## \[([^\]]+)\] - (.+)$/;

/** Split the raw changelog into `{ version, date, body }` entries (newest first, as authored). */
function parseEntries(raw) {
  const entries = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) entries.push(cur);
      cur = { version: m[1].trim(), date: m[2].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
    // lines before the first `## [` header (the "# Changelog" intro) are dropped
  }
  if (cur) entries.push(cur);
  return entries;
}

/** Escape MDX-hazard chars ({ } <) in the non-code parts of one line. Inline code (`…`) is left verbatim. */
function escapeOutsideInlineCode(line) {
  return line
    .split(/(`[^`]*`)/g)
    .map((seg, i) =>
      i % 2 === 1
        ? seg // an inline-code span — MDX leaves it literal, so must we
        : seg.replace(/[{}<]/g, (ch) => (ch === "<" ? "&lt;" : "\\" + ch)),
    )
    .join("");
}

/**
 * Make an entry body MDX-safe and keep the TOC to just the version headings:
 * - fenced code blocks (```…) pass through untouched;
 * - `###`+ sub-headings are demoted to bold so they don't clutter the auto-TOC;
 * - stray `{ } <` outside code are escaped (a safety net — recent entries are already clean).
 */
function sanitizeBody(body) {
  const out = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const demoted = line.replace(/^(#{3,})\s+(.+?)\s*$/, (_, _h, text) => `**${text}**`);
    out.push(escapeOutsideInlineCode(demoted));
  }
  return out.join("\n").trim();
}

export function generateChangelogDoc() {
  let raw;
  try {
    raw = readFileSync(CHANGELOG, "utf8");
  } catch (e) {
    // Never break the site build over a missing changelog — just skip generating the page.
    console.warn(`[gen-changelog-doc] CHANGELOG.md not found at ${CHANGELOG}; skipping. (${e.message})`);
    return;
  }
  raw = raw.replace(/\r\n?/g, "\n"); // normalize CRLF (Windows checkout) so per-line regexes match

  const entries = parseEntries(raw).slice(0, COUNT);
  const total = parseEntries(raw).length;

  const sections = entries
    .map((e) => `## ${e.version} (${e.date})\n\n${sanitizeBody(e.body.join("\n"))}`)
    .join("\n\n");

  const mdx = `---
title: Changelog
description: The most recent Airwave releases and what changed in each.
icon: History
---

{/* AUTO-GENERATED from the root CHANGELOG.md by scripts/gen-changelog-doc.mjs — do not edit by hand. */}

The ${entries.length} most recent releases. For the complete history (${total} releases), see [CHANGELOG.md on GitHub](${GITHUB_CHANGELOG}).

${sections}
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, mdx, "utf8");
  console.log(`[gen-changelog-doc] wrote ${OUT} (${entries.length} of ${total} releases)`);
}

// Run when invoked directly (`node scripts/gen-changelog-doc.mjs`).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-changelog-doc.mjs")) {
  generateChangelogDoc();
}
