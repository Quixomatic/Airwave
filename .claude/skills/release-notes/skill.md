---
name: release-notes
description: Cut an Airwave release — read the CHANGELOG entries since the last tag, collaborate on categorized patch notes, save them to .release/patch-notes/vX.Y.Z.md, commit, and tag on James's explicit say-so. The release-notes.yml workflow then publishes them (falling back to the CHANGELOG section if the file is missing).
---

# Release notes

Turns the granular running `CHANGELOG.md` into a polished, categorized GitHub Release body, then cuts the
tag. `CHANGELOG.md` stays the source of truth (per-task, written by `/version-bump`); this skill only
curates a per-release announcement from it.

The published body is driven by a file: `.release/patch-notes/vX.Y.Z.md`. The `release-notes.yml` workflow
reads it on the `v*` tag and creates the release with it as the base body (falling back to the matching
`## [X.Y.Z]` CHANGELOG section if the file is absent). The desktop / docker / tv-tauri workflows then append
their per-platform install sections below it.

## Usage

```
/release-notes
```

Also triggered when James says "tag a release", "cut the release", or "draft release notes".

## Process

1. **Pin the version and the range.**
   - **Target version** = the top entry in `CHANGELOG.md` (the latest `/version-bump`). Confirm every
     shippable `apps/*/package.json` already agrees on it; if not, STOP — a bump is missing.
   - **From-tag** = the latest existing tag by default (`git tag --sort=-v:refname | head -1`). Show James
     which tag you are diffing from and let him name a different one (e.g. "from v0.14.6").
2. **Gather the material.** Read every `## [x.y.z]` block in `CHANGELOG.md` newer than the from-tag, up to
   and including the target version. That range is what this release coalesces.
3. **Draft the notes** in the format below and show them in chat.
4. **Talk it through.** Iterate with James — promote/demote items, cut noise, tighten wording. Do not tag yet.
5. **On approval, save + commit.** Write the final notes to `.release/patch-notes/v<target>.md` (no
   top-level version header — the release title is the version). Commit just that file:
   `docs: release notes for v<target>`. The file MUST be committed before the tag so it exists at the tag.
6. **On James's explicit say-so, tag it.** `git tag v<target> <the notes commit>` then
   `git push origin v<target>`. Never tag before he says so (standing rule).
7. **CI takes over.** `release-notes.yml` publishes the release immediately with these notes; the build
   workflows attach assets + append their install sections underneath over the next few minutes.

## Format

- A 1–2 sentence **highlights** intro (what this release is about).
- Categorized sections, omit any that are empty:
  - `## ✨ Features`
  - `## 🚀 Improvements`
  - `## 🐛 Fixes`
  - `## 🔧 Under the hood`
  - `## 📚 Docs`
  - `## ⚠️ Breaking / Migration`
- Tight, user-facing bullets. Dedupe items that repeated across patch versions; group related ones.
- End with a compare link: `**Full changelog:** https://github.com/Quixomatic/Airwave/compare/<from-tag>...v<target>`.

The taxonomy is a default — adjust the sections per release if the changes call for it.

## Rules

- **Only reorganize what is already in `CHANGELOG.md`.** Never invent features, fixes, or claims.
- **Never edit `CHANGELOG.md`** here — it is the source of truth; this skill reads it.
- **No em dashes** (user-facing copy). Use commas, colons, parentheses, or periods.
- **No commit trailers** (`Co-Authored-By: Claude`, `Claude-Session:`) — standing repo rule.
- **Tag only on explicit say-so.** Draft and save freely; tagging waits for James.
- **Trim internal churn.** Pure version-bump/CI/chore plumbing goes under "Under the hood" or is dropped — the release body is for users, not the commit log.

## Do not

- Do NOT create the tag before the notes file is written and committed.
- Do NOT push to `main` with `--force`, and do NOT `--no-verify`.
- Do NOT set the GitHub Release body yourself with `gh` — the `release-notes.yml` workflow owns publishing.
