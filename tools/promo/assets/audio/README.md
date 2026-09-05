# Promo audio (local-only)

This folder is tracked so the layout stays in the repo, but **its audio contents are gitignored** — the
`.mp3` files live only on your machine (they're large, and often regenerated). Drop files here and the reel
picks them up.

## Layout

```
assets/audio/
  vo/       voiceover — one clip per scene
  music/    the background music bed
```

## Voiceover (`vo/`)

One line per scene (script: `tools/promo/vo-script.md`). Filenames the reel expects (see `VO` in
`src/theme.ts`):

| File | Scene |
|------|-------|
| `vo/01-intro.mp3` | Intro |
| `vo/02-guide.mp3` | The guide |
| `vo/03-live.mp3` | Live TV |
| `vo/04-dvr.mp3` | DVR / restart |
| `vo/05-surf.mp3` | Channel surf |
| `vo/06-bumpers.mp3` | Bumpers |
| `vo/07-build.mp3` | Build a channel |
| `vo/08-organize.mp3` | Organize & share |
| `vo/09-everywhere.mp3` | Every screen |
| `vo/10-ai.mp3` | Optional AI |
| `vo/11-selfhost.mp3` | Self-host |
| `vo/12-outro.mp3` | Outro |

After dropping a clip, flip its `have: true` in the `VO` array in `src/theme.ts` — only `have` clips are
mounted (so a missing file never 404s Studio) and only `have` clips duck the music.

## Music bed (`music/`)

Drop one file (e.g. `music/bed.mp3`) and set `MUSIC_BED = "audio/music/bed.mp3"` in `src/theme.ts`. It loops
under the whole reel, fades in/out at the ends, and ducks under the narration automatically
(`MUSIC_VOL` / `MUSIC_DUCK` in theme.ts).

Paths in `theme.ts` are relative to `assets/` (Remotion `staticFile`, `setPublicDir("assets")`), so they read
`audio/vo/…` and `audio/music/…`.
