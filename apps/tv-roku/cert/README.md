# Roku certification artifacts (`apps/tv-roku/cert/`)

Submission artifacts for the Roku Channel Store — versioned here because they must be **re-recorded
whenever the login or settings UI changes** (parity discipline, like the rest of the Roku port).

**Published channel ID: `878438`.** The `.rasp` `channels` map uses **`dev`** — Channel Behavior Analysis
installs the submitted package as a dev channel and launches `dev` (confirmed: scripts pass with
`channel_id: dev`), and `dev` is also the id for a local sideload.

## Channel Behavior Analysis `.rasp` scripts

Recorded with the **Roku Remote Tool** (needs the Roku's *Settings → System → Advanced system settings →
Control by mobile apps → Network access = Permissive*, else keypresses 403). They contain only the
`script-login` / `script-password` **template variables** (Roku substitutes the real dashboard test
credentials at run time) + the public demo server URL — **no secrets**.

- **`login.rasp`** — Airwave uses **device-code** login (approved in a browser), which can't be fully
  automated. This script drives as far as automation can: enter the server URL → Connect → on the Login
  screen select the **device-code button** (DOWN then OK — NOT the default Plex button) → **stops at the
  code/QR screen**. The reviewer completes the one manual step (enter the code at the web `/device` page).
  The trailing `text: script-login` / `text: script-password` steps are the dashboard credential variables;
  they're inert in the device-code flow (no in-app field) but kept so the script declares credential use.
- **`logout.rasp`** — full sign-out: from the guide `LEFT`… (into the sidebar) → Account → `OK` → User page
  → Sign out → `OK`, `OK` (two-tap confirm).

Record `login.rasp` from a **logged-out** state (true-uninstall the dev channel first so it boots to the
server screen); `logout.rasp` while logged in on the guide. The tool's `RASP_Scripts.zip` export is
gitignored (`*.zip`) — only the `.rasp` files are versioned.

## Reviewer notes (paste into the dashboard's testing-instructions field)

```
AUTHENTICATION — device-code sign-in (please read)

Airwave connects to a self-hosted server and signs in with a device code approved in a
web browser (there is no in-app username/password field), so sign-in cannot be fully
automated. The sign-in script gets the app to the device-code screen; one manual browser
step completes it:

1. Run the sign-in script (or manually: on "Connect to your server" enter tv.turboforge.io
   and Connect; on the Login screen choose the device-code option).
2. The Roku shows a device code (e.g. ABCD-1234) + a QR code.
3. In a browser go to https://tv-admin.turboforge.io and sign in with the test credentials.
4. Open the Device page (https://tv-admin.turboforge.io/device), enter the code, approve it.
5. The Roku app signs in automatically and loads the channel guide. Select any channel to
   verify playback.

SIGN OUT: run the sign-out script, or Settings → User → Sign out on the Roku.

Notes: the test account has channels assigned so the guide is populated. Playback is live-TV
(continuous channels), not a VOD catalog — there is no per-title deep linking.
```
