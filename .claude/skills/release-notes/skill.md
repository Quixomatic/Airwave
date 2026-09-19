---
name: release-notes
description: Cut an Airwave release — read every CHANGELOG entry since the last tag IN FULL, write an exhaustive categorized catalog straight into .release/patch-notes/vX.Y.Z.md as the starting draft, iterate on that file with James, distill the highlights last, then tag on his explicit say-so. The release-notes.yml workflow publishes the file (falling back to the CHANGELOG section if it is missing).
---

# Release notes

Turns the granular running `CHANGELOG.md` into a polished, categorized GitHub Release body, then cuts the
tag. `CHANGELOG.md` stays the source of truth (per-task, written by `/version-bump`); this skill only
curates a per-release announcement from it.

The published body is driven by a file: `.release/patch-notes/vX.Y.Z.md`. The `release-notes.yml` workflow
reads it on the `v*` tag and creates the release with it as the base body (falling back to the matching
`## [X.Y.Z]` CHANGELOG section if the file is absent). The desktop / docker / tv-tauri workflows then append
their per-platform install sections below it.

## The shape of the work

Catalog first, distill last, and **the draft file is the working surface from step one** — not chat. Write
the exhaustive, everything-included catalog into the file immediately, let James review and request tweaks
against that file, and only pare it down to the headline highlights at the very end.

## Usage

```
/release-notes
```

Also triggered when James says "tag a release", "cut the release", or "draft release notes".

## Process

1. **Pin the version and the range.**
   - **Target version** = the top entry in `CHANGELOG.md` (the latest `/version-bump`). Confirm every
     shippable `apps/*/package.json` already agrees on it; if not, STOP, a bump is missing.
   - **From-tag** = the latest existing tag by default (`git tag --sort=-v:refname | head -1`). Show James
     which tag you are diffing from and let him name a different one (e.g. "from v0.12.28" for a recap).
2. **Read the range IN FULL.** Read every `## [x.y.z]` block from `CHANGELOG.md` between the from-tag and the
   target version, the actual `### Added/Changed/Fixed` bullets, not just the one-line summaries. This is the
   "everything" pass: features, fixes, refactors, docs, tooling, platforms, the works. Do not skim to the
   highlights yet.
3. **Write the exhaustive catalog straight to the draft file** `.release/patch-notes/v<target>.md`. This is
   the FIRST artifact and James's review surface. Structure:
   - A top HTML comment marking it a working draft (`<!-- WORKING DRAFT ... -->`); it won't render on GitHub.
   - A `## Highlights` section with a `_(TBD, distill last.)_` placeholder.
   - The full catalog under the section taxonomy (below), grouping multi-version arcs into one bullet each
     (e.g. all the channel-modes work as one feature) so it is comprehensive without being a 50-version dump.
     Keeping version refs like `(0.13.49)` in the working draft is fine, they aid pruning and get stripped
     at finalize.
   - The `**Full changelog:** …/compare/<from-tag>...v<target>` link at the bottom.
   - Em-dash-free from the start (it becomes user-facing copy).
4. **Iterate on the file with James.** He reviews `.release/patch-notes/v<target>.md` and asks for tweaks;
   edit the FILE in place (prune, merge, demote, reword). Keep the conversation about what to change; the
   content lives in the file.
5. **Distill the highlights LAST.** Once the catalog is pruned, replace the `## Highlights` placeholder with
   a 1–2 sentence intro + the handful of headline items. This is the final step, not the first.
6. **Finalize + commit.** Strip the WIP comment and any version-ref scaffolding, confirm the format, and
   commit just that file: `docs: release notes for v<target>`. It MUST be committed before the tag so it
   exists at the tag.
7. **On James's explicit say-so, tag it.** `git tag v<target> <the notes commit>` then
   `git push origin v<target>`. Never tag before he says so (standing rule).
8. **CI takes over.** `release-notes.yml` publishes the release immediately with these notes; the build
   workflows attach assets + append their install sections underneath over the next few minutes.

## Format

- A 1–2 sentence **highlights** intro (what this release is about) — written LAST.
- Categorized sections, omit any that are empty:
  - `## New Features`
  - `## Improvements`
  - `## Fixes`
  - `## Under the hood`
  - `## Docs` (docs pages under `apps/site` ONLY, never site or marketing)
  - `## Platforms` (availability changes)
  - `## Breaking / Migration`
  - No emoji on headings.
- Tight, user-facing bullets. Dedupe items that repeated across patch versions; group related ones.
- End with the compare link: `**Full changelog:** https://github.com/Quixomatic/Airwave/compare/<from-tag>...v<target>`.

The taxonomy is a default, adjust the sections per release if the changes call for it.

## Rules

- **Catalog first, distill last.** Capture everything in the file before paring down; write the highlights at the end.
- **Only reorganize what is already in `CHANGELOG.md`.** Never invent features, fixes, or claims. If the
  changelog doesn't record something (e.g. a store approval), say so and flag it, don't assert it.
- **Never mention site or marketing.** The getairwave.tv home page, hero, promo reel, blog (posts and comments), SEO, analytics, and roadmap UX are OUT of release notes entirely. Only the docs pages under `apps/site` (self-hosting, configuration, local/self-hosted models, and the like) may appear, under Docs.
- **Never edit `CHANGELOG.md`** here, it is the source of truth; this skill reads it.
- **No em dashes** (user-facing copy). Use commas, colons, parentheses, or periods.
- **No commit trailers** (`Co-Authored-By: Claude`, `Claude-Session:`), standing repo rule.
- **Tag only on explicit say-so.** Draft and save freely; tagging waits for James.
- **Trim internal churn** for the final pass: pure version-bump/CI/chore plumbing goes under "Under the hood" or is dropped.

## Do not

- Do NOT draft the notes only in chat, the draft file is the working surface from step one.
- Do NOT create the tag before the notes file is written, finalized, and committed.
- Do NOT push to `main` with `--force`, and do NOT `--no-verify`.
- Do NOT set the GitHub Release body yourself with `gh`, the `release-notes.yml` workflow owns publishing.
