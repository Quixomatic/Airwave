---
name: version-bump
description: Cut a new Airwave release — bump every shippable app package.json in lockstep, write a CHANGELOG.md entry, commit with the changelog entry as the commit body, and push.
---

# Version Bump

Cuts a new release of Airwave: bumps every shippable `apps/*` `package.json` in
lockstep, writes a `CHANGELOG.md` entry, commits with the changelog entry as the message
body, and pushes. Ported from the BasicTimeTracker / OpenServe golden-standard flow.

## Usage

```
/version-bump <patch|minor|major> <short-narrative>
```

Examples:
```
/version-bump patch fix schedule offset drift on tune-in
/version-bump minor add director/actor filter channels
/version-bump major change channel schedule storage format
```

If the user just says "do a version bump" with no tier, infer it from the diff:

- **patch** (x.y.Z) — bug fix, copy tweak, dep bump, narrow refactor.
- **minor** (x.Y.0) — new feature, new integration, new surface, additive schema change.
- **major** (X.0.0) — breaking change, removed surface, incompatible schema.

**Exactly three segments. Never a fourth** (no `0.6.7.1`). If a patch grows too big, ship the
full scope under its `x.y.z`, or roll the leftover into the NEXT `x.y.z` — never a sub-version.

## The bump command (use this — don't hand-edit)

**Do the mechanical file edits with `pnpm version:bump` (`scripts/bump-version.ts`), not by hand:**

```
pnpm version:bump <patch|minor|major|X.Y.Z> [--dry-run]
```

It sets **every** version file in lockstep with TARGETED edits — all `apps/*/package.json` (discovered, not
hardcoded), plus `apps/tv-web/public/appinfo.json`, `apps/tv-native/app.json`,
`apps/tv-tauri/src-tauri/{tauri.conf.json, Cargo.toml, Cargo.lock}`, and `apps/tv-roku/manifest`. The
`airwave` line in the Cargo files is found via its `name = "airwave"` anchor, so a dependency crate can
**never** be bumped by accident (this is why the script exists — see the Cargo.lock footgun below). It
**refuses to run** if the version files are out of sync (surfaces the mismatch instead of normalizing), and
`--dry-run` previews every file without writing.

The script edits version files ONLY. **You still** write the CHANGELOG entry, commit, and push (and never
`git tag` unless James says so). Prefer the script over manual/`sed` edits every time.

## Workspaces in lockstep (what the script touches — reference)

Every shippable app under `apps/*` bumps to the same version (the script discovers them; apps are added over
time). Internal `packages/*` stay at `0.0.0`. The root `package.json` is not bumped. No `v` prefix in
`package.json` (`"version": "1.1.0"`, not `"v1.1.0"`).

These NON-`package.json` version files are bumped in the same lockstep (the script handles them) — they feed
store manifests / About pages and silently drift stale if missed (each has burned us once):
- `apps/tv-native/app.json` → `expo.version` (Expo app version + `Constants.expoConfig.version` About page).
- `apps/tv-web/public/appinfo.json` → `version` (the **webOS** app manifest; required for the `.ipk`
  build + store submission, read at runtime by `webOSTV.js`). Do NOT delete this file.
- `apps/tv-tauri/src-tauri/`: `Cargo.toml` `version`, `tauri.conf.json` `version`, and the `airwave`
  package entry in `Cargo.lock`.
- `apps/tv-roku/manifest` → `major_version` / `minor_version` / `build_version` (e.g. `0.12.3` →
  `major_version=0`, `minor_version=12`, `build_version=3`) + the `Mirrors package.json <ver>` comment.

The script keeps them all in sync automatically; if you ever edit by hand, verify they all match
`apps/*/package.json` before committing.

## Instructions

1. **Read `CHANGELOG.md`** to find the most recent version (top entry). If it doesn't exist
   yet, this is the first release — create it starting at the current app version.
2. **Determine the new version** from the requested tier and the previous version.
3. **Confirm the current version + sync** by running `pnpm version:bump <tier> --dry-run`. It prints the
   `current → next` and every file it would touch, and **refuses to run if the files are out of sync** (it
   surfaces the mismatch). If it reports a mismatch, STOP and tell James — it may be intentional or a botched
   prior bump. Do not silently normalize.
4. **Inspect the staged + unstaged diff** (`git status`, `git diff`, `git diff --staged`) to
   understand what's actually shipping. Do not write the entry from the narrative alone.
5. **Draft the `## [X.Y.Z] - YYYY-MM-DD` entry** in the established format:

   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   <one short paragraph framing what this release is about>

   ### What ships

   - <bulleted list of concrete changes — name files / surfaces / endpoints>

   ### <Optional sub-section>

   <e.g. "Required restart", "Migration", "Breaking changes", "Verification" — only if relevant>
   ```

   Insert the new entry at the top of the file, above the previous top entry.

6. **Show the user the proposed CHANGELOG entry** before writing it, unless previously told to
   proceed autonomously.
7. **Apply the edits:** run `pnpm version:bump <tier|X.Y.Z>` (bumps ALL version files); then write the
   `CHANGELOG.md` entry.
8. **Commit and push:**
   - `git add CHANGELOG.md` + all the bumped version files (`git add apps CHANGELOG.md` covers the app set).
   - Commit subject: `<type>: vX.Y.Z — <short narrative>` — `feat` (minor), `fix` (patch),
     `chore`/`refactor`/`docs`/`revert` as appropriate. Lowercase after colon, imperative,
     ≤72 chars, em-dash between version and narrative.
   - Changelog entry as the message body, passed via HEREDOC.
   - `git push` to the current branch's tracked remote.
9. **Confirm completion** with the new version, commit hash, and remote link if available.

## Cadence

During multi-task implementations, do a **patch bump + commit + push after EACH completed
task** — not batched at the end. Once cadence is established at the start of a session, run it
autonomously per task; show the CHANGELOG entry only if non-trivial or risky.

## Do not

- Do NOT use `git commit --amend` to fold a bump into a prior commit unless asked.
- Do NOT hand-edit the version files when `pnpm version:bump` can do it. If you ever MUST edit
  `apps/tv-tauri/src-tauri/Cargo.lock` by hand, **NEVER global-sed the version string** — a
  `sed 's/0.13.1/0.13.2/g'` also rewrites any dependency crate pinned to that version (it bumped the `phf*`
  crates to a nonexistent version and broke `cargo` + `pnpm dev`, v0.13.2). Change ONLY the `airwave`
  package's `version` line (the one right after `name = "airwave"`). The script does exactly this, safely.
- Do NOT use `--no-verify` to skip pre-commit hooks. Fix the underlying issue instead.
- Do NOT push to `main` with `--force` under any circumstance.
- Do NOT propose a fourth version segment.
- Do NOT `git tag` on your own initiative — tags are James's explicit call every time (a `v*` tag triggers the
  GHCR image build + self-host rollout).
