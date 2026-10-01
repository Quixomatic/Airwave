# TrueNAS community app (reference copy)

This is a tracked reference copy of Airwave's submission to the TrueNAS community catalog
(`github.com/truenas/apps`). It exists so future changes have a starting point in the monorepo; the live
submission lives in a fork.

- **Fork:** `Quixomatic/apps` (branch `add-airwave`), opened as draft PR `truenas/apps#5946`.
- **Catalog path (fixed):** `ix-dev/community/airwave/`.
- **Image:** `ghcr.io/quixomatic/airwave`, pinned by digest in `ix_values.yaml`. Bump the tag + digest per release:
  `curl -s "https://ghcr.io/token?scope=repository:quixomatic/airwave:pull"` then a `HEAD` on
  `https://ghcr.io/v2/quixomatic/airwave/manifests/<tag>` reads the `docker-content-digest`.
- **Library:** `templates/library/base_v2_3_15/` is GENERATED (78 files) and is NOT copied here. It is vendored
  into the fork by the validator (`copy-lib`) and must be committed there. `lib_version` / `lib_version_hash` in
  `app.yaml` are filled by that step. Use the latest version in the catalog's top-level `/library/`.

## What's here

The authored files only: `app.yaml`, `item.yaml`, `ix_values.yaml`, `questions.yaml`, `README.md`,
`templates/docker-compose.yaml`, and `templates/test_values/{basic,tvweb}-values.yaml`.

## Validating / updating

Edit here, copy the files into the fork checkout at `ix-dev/community/airwave/`, then run the validator against
that checkout. The validator does atomic writes with `renameat2`, which FAILS on a Docker Desktop Windows bind
mount; run it on Linux, or on Windows against a Docker named volume (ext4):

```
# copy the app (+ the catalog's top-level library/) into an ext4 volume, then:
docker run --platform linux/amd64 --rm -e FAKE_ENV=1 -v tnvol:/workspace \
  ghcr.io/truenas/apps_validation:latest apps_catalog_hash_generate --path /workspace          # copy-lib + hash
docker run --platform linux/amd64 --rm -e FAKE_ENV=1 -v tnvol:/workspace \
  -v //var/run/docker.sock:/var/run/docker.sock:ro ghcr.io/truenas/apps_validation:latest \
  apps_render_app render --path /workspace/ix-dev/community/airwave \
  --values /workspace/ix-dev/community/airwave/templates/test_values/basic-values.yaml          # render
```

The full catalog validation (`apps_dev_charts_validate`) is git-diff based and runs in the PR CI.

## Icon

The logo is tracked at `branding/airwave-logo.svg` (repo root). `app.yaml` / `item.yaml` point `icon` at the
TrueNAS CDN path; link the raw SVG in the PR description and the reviewer uploads it to the CDN.
