# Airwave on Unraid

Airwave is a three-container app (server + admin web + Postgres), so on Unraid it installs as a **Docker
Compose stack** via the Compose Manager plugin rather than a single Community Apps template.

It reuses the repo's real [`docker-compose.yml`](../../../docker-compose.yml) (the single source of truth, with
every option) plus the Unraid-tuned [`airwave.env`](./airwave.env) here, so nothing drifts out of sync with the
main compose.

## Install

1. In Community Apps, install **Docker Compose Manager** (by dcflachs) if you don't have it.
2. **Add New Stack** → name it `airwave`.
3. In the stack's **compose** editor, paste the repo's `docker-compose.yml`:
   `https://raw.githubusercontent.com/Quixomatic/Airwave/main/docker-compose.yml`
4. In the stack's **.env** editor, paste [`airwave.env`](./airwave.env) and edit every `CHANGE_ME` value
   (this server's LAN IP, Postgres password, auth secret, admin email/password). Adjust the ports if 36020 /
   36021 are taken.
5. **Compose Up**. First start builds the admin web, so give it a minute.
6. Open `http://UNRAID_IP:36021`, sign in, and connect your Plex server.

Data lives under `/mnt/user/appdata/airwave/` (Postgres + the bumper-music library). Containers run as Unraid's
`nobody:users` (PUID 99 / PGID 100). The `airwave.env` also carries the optional toggles (TV web player, AI
workflow engine, OAuth, extra CORS, remote access) commented out, matching the main `.env.example`.

Full documentation: https://www.getairwave.tv/docs/self-hosting/docker

## Community Apps listing (discovery)

This Compose approach is the clean install path for a multi-container app, but it is **not** a one-click CA
template. To also appear as a searchable entry in Community Apps we would publish per-container template XMLs
(postgres + server + web) in a repo and submit it to the CA moderators. That's a separate, clunkier path and is
deferred; this compose is the recommended install for now.
