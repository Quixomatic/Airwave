# Airwave in Portainer (App Template)

`templates.json` is a Portainer **stack** app template. It deploys Airwave (server + admin web + Postgres) from
the repo's `docker-compose.yml`, prompting for the URLs, admin account, and secrets.

## Add the template

In Portainer: **Settings → App Templates → URL**, paste the raw URL of this file, Save. Airwave then appears
under **App Templates**.

```
https://raw.githubusercontent.com/Quixomatic/Airwave/main/tools/catalogs/portainer/templates.json
```

## Deploy

Open the Airwave template, fill in the fields (Server URL and Admin Web URL must be this host's IP or domain
plus the published ports, e.g. `http://192.168.1.10:36020` / `http://192.168.1.10:36021`, not `localhost`), set
the Postgres password, auth secret (`openssl rand -base64 32`), and admin email/password, then deploy. After it
starts, open the Admin web, sign in, and connect your Plex server.

Full documentation: https://www.getairwave.tv/docs/self-hosting/docker

Note: this is a URL users add themselves, so there is no submission or approval step. Advertise the URL on the
getairwave.tv downloads/docs page. Also works in any Portainer-compatible UI that reads v2 app templates.
