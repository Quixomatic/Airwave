# Airwave promo — voiceover script

One continuous narration, one line per section, in the warm second-person voice of the intro. Lengths are
tuned to each scene's current runtime (scene timings can flex to the real audio when we wire `<Audio>` in).
Suggested audio files: drop each as `assets/vo/<file>` and we'll mount one per `<Sequence>`.

| # | Scene | Scene dur | File | Line |
|---|-------|-----------|------|------|
| 1 | Intro | 5.0s | `01-intro` | *Introducing Airwave... turn your Plex library into your own always-on live TV.* **(done)** |
| 2 | Guide | 5.2s | `02-guide` | It starts with a real channel guide — every channel on its own always-on schedule. |
| 3 | Live | 5.0s | `03-live` | Tune in and join whatever's on right now, mid-program — just like live TV. |
| 4 | DVR | 4.6s | `04-dvr` | There's a DVR, too — rewind, restart, or jump straight back to live. |
| 5 | Surf | 4.8s | `05-surf` | Flip up and down the dial and surf your channels, like an old cable box. |
| 6 | Bumpers | 5.0s | `06-bumpers` | Between shows, clean "Up Next" bumpers — with an optional music bed. |
| 7 | Build | 5.0s | `07-build` | Building a channel is easy — just point a filter at your library and go. |
| 8 | Organize | 5.0s | `08-organize` | Group your channels into packages, and share them with each user, Plex-style. |
| 9 | Everywhere | 3.6s | `09-everywhere` | And it plays on every screen you own. |
| 10 | Optional AI | 5.0s | `10-ai` | Bring your own AI key and let it draft entire lineups — totally optional. |
| 11 | Self-host | 5.4s | `11-selfhost` | And you host it all yourself — up and running in a single command. |
| 12 | Outro | 8.0s | `12-outro` | Your media, your channels — on every screen, and on any server you run. That's Airwave. Get it at getairwave.tv. |

## Read direction
- Warm, confident, unhurried; a light lift on the accent words (guide, live, DVR, surf, bumpers, build, share,
  every screen, AI, host it all).
- Small breath between sections; the reel already fades/blur-swaps between scenes, so pauses land naturally.
- Total spoken ≈ 55-60s, matching the ~61.6s reel with a little room to breathe.

## Wiring (next step, after audio exists)
- Put clips in `assets/vo/` (served via `staticFile("vo/…")`).
- Mount each in its scene's `<Sequence>` as `<Audio src={staticFile(...)} />`; flex each scene's `dur` in
  `src/theme.ts` to its clip length.
- Add a music bed as a top-level `<Audio loop volume={…}>`, ducked under the VO (Remotion volume automation).
