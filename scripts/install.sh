#!/bin/sh
# ============================================================================
#  Airwave one-line installer (Docker path)
#
#    curl -fsSL https://getairwave.tv/install.sh | sh
#    curl -fsSL https://getairwave.tv/install.sh | sh -s -- --version 0.14.13
#    curl -fsSL https://getairwave.tv/install.sh | AIRWAVE_VERSION=0.14.13 sh
#    curl -fsSL https://getairwave.tv/install.sh | sh -s -- --dry-run
#    curl -fsSL https://getairwave.tv/install.sh | sh -s -- --uninstall
#
#  Installs (or updates) a self-hosted Airwave server with docker compose: checks
#  Docker, writes docker-compose.yml + .env into a target dir, and brings the
#  stack up. Re-running against an existing install UPDATES it in place, keeping
#  your secrets. Latest by default; pin with --version / AIRWAVE_VERSION.
#
#  Pretty prompts via `gum` (charmbracelet/gum): used if installed, otherwise
#  auto-downloaded (checksum-verified) to a temp dir, otherwise plain prompts.
#
#  Plan + rationale: .plans/curl-sh-installer.md
# ============================================================================
set -eu

# ---- Constants -------------------------------------------------------------
IMAGE_REPO="ghcr.io/quixomatic/airwave"
COMPOSE_URL="${AIRWAVE_COMPOSE_URL:-https://getairwave.tv/docker-compose.yml}"
MARKER=".airwave-install"
GUM_VERSION="2.0.1"
TTY=/dev/tty

# ---- args ------------------------------------------------------------------
VERSION="${AIRWAVE_VERSION:-latest}"
DIR="${AIRWAVE_DIR:-./airwave}"
MODE=install
PURGE=0
DRY_RUN="${AIRWAVE_DRY_RUN:-0}"

usage() {
  cat <<EOF
Airwave installer

Usage:
  install.sh [--version <tag>] [--dir <path>] [--dry-run] [--yes]      install / update
  install.sh --uninstall [--dir <path>] [--purge] [--dry-run] [--yes]  remove

  --version <tag>   Image tag to run (e.g. 0.14.13 or 0.14). Default: latest.
  --dir <path>      Stack directory. Default: ./airwave
  --dry-run, -n     Walk the whole flow and print what WOULD happen; write
                    nothing, pull nothing, start nothing. Safe to test.
  --uninstall       Stop and remove the Airwave containers. Keeps your data
                    (Postgres + bumper music) and the directory unless --purge.
  --purge           With --uninstall: ALSO delete the data volumes and the
                    directory. Destructive and irreversible.
  -y, --yes         Non-interactive; accept defaults / update in place. (With
                    --uninstall it will NOT delete data unless you pass --purge.)
  -h, --help        This help.

Environment overrides: AIRWAVE_VERSION, AIRWAVE_DIR, AIRWAVE_DRY_RUN=1,
AIRWAVE_NONINTERACTIVE=1, AIRWAVE_NO_GUM=1, AIRWAVE_COMPOSE_URL, and any compose
var (SERVER_PORT, SERVER_PUBLIC_URL, …).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION=${2:-}; shift 2 ;;
    --version=*) VERSION=${1#*=}; shift ;;
    --dir) DIR=${2:-}; shift 2 ;;
    --dir=*) DIR=${1#*=}; shift ;;
    --uninstall|--remove) MODE=uninstall; shift ;;
    --purge) PURGE=1; shift ;;
    -n|--dry-run) DRY_RUN=1; shift ;;
    -y|--yes|--noninteractive) AIRWAVE_NONINTERACTIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'ignoring unknown option: %s\n' "$1" >&2; shift ;;
  esac
done
VERSION=${VERSION#v}
[ -z "$VERSION" ] && VERSION=latest
CG_IMAGE="${IMAGE_REPO}:${VERSION}"
DCOMPOSE="docker compose"   # resolved for real in preflight

dryrun() { [ "$DRY_RUN" = 1 ]; }

# ---- color fallback (used only when gum is unavailable) --------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m'); RED=$(printf '\033[31m')
  GRN=$(printf '\033[32m'); YEL=$(printf '\033[33m'); CYN=$(printf '\033[36m'); RST=$(printf '\033[0m')
else
  BOLD=''; DIM=''; RED=''; GRN=''; YEL=''; CYN=''; RST=''
fi

# ---- helpers ---------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch URL -> stdout
  if have curl; then curl -fsSL "$1"
  elif have wget; then wget -qO- "$1"
  else printf '%s\n' "need curl or wget to download files" >&2; exit 1; fi
}

