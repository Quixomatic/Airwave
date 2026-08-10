# Screenshots

These are referenced from the root [`README.md`](../../README.md) (the hero image + the **Screenshots**
section). Current set:

**TV app (Apple TV):** `appletv-guide`, `appletv-fullchrome`, `appletv-fullchrome-programinfo`,
`appletv-channelsurfing`, `appletv-sidebarfilter`, `appletv-bumper`, `appletv-devicesettings`,
`appletv-serversettings`.

**Admin:** `admin-channels`, `admin-channel-details`, `admin-channel-filter`,
`admin-channel-preview-and-schedule`, `admin-packages`, `admin-guidepreview`, `admin-source`,
`admin-users`, `admin-jobs`, `admin-bumpers`, `admin-settings-ai`, `admin-settings-sessions`.

## Conventions

- **Format: `.webp`, quality 80**, native resolution (4K captures come in around ~50–250 KB each —
  crisp on GitHub, tiny in the repo). Convert a new PNG with:
  ```bash
  ffmpeg -i shot.png -c:v libwebp -quality 80 -compression_level 6 shot.webp && rm shot.png
  ```
- **Redact PII** before capture (imported user emails, etc.) — a solid bar is safer than a light blur
  on short strings. (LAN IPs and the Plex server GUID are not sensitive.)
- Keep names descriptive (`surface-what-it-shows`) and reference them from the root README.
