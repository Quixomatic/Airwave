# Contributing to Airwave

First off, thanks for being here. I build Airwave as one person, and I made it source-available on
purpose: I want people to dig in, learn from it, and make it their own.

## Make it yours (no permission needed)

Airwave is source-available under the [PolyForm Perimeter License](./LICENSE). You can already fork it,
read every line, and change anything you want on your own copy. A different port, a tweaked layout, an
extra channel strategy, a wild experiment? Just do it in your fork. You do not need an issue, a blessing,
or a merged PR to run your own changes. That freedom is the whole point.

So before anything below: if your change is really just for you, you already have everything you need.
Contributing back is a separate, optional thing.

## Contributing back

Pull requests are genuinely welcome, and I do merge them. One bit of honesty so nobody feels blindsided:
I am actively building Airwave solo, with a specific direction in mind. For small or housekeeping-style
changes I may just implement the thing myself, the way it fits the rest of the codebase, and close your
PR. That is not personal and it does not mean you were wrong. It usually just means it was faster for me
to fold it in than to review and reconcile a separate change.

What reliably lands:

- **Real bug fixes**, ideally with steps to reproduce and a clear explanation of the cause.
- **Enhancements and features** that move the project, especially ones already on the roadmap (see the
  README and getairwave.tv): Jellyfin/Emby support, a Samsung Tizen client, a manual schedule editor,
  rotation weighting, performance, accessibility.
- **New platform or integration work**, or a meaningful improvement to something that already exists.

What is usually not worth a PR (open an issue or just message me instead):

- Port, env, or config tweaks that are really personal preference.
- README or docs wording, typos, or link fixes.
- Formatting-only or lint-only churn.
- Dependency bumps with no concrete reason.
- Renames or file moves for their own sake.
- Half-finished work. If it is a work in progress, open it as a Draft PR and say so.

None of those are "bad." They are just things I would rather hear about in an issue and handle in one
pass, so please flag them there instead of opening a PR.

## Before a big PR, open an issue first

If you are planning something substantial, please open an issue or a Discussion before you build it. I
would much rather talk through the approach up front than have you spend a weekend on something that does
not fit the direction and then have to turn it down. A quick "I want to add X, planning to do it like Y,
sound good?" saves everyone time.

## Working in the repo

Airwave is a pnpm + Turborepo monorepo. The fastest way in:

```bash
git clone https://github.com/Quixomatic/Airwave.git
cd Airwave
pnpm install
pnpm dev:setup      # interactive first-run setup (add --dry-run to preview)
pnpm dev:core       # server + admin web + tv-web
```

Full walkthrough: the [Local Development](https://www.getairwave.tv/docs/development) docs page.

A few things that make a PR easy to accept:

- **Keep it focused.** One logical change per PR. A fix, a refactor, and a dependency bump in one PR is
  three reviews in a trench coat.
- **Match the surrounding code.** Follow the conventions and style already in the file you are editing.
- **Typecheck before you push:** `pnpm check-types`.
- **Write a clear description.** What changed, why, and how you tested it. A screenshot or short clip
  helps for anything visual.

## Reporting bugs and ideas

- **Bugs:** open an Issue. Include what you expected, what happened, steps to reproduce, your
  platform/device, and any relevant logs.
- **Ideas, questions, "would you take X?":** open a Discussion (or an issue if you prefer). This is also
  the right place for the small stuff mentioned above.

## Code of conduct

Taking part in this project means following the [Code of Conduct](./CODE_OF_CONDUCT.md). Be decent to each
other.

## License

Airwave is source-available under the [PolyForm Perimeter License](./LICENSE), and contributions become
part of the project under that same license. As the copyright holder I publish the official prebuilt apps
(a small paid convenience); everything else is free to self-host and modify. The README's
[License](./README.md#license) section has the plain-English version.

Thanks again for being here.