# ---- gum bootstrap (pretty prompts) ----------------------------------------
GUM=''        # command/path to gum, empty = plain fallback
GUM_TMP=''
cleanup() { [ -n "$GUM_TMP" ] && rm -rf "$GUM_TMP" 2>/dev/null; return 0; }
trap cleanup EXIT INT TERM

setup_gum() {
  [ -n "${AIRWAVE_NO_GUM:-}" ] && return 0
  if have gum; then GUM=gum; return 0; fi
  have tar || return 0
  _os=$(uname -s 2>/dev/null || echo unknown)
  _arch=$(uname -m 2>/dev/null || echo unknown)
  case "$_os" in Linux) _gos=Linux ;; Darwin) _gos=Darwin ;; *) return 0 ;; esac
  case "$_arch" in
    x86_64|amd64) _garch=x86_64 ;;
    aarch64|arm64) _garch=arm64 ;;
    *) return 0 ;;
  esac
  _asset="gum_${GUM_VERSION}_${_gos}_${_garch}.tar.gz"
  _base="https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}"
  GUM_TMP=$(mktemp -d 2>/dev/null) || { GUM_TMP=''; return 0; }
  fetch "${_base}/${_asset}" > "${GUM_TMP}/${_asset}" 2>/dev/null || return 0
  # Verify SHA256 against the release checksums.txt (best effort).
  if have sha256sum || have shasum; then
    if fetch "${_base}/checksums.txt" > "${GUM_TMP}/checksums.txt" 2>/dev/null; then
      _want=$(grep "  ${_asset}\$" "${GUM_TMP}/checksums.txt" 2>/dev/null | awk '{print $1}')
      if [ -n "$_want" ]; then
        if have sha256sum; then _got=$(sha256sum "${GUM_TMP}/${_asset}" | awk '{print $1}')
        else _got=$(shasum -a 256 "${GUM_TMP}/${_asset}" | awk '{print $1}'); fi
        if [ "$_want" != "$_got" ]; then
          printf '%s\n' "${YEL}!${RST} gum checksum mismatch — using plain prompts" >&2
          return 0
        fi
      fi
    fi
  fi
  ( cd "$GUM_TMP" && tar -xzf "$_asset" ) 2>/dev/null || return 0
  _g=$(find "$GUM_TMP" -type f -name gum 2>/dev/null | head -n1)
  [ -n "$_g" ] && chmod +x "$_g" 2>/dev/null && GUM=$_g
  return 0
}

# ---- output (gum-styled when available) ------------------------------------
banner() {
  if [ -n "$GUM" ]; then
    "$GUM" style --border rounded --padding "0 2" --margin "1 0" --border-foreground 212 --foreground 212 --bold "$*"
  else
    printf '\n%s\n\n' "${CYN}${BOLD}=== $* ===${RST}"
  fi
}
section() {
  if [ -n "$GUM" ]; then "$GUM" style --bold --foreground 213 --margin "1 0 0 0" "$*"
  else printf '\n%s\n' "${CYN}${BOLD}$*${RST}"; fi
}
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s\n' "${GRN}✓${RST} $*"; }
warn() { printf '%s\n' "${YEL}!${RST} $*" >&2; }
die()  { printf '%s\n' "${RED}✗ $*${RST}" >&2; exit 1; }
plan() { printf '%s\n' "${DIM}[dry-run]${RST} would $*"; }   # dry-run narration

# ---- prompts (gum when available, /dev/tty read otherwise) ------------------
have_tty() { [ -e "$TTY" ] && [ -r "$TTY" ]; }
noninteractive() { [ "${AIRWAVE_NONINTERACTIVE:-}" = "1" ] || ! have_tty; }

prompt() { # prompt VAR "Question" "default"  (env value of VAR, if set, wins as default)
  _v=$1; _q=$2; _d=${3:-}
  eval "_cur=\${$_v:-}"; [ -n "$_cur" ] && _d=$_cur
  if noninteractive; then eval "$_v=\$_d"; return 0; fi
  if [ -n "$GUM" ]; then
    _ans=$("$GUM" input --prompt "$_q » " --value "$_d" --placeholder "$_d" < "$TTY") || _ans=$_d
  else
    if [ -n "$_d" ]; then printf '%s [%s]: ' "$_q" "$_d" > "$TTY"; else printf '%s: ' "$_q" > "$TTY"; fi
    IFS= read -r _ans < "$TTY" || _ans=''
  fi
  [ -z "$_ans" ] && _ans=$_d
  eval "$_v=\$_ans"
}

