# Release patch notes

Curated, human-facing release notes, one file per release: `vX.Y.Z.md`.

These are **not** the changelog. `CHANGELOG.md` is the granular, per-task running log (written by
`/version-bump`). A file here is the polished, categorized announcement for a whole release, coalesced from
every changelog entry since the previous tag.

## How it works

1. The `/release-notes` skill reads the `CHANGELOG.md` entries since the last tag, and (with a human in the
   loop) writes the curated notes to `vX.Y.Z.md` here, then commits it **before** the `vX.Y.Z` tag.
2. `.github/workflows/release-notes.yml` fires on the `v*` tag, reads `vX.Y.Z.md`, and publishes the GitHub
   Release with it as the body. It runs first (no build steps), so the desktop / docker / tv-tauri workflows
   append their per-platform install sections underneath.
3. If `vX.Y.Z.md` is missing at tag time, the workflow falls back to the matching `## [X.Y.Z]` section of
   `CHANGELOG.md`, so a release is never just install instructions.

## Format

No top-level version header (the release title is the version). A short highlights intro, then categorized
sections (Features / Improvements / Fixes / Under the hood / Docs / Breaking), ending with a
`**Full changelog:** …compare/<prev>...vX.Y.Z` link. See the `release-notes` skill for the full contract.

Files here are committed (the workflow reads them at the tag).
