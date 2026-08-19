# Tv Desktop

A native app authored in TypeScript and markup: the logic lives in
`src/core.ts` (Model, Msg, update - the app-core subset, compiled to
native code at build time; no JS runtime ships in the binary) and the
view in `src/app.native`. There is no Zig in this tree and nothing to
configure: the build detects `src/core.ts` and wires everything.

## The loop

```sh
native dev --core   # fastest: run the core's logic under node -
                    # dispatch messages as JSON lines, watch the model
                    # and effect transcript (not a renderer)
native dev          # build and run the real app (markup hot reload)
native check        # verify core.ts (subset checker) + markup + app.json
native build        # ReleaseFast binary in zig-out/bin/
native test         # the app's test suite
```

Edit `src/core.ts` for behavior, `src/app.native` for the view, and
`app.json` for windows/identity/permissions. Markup binds the model's
field names exactly as core.ts wrote them (`tickCount` -> `{tickCount}`),
and exported single-model helpers bind as derived values (`{total}`).

## Try the core loop

```sh
printf '%s\n' '{"kind":"increment"}' '{"kind":"toggle_ticking"}' '{"advance":3000}' | native dev --core
```

## Editor support

Stock editor TypeScript just works: `package.json` and `tsconfig.json`
are the editor-and-versioning surface (the tsconfig mirrors the checker's
own options, so editor errors match `native check`), and
`node_modules/@native-sdk/core` is a CLI-managed copy of the SDK package
so `@native-sdk/core` resolves with full IntelliSense. Builds never read
any of it — delete node_modules and every `native` verb still works; the
next `native check`/`dev`/`build` puts it back. Running `npm install`
is optional for the same reason: the CLI materializes and refreshes the
package itself, and an install simply lands the identical content once
`@native-sdk/core` is on npm.

## Requirements

Node.js 24+ on PATH (the TypeScript frontend
and the core compiler run at build time; your shipped binary carries
none of it).