confirm() { # confirm "Question" -> 0 = yes. Non-interactive defaults to NO.
  if noninteractive; then return 1; fi
  if [ -n "$GUM" ]; then "$GUM" confirm "$1" < "$TTY"; return $?; fi
  printf '%s [y/N]: ' "$1" > "$TTY"
  IFS= read -r _a < "$TTY" || _a=''
  case "$_a" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

run() { # run a step, with a gum spinner when available; dry-run narrates only
  _title=$1; shift
  if dryrun; then plan "run: $*"; return 0; fi
  if [ -n "$GUM" ]; then "$GUM" spin --spinner dot --title "$_title" -- "$@"
  else section "$_title"; "$@"; fi
}

# ---- secret + env helpers --------------------------------------------------
gen_hex() { # URL-safe (goes into DATABASE_URL): hex only
  if have openssl; then openssl rand -hex 24
  elif [ -r /dev/urandom ]; then LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | dd bs=1 count=48 2>/dev/null
  else die "need openssl or /dev/urandom to generate secrets"; fi
}
gen_b64() { # BETTER_AUTH_SECRET: not in a URL, base64 is fine
  if have openssl; then openssl rand -base64 48 | tr -d '\n'
  elif [ -r /dev/urandom ]; then head -c 48 /dev/urandom | base64 | tr -d '\n'
  else die "need openssl or /dev/urandom to generate secrets"; fi
}
lan_ip() {
  # Enumerate real (non-loopback, non-virtual) IPv4s, then prefer a home LAN address — the same order the
  # desktop server uses: 192.168.x, then 172.16-31.x, then 10.x, then anything. A TV must be able to reach
  # this, so 127.0.0.1 is only the last resort. (Trusting the default route alone can hand back a
  # Docker/VPN address that TVs can't reach.)
  _cands=''
  if have ip; then
    _cands=$(ip -4 -o addr show scope global 2>/dev/null \
      | grep -Ev '[[:space:]](docker|veth|br-|virbr|tailscale|wg|tun|tap|zt|vmnet|utun)[0-9a-z]*[[:space:]]' \
      | awk '{print $4}' | sed 's#/.*##')
  fi
  if [ -z "$_cands" ] && have ifconfig; then
    _cands=$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | sed 's/^addr://' | grep -v '^127\.')
  fi
  _pick=''
  for _p in '^192\.168\.' '^172\.(1[6-9]|2[0-9]|3[01])\.' '^10\.' '^[0-9]'; do
    _pick=$(printf '%s\n' $_cands | grep -E "$_p" | head -n1)
    [ -n "$_pick" ] && break
  done
  [ -z "$_pick" ] && _pick=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
  _pick=$(printf '%s' "$_pick" | head -n1 | grep -Eo '[0-9]{1,3}(\.[0-9]{1,3}){3}' | head -n1)
  printf '%s' "${_pick:-127.0.0.1}"
}
set_env() { # update-or-append KEY=VALUE in ./.env (no sed; values may hold / : @ +)
  _k=$1; _val=$2
  if [ -f .env ] && grep -q "^${_k}=" .env 2>/dev/null; then
    _tmp=$(mktemp)
    while IFS= read -r _line || [ -n "$_line" ]; do
      case "$_line" in "${_k}="*) printf '%s=%s\n' "$_k" "$_val" ;; *) printf '%s\n' "$_line" ;; esac
    done < .env > "$_tmp"
    mv "$_tmp" .env
  else
    printf '%s=%s\n' "$_k" "$_val" >> .env
  fi
}

# ============================================================================
setup_gum || true
banner "Airwave ${MODE}$( dryrun && printf ' (dry run)' )"

# ---- preflight -------------------------------------------------------------
if have docker; then
  if docker info >/dev/null 2>&1; then :; else
    if dryrun; then warn "Docker daemon not reachable (dry-run: continuing)."; else
      die "Docker is installed but its daemon isn't reachable. Is it running? Do you need the 'docker' group (or sudo)?"; fi
  fi
  if docker compose version >/dev/null 2>&1; then DCOMPOSE="docker compose"
  elif have docker-compose; then DCOMPOSE="docker-compose"
  else
    if dryrun; then warn "Docker Compose v2 not found (dry-run: continuing)."; else
      die "Docker Compose v2 not found. Install the compose plugin: https://docs.docker.com/compose/install/"; fi
  fi
  ok "Docker is ready"
else
  if dryrun; then warn "Docker not found (dry-run: continuing so you can preview the flow)."; else
    die "Docker isn't installed. Get it at https://docs.docker.com/get-docker/ (Linux: curl -fsSL https://get.docker.com | sh), then re-run."; fi
fi

# ---- uninstall -------------------------------------------------------------
if [ "$MODE" = uninstall ]; then
  [ -d "$DIR" ] || die "no Airwave install directory at $DIR (use --dir to point at it)."
  cd "$DIR" || die "can't enter $DIR"
  DIR_ABS=$(pwd)
  { [ -f docker-compose.yml ] || [ -f "$MARKER" ]; } || die "no Airwave install found in ${DIR_ABS}."

  run "Stopping Airwave" $DCOMPOSE down || warn "compose down reported an error (containers may already be gone)."
  dryrun || ok "Removed the Airwave containers."

  REMOVE_DATA=0
  if [ "$PURGE" = 1 ]; then REMOVE_DATA=1
  elif confirm "Also DELETE all data (the Postgres database + bumper music)? This cannot be undone"; then REMOVE_DATA=1; fi

  if [ "$REMOVE_DATA" = 1 ]; then
    run "Deleting data volumes" $DCOMPOSE down -v || warn "couldn't remove the data volumes."
    dryrun || ok "Deleted the data volumes."
    REMOVE_DIR=0
    if [ "$PURGE" = 1 ]; then REMOVE_DIR=1
    elif confirm "Delete the install directory ${DIR_ABS} (.env, docker-compose.yml)?"; then REMOVE_DIR=1; fi
    if [ "$REMOVE_DIR" = 1 ]; then
      if dryrun; then plan "delete ${DIR_ABS}"; else cd .. && rm -rf "$DIR_ABS" && ok "Deleted ${DIR_ABS}."; fi
    fi
    say ""; ok "Airwave fully removed.$( dryrun && printf ' (dry run — nothing changed)' )"
  else
    say ""; ok "Airwave stopped. Your data volumes and ${DIR_ABS} were kept."
    say "  Start it again:  ${DIM}cd ${DIR_ABS} && docker compose up -d${RST}"
    say "  Delete data too: ${DIM}re-run with --uninstall --purge${RST}"
  fi
  exit 0
fi

# ---- resolve dir + detect existing install ---------------------------------
EXISTING=0
if [ -f "${DIR}/${MARKER}" ] && [ -f "${DIR}/.env" ]; then EXISTING=1; fi
if dryrun; then
  DIR_ABS=$DIR
  [ -d "$DIR" ] && { cd "$DIR" && DIR_ABS=$(pwd); }
else
  mkdir -p "$DIR" || die "can't create $DIR"
  cd "$DIR" || die "can't enter $DIR"
  DIR_ABS=$(pwd)
fi

# ---- configure -------------------------------------------------------------
GEN_PW=0
if [ "$EXISTING" = 1 ]; then
  section "Existing install found in ${DIR_ABS} — updating in place (keeping your settings)."
  if dryrun; then
    plan "back up .env -> .env.bak"; plan "set CG_IMAGE=${CG_IMAGE} in .env"
    SERVER_PUBLIC_URL=$(grep '^SERVER_PUBLIC_URL=' "${DIR}/.env" 2>/dev/null | cut -d= -f2-)
    WEB_PUBLIC_URL=$(grep '^WEB_PUBLIC_URL=' "${DIR}/.env" 2>/dev/null | cut -d= -f2-)
  else
    cp .env .env.bak
    set_env CG_IMAGE "$CG_IMAGE"
    SERVER_PUBLIC_URL=$(grep '^SERVER_PUBLIC_URL=' .env | cut -d= -f2-)
    WEB_PUBLIC_URL=$(grep '^WEB_PUBLIC_URL=' .env | cut -d= -f2-)
  fi
else
  section "Setting up a new Airwave server in ${DIR_ABS}"
  say "${DIM}The public URLs must be reachable from your browser and TVs (a LAN IP or"
  say "domain), not localhost. Press Enter to accept each default.${RST}"
  IP=$(lan_ip)
  prompt SERVER_PORT "Server (API) port" "36020"
  prompt WEB_PORT    "Admin web port"    "36021"
  prompt SERVER_PUBLIC_URL "Server public URL" "http://${IP}:${SERVER_PORT}"
  prompt WEB_PUBLIC_URL    "Admin web public URL" "http://${IP}:${WEB_PORT}"
  prompt ADMIN_EMAIL "First admin email" "admin@example.com"
  prompt ADMIN_PASSWORD "First admin password (blank = generate one)" ""
  if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD=$(gen_hex | cut -c1-24); GEN_PW=1; fi
  POSTGRES_PASSWORD=$(gen_hex)
  BETTER_AUTH_SECRET=$(gen_b64)
  PUID=$(id -u 2>/dev/null || echo 1000)
  PGID=$(id -g 2>/dev/null || echo 1000)
  TZ_VAL=${TZ:-$(cat /etc/timezone 2>/dev/null || echo UTC)}

  if dryrun; then
    plan "write .env (SERVER_PUBLIC_URL=${SERVER_PUBLIC_URL}, WEB_PUBLIC_URL=${WEB_PUBLIC_URL}, CG_IMAGE=${CG_IMAGE}, generated Postgres password + auth secret)"
  else
    umask 077
    cat > .env <<EOF
# Airwave self-host config — generated by install.sh
CG_IMAGE=${CG_IMAGE}

# Where your browser and TVs reach the apps (baked into the admin build + used for auth/CORS).
SERVER_PUBLIC_URL=${SERVER_PUBLIC_URL}
WEB_PUBLIC_URL=${WEB_PUBLIC_URL}
SERVER_PORT=${SERVER_PORT}
WEB_PORT=${WEB_PORT}

# Postgres (password is hex so it's safe inside DATABASE_URL).
POSTGRES_USER=channelguide
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=channelguide

BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}

# First admin, seeded on first boot.
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

PUID=${PUID}
PGID=${PGID}
UMASK=022
TZ=${TZ_VAL}
EOF
    ok "Wrote .env"
  fi
fi

# ---- fetch compose (stack shows as 'airwave'; volume keys stay channelguide_*) ----
section "docker-compose.yml"
if dryrun; then
  if fetch "$COMPOSE_URL" > /dev/null 2>&1; then ok "compose reachable at ${COMPOSE_URL}"; else warn "couldn't reach ${COMPOSE_URL}"; fi
  plan "write docker-compose.yml (name rewritten to 'airwave')"
else
  fetch "$COMPOSE_URL" | sed 's/^name: channelguide$/name: airwave/' > docker-compose.yml.new \
    || die "couldn't download the compose file from ${COMPOSE_URL}"
  grep -q 'CG_ROLE' docker-compose.yml.new || die "the downloaded compose file didn't look right; aborting (nothing changed)"
  mv docker-compose.yml.new docker-compose.yml
  ok "Wrote docker-compose.yml"
fi

# ---- pull + up -------------------------------------------------------------
run "Pulling images (${CG_IMAGE})" $DCOMPOSE pull || die "docker compose pull failed. Does the tag '${VERSION}' exist? Your running stack is untouched."
run "Starting Airwave" $DCOMPOSE up -d || die "docker compose up failed."
if ! dryrun; then date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"; fi

# ---- wait for health -------------------------------------------------------
if dryrun; then
  plan "wait for ${SERVER_PUBLIC_URL%/}/api/health, then print the admin URL"
else
  section "Waiting for the server (first start builds the admin, up to ~4 min)…"
  i=0
  while [ "$i" -lt 48 ]; do
    if fetch "${SERVER_PUBLIC_URL%/}/api/health" >/dev/null 2>&1; then ok "Server is up"; break; fi
    i=$((i + 1)); sleep 5
  done
  [ "$i" -ge 48 ] && warn "Server didn't answer health yet — it may still be starting. Check: cd ${DIR_ABS} && docker compose logs -f"
fi

# ---- summary ---------------------------------------------------------------
if [ "$EXISTING" = 1 ]; then VERB="updated"; else VERB="installed"; fi
say ""
ok "Airwave ${VERB}$( dryrun && printf ' (dry run — nothing changed)' ) in ${BOLD}${DIR_ABS}${RST}"
say "  Admin:  ${BOLD}${WEB_PUBLIC_URL}${RST}"
say "  Server: ${SERVER_PUBLIC_URL}"
if [ "$GEN_PW" = 1 ]; then
  say "  Admin login: ${BOLD}${ADMIN_EMAIL}${RST} / ${BOLD}${ADMIN_PASSWORD}${RST}  ${DIM}(generated — save this)${RST}"
fi
say ""
say "Update later:  ${DIM}cd ${DIR_ABS} && docker compose pull && docker compose up -d${RST}"
say "         or:   ${DIM}curl -fsSL https://getairwave.tv/install.sh | sh${RST}  (add --version X.Y.Z to pin)"
say "Uninstall:     ${DIM}curl -fsSL https://getairwave.tv/install.sh | sh -s -- --uninstall${RST}"
say "Open the TV app and point it at ${SERVER_PUBLIC_URL} to watch."
