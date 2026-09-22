#!/bin/sh
# ============================================================================
#  Airwave one-line installer (Docker path)
#
#    curl -fsSL https://www.getairwave.tv/install.sh | sh
#    curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --version 0.14.13
#    curl -fsSL https://www.getairwave.tv/install.sh | AIRWAVE_VERSION=0.14.13 sh
#    curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --dry-run
#    curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --uninstall
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
INSTALLER_VERSION="0.14.51"   # kept in lockstep with the app version by scripts/bump-version.ts
IMAGE_REPO="ghcr.io/quixomatic/airwave"
COMPOSE_URL="${AIRWAVE_COMPOSE_URL:-https://www.getairwave.tv/docker-compose.yml}"
MARKER=".airwave-install"
GUM_VERSION="2.0.1"
TTY=/dev/tty

# ---- args ------------------------------------------------------------------
VERSION="${AIRWAVE_VERSION:-latest}"
# Default to a stable per-user path (NOT the current dir) so re-running finds the same install to update,
# and so it never drops a surprise folder wherever you happened to be. Override with --dir / AIRWAVE_DIR.
DIR="${AIRWAVE_DIR:-${HOME:-.}/airwave}"
MODE=install
MODE_EXPLICIT=0
DIR_EXPLICIT=0
PURGE=0
ADVANCED="${AIRWAVE_ADVANCED:-0}"
DRY_RUN="${AIRWAVE_DRY_RUN:-0}"

usage() {
  cat <<EOF
Airwave installer

Run with no arguments and it asks whether to install/update or uninstall.

Usage:
  install.sh [--install] [--version <tag>] [--dir <path>] [--advanced] [--dry-run] [--yes]
  install.sh --uninstall [--dir <path>] [--purge] [--dry-run] [--yes]

  --version <tag>   Image tag to run (e.g. 0.14.13 or 0.14). Default: latest.
  --dir <path>      Stack directory. Default: ~/airwave (a stable per-user path,
                    so re-running finds + updates the same install).
  --advanced, -a    Ask the extra questions too: data locations (bind a host path
                    for Postgres / bumper music), the AI lineup engine, the
                    browser TV player, extra CORS origins. Default: sensible
                    defaults (Docker named volumes, engine off, no TV player).
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
    --dir) DIR=${2:-}; DIR_EXPLICIT=1; shift 2 ;;
    --dir=*) DIR=${1#*=}; DIR_EXPLICIT=1; shift ;;
    --install) MODE=install; MODE_EXPLICIT=1; shift ;;
    --uninstall|--remove) MODE=uninstall; MODE_EXPLICIT=1; shift ;;
    --purge) PURGE=1; shift ;;
    -a|--advanced) ADVANCED=1; shift ;;
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
    [ -z "$_ans" ] && _ans=$_d
    # gum clears its own UI on submit — echo the answer so it stays in the scrollback.
    say "${DIM}  ${_q}: ${_ans}${RST}"
  else
    if [ -n "$_d" ]; then printf '%s [%s]: ' "$_q" "$_d" > "$TTY"; else printf '%s: ' "$_q" > "$TTY"; fi
    IFS= read -r _ans < "$TTY" || _ans=''
    [ -z "$_ans" ] && _ans=$_d
  fi
  eval "$_v=\$_ans"
}

prompt_secret() { # prompt_secret VAR "Question" -> reads without echoing the value to the screen
  _v=$1; _q=$2
  if noninteractive; then eval "$_v=''"; return 0; fi
  if [ -n "$GUM" ]; then
    _ans=$("$GUM" input --password --prompt "$_q » " < "$TTY") || _ans=''
  else
    printf '%s: ' "$_q" > "$TTY"
    stty -echo 2>/dev/null
    IFS= read -r _ans < "$TTY" || _ans=''
    stty echo 2>/dev/null; printf '\n' > "$TTY"
  fi
  eval "$_v=\$_ans"
}

confirm() { # confirm "Question" [default:yes|no] -> 0 = yes. Non-interactive returns the default.
  _q=$1; _def=${2:-no}
  if noninteractive; then [ "$_def" = yes ] && return 0 || return 1; fi
  if [ -n "$GUM" ]; then
    if [ "$_def" = yes ]; then "$GUM" confirm --default=true "$_q" < "$TTY"; else "$GUM" confirm "$_q" < "$TTY"; fi
    _r=$?
    if [ "$_r" = 0 ]; then say "${DIM}  ${_q}: yes${RST}"; else say "${DIM}  ${_q}: no${RST}"; fi
    return $_r
  fi
  _hint='[y/N]'; [ "$_def" = yes ] && _hint='[Y/n]'
  printf '%s %s: ' "$_q" "$_hint" > "$TTY"
  IFS= read -r _a < "$TTY" || _a=''
  if [ -z "$_a" ]; then [ "$_def" = yes ] && return 0 || return 1; fi
  case "$_a" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

choose() { # choose "header" "opt1" "opt2" ...  -> prints the chosen option
  _hdr=$1; shift
  if [ -n "$GUM" ]; then
    _sel=$("$GUM" choose --header "$_hdr" "$@" < "$TTY") || _sel=''
    printf '  %s%s: %s%s\n' "$DIM" "$_hdr" "$_sel" "$RST" >&2   # keep it in scrollback (gum clears its UI)
    printf '%s' "$_sel"
  else
    printf '%s\n' "$_hdr" > "$TTY"
    _i=1; for _o in "$@"; do printf '  %s) %s\n' "$_i" "$_o" > "$TTY"; _i=$((_i + 1)); done
    printf 'Choose [1]: ' > "$TTY"; IFS= read -r _n < "$TTY" || _n=1; [ -z "$_n" ] && _n=1
    _i=1; for _o in "$@"; do [ "$_i" = "$_n" ] && { printf '%s' "$_o"; return; }; _i=$((_i + 1)); done
    printf '%s' "$1"  # out-of-range → first option
  fi
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
gen_uuid() { # stable PLEX_CLIENT_IDENTIFIER (like dev-setup), so Plex doesn't see a new client each redeploy
  if [ -r /proc/sys/kernel/random/uuid ]; then cat /proc/sys/kernel/random/uuid
  elif have uuidgen; then uuidgen | tr 'A-Z' 'a-z'
  elif have openssl; then openssl rand -hex 16 | sed 's/\(........\)\(....\)\(....\)\(....\)\(............\)/\1-\2-\3-\4-\5/'
  else gen_hex | cut -c1-32; fi
}
lan_ip() {
  # Enumerate real (non-loopback, non-virtual) IPv4s, then prefer a home LAN address — the same order the
  # desktop server uses: 192.168.x, then 172.16-31.x, then 10.x, then anything. A TV must be able to reach
  # this, so 127.0.0.1 is only the last resort. (Trusting the default route alone can hand back a
  # Docker/VPN address that TVs can't reach.)
  _cands=''
  # On WSL2, `ip` only sees the NAT'd 172.x vEthernet, not the Windows host's real LAN IP that TVs use; and
  # Git Bash / MSYS has no `ip`/`ifconfig` at all. In either case, ask Windows directly via PowerShell.
  _is_wsl=0; grep -qi microsoft /proc/version 2>/dev/null && _is_wsl=1
  if { [ "$_is_wsl" = 1 ] || ! have ip; } && have powershell.exe; then
    _cands=$(powershell.exe -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Select-Object -ExpandProperty IPAddress" 2>/dev/null \
      | tr -d '\r' | grep -Ev '^(127\.|169\.254\.)')
  fi
  if [ -z "$_cands" ] && have ip; then
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

# ── Install-location metadata (cross-environment recenter) ──────────────────
# Docker Desktop shares ONE engine across Windows/WSL/Git Bash. We record WHERE the stack physically lives —
# in every form the other shells can reach — as labels on a tiny `airwave_meta` volume, so any later run finds
# and updates the real install instead of making a parallel one. Forms are computed at install time (where we
# know the source env + WSL distro), so reading later is just "pick the label for the current shell".
env_kind() {
  case "$(uname -s 2>/dev/null)" in
    Linux) grep -qi microsoft /proc/version 2>/dev/null && echo wsl || echo linux ;;
    Darwin) echo macos ;;
    MINGW*|MSYS*|CYGWIN*) echo gitbash ;;
    *) echo other ;;
  esac
}
# compute_meta_paths <abs-dir> -> sets M_WIN / M_WSL / M_GIT / M_UNIX (blank when N/A for this install)
compute_meta_paths() {
  _d=$1; M_WIN=''; M_WSL=''; M_GIT=''; M_UNIX=''
  case "$(env_kind)" in
    linux|macos) M_UNIX=$_d ;;
    wsl)
      case "$_d" in
        /mnt/[A-Za-z]/*)  # on a Windows drive → reachable from all three
          _dl=$(printf %s "$_d" | cut -c6); _rest=$(printf %s "$_d" | cut -c8-)
          M_WSL=$_d; M_GIT="/$(printf %s "$_dl" | tr 'A-Z' 'a-z')/$_rest"
          M_WIN="$(printf %s "$_dl" | tr 'a-z' 'A-Z'):\\$(printf %s "$_rest" | sed 's#/#\\#g')" ;;
        *)  # WSL-internal → Windows/Git Bash reach it via \\wsl$\<distro>
          M_WSL=$_d
          if [ -n "${WSL_DISTRO_NAME:-}" ]; then
            M_WIN="\\\\wsl\$\\${WSL_DISTRO_NAME}$(printf %s "$_d" | sed 's#/#\\#g')"
            M_GIT="//wsl\$/${WSL_DISTRO_NAME}${_d}"
          fi ;;
      esac ;;
    gitbash)
      case "$_d" in
        /[A-Za-z]/*)
          _dl=$(printf %s "$_d" | cut -c2); _rest=$(printf %s "$_d" | cut -c4-)
          M_GIT=$_d; M_WSL="/mnt/$(printf %s "$_dl" | tr 'A-Z' 'a-z')/$_rest"
          M_WIN="$(printf %s "$_dl" | tr 'a-z' 'A-Z'):\\$(printf %s "$_rest" | sed 's#/#\\#g')" ;;
        *) M_GIT=$_d ;;
      esac ;;
  esac
}
write_meta() {  # record the current install location on the shared engine (idempotent: rm + recreate)
  compute_meta_paths "$DIR_ABS"
  docker volume rm airwave_meta >/dev/null 2>&1 || true
  docker volume create airwave_meta \
    --label "airwave.origin=$(env_kind)" \
    --label "airwave.path.windows=${M_WIN}" \
    --label "airwave.path.wsl=${M_WSL}" \
    --label "airwave.path.gitbash=${M_GIT}" \
    --label "airwave.path.unix=${M_UNIX}" >/dev/null 2>&1 || true
}
meta_path_here() {  # print the recorded install path reachable from THIS shell (blank if none/unreachable)
  case "$(env_kind)" in
    windows) _k=windows ;; wsl) _k=wsl ;; gitbash) _k=gitbash ;; *) _k=unix ;;
  esac
  docker volume inspect airwave_meta --format "{{index .Labels \"airwave.path.${_k}\"}}" 2>/dev/null || true
}

# ============================================================================
setup_gum || true
banner "Airwave ${MODE} v${INSTALLER_VERSION}$( dryrun && printf ' (dry run)' )"

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

# ---- pick an action (when none was given on the command line) --------------
if [ "$MODE_EXPLICIT" = 0 ] && ! noninteractive; then
  _existing_here=0
  [ -f "${DIR}/${MARKER}" ] && [ -f "${DIR}/.env" ] && _existing_here=1
  _first="Install or update Airwave"
  [ "$_existing_here" = 1 ] && _first="Update Airwave (found in ${DIR})"
  _act=$(choose "What would you like to do?" "$_first" "Uninstall Airwave" "Quit")
  case "$_act" in
    Uninstall*) MODE=uninstall ;;
    Quit|"") say "Cancelled."; exit 0 ;;
    *) MODE=install ;;
  esac
fi

# ---- uninstall -------------------------------------------------------------
if [ "$MODE" = uninstall ]; then
  # Recenter onto the recorded install (unless --dir was given) so we remove the REAL one, not a stale dir.
  if [ "$DIR_EXPLICIT" = 0 ]; then
    _mp=$(meta_path_here)
    [ -n "$_mp" ] && [ -d "$_mp" ] && DIR=$_mp
  fi
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
    dryrun || docker volume rm airwave_meta >/dev/null 2>&1 || true
    dryrun || ok "Deleted the data volumes."
    REMOVE_DIR=0
    if [ "$PURGE" = 1 ]; then REMOVE_DIR=1
    elif confirm "Delete the install directory ${DIR_ABS} (.env, docker-compose.yml)?"; then REMOVE_DIR=1; fi
    if [ "$REMOVE_DIR" = 1 ]; then
      if dryrun; then
        plan "delete ${DIR_ABS}"
      else
        cd "$(dirname "$DIR_ABS")" 2>/dev/null || cd /
        if rm -rf "$DIR_ABS" 2>/dev/null; then
          ok "Deleted ${DIR_ABS}."
        else
          # A bind-mounted Postgres data dir is owned by the container user (root/999), so the host can't
          # delete it. Clear it from inside a container (which has the rights), then remove the empty dir.
          docker run --rm -v "$DIR_ABS:/t" postgres:16-alpine find /t -mindepth 1 -delete >/dev/null 2>&1 || true
          if rmdir "$DIR_ABS" 2>/dev/null || rm -rf "$DIR_ABS" 2>/dev/null; then
            ok "Deleted ${DIR_ABS}."
          else
            warn "couldn't fully remove ${DIR_ABS} (root-owned files). Run: sudo rm -rf ${DIR_ABS}"
          fi
        fi
      fi
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

# ---- recenter onto an existing install (cross-environment) ------------------
# Docker Desktop shares one engine across Windows/WSL/Git Bash and the compose project is fixed 'airwave', so a
# second install from a different dir collides. Prefer the recorded install location (airwave_meta, translated
# to a path THIS shell can reach); fall back to the running stack's working-dir label for pre-meta installs.
if [ "$EXISTING" = 0 ] && ! dryrun; then
  _mp=$(meta_path_here)
  if [ -n "$_mp" ] && [ "$_mp" != "$DIR_ABS" ] && [ -f "${_mp}/.env" ]; then
    section "Airwave is already installed at:"
    say "  ${BOLD}${_mp}${RST}"
    case "$(choose "What do you want to do?" "Update that install" "Install a separate copy here (${DIR_ABS})" "Quit")" in
      Update*) DIR=$_mp; cd "$DIR" || die "can't enter $DIR"; DIR_ABS=$(pwd); EXISTING=1; ok "Recentered on ${DIR_ABS}." ;;
      Quit|"") die "Cancelled." ;;
    esac
  else
    _other=$(docker ps -a --filter "label=com.docker.compose.project=airwave" \
      --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | head -n1)
    if [ -n "$_other" ] && [ "$_other" != "$DIR_ABS" ]; then
      warn "An Airwave stack already exists (installed at ${_other}), sharing this Docker engine."
      warn "A second copy here would clash on the same containers, volumes, and ports."
      confirm "Continue anyway?" || die "Cancelled. Manage the existing install at ${_other}, or uninstall it first."
    fi
  fi
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
  prompt TV_WEB_PORT "Browser TV player port" "36022"
  prompt SERVER_PUBLIC_URL "Server public URL" "http://${IP}:${SERVER_PORT}"
  prompt WEB_PUBLIC_URL    "Admin web public URL" "http://${IP}:${WEB_PORT}"
  prompt TV_WEB_PUBLIC_URL "Browser TV player public URL" "http://${IP}:${TV_WEB_PORT}"
  prompt ADMIN_EMAIL "First admin email" "admin@example.com"
  prompt ADMIN_PASSWORD "First admin password (blank = generate one)" ""
  if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD=$(gen_hex | cut -c1-24); GEN_PW=1; fi
  POSTGRES_PASSWORD=$(gen_hex)
  BETTER_AUTH_SECRET=$(gen_b64)
  PLEX_CLIENT_IDENTIFIER=$(gen_uuid)   # stable, so Plex doesn't see a new client on each redeploy
  PUID=$(id -u 2>/dev/null || echo 1000)
  PGID=$(id -g 2>/dev/null || echo 1000)
  TZ_VAL=${TZ:-$(cat /etc/timezone 2>/dev/null || echo UTC)}

  # Sensible defaults (batteries included): Docker named volumes, AI lineup engine ON, browser TV player ON.
  # Pre-seeded from the environment so they can also be set unattended (e.g. WORKFLOW_ENABLED=0 … | sh -s -- -y).
  POSTGRES_DATA_VOLUME="${POSTGRES_DATA_VOLUME:-}"; PGDATA_OVR="${PGDATA:-}"; BUMPER_MUSIC_VOLUME="${BUMPER_MUSIC_VOLUME:-}"
  WORKFLOW_ENABLED="${WORKFLOW_ENABLED:-1}"
  COMPOSE_PROFILES="${COMPOSE_PROFILES:-tvweb}"
  TV_WEB_PORT="${TV_WEB_PORT:-36022}"
  TV_WEB_PUBLIC_URL="${TV_WEB_PUBLIC_URL:-http://${IP}:${TV_WEB_PORT}}"
  TV_SERVER_URL="${TV_SERVER_URL:-}"   # only for reverse-proxy-at-own-domain; else the player uses SERVER_PUBLIC_URL
  EXTRA_CORS_ORIGINS="${EXTRA_CORS_ORIGINS:-}"
  if [ "$ADVANCED" != 1 ] && ! noninteractive && confirm "Configure advanced options (data locations, AI engine, TV player)?"; then
    ADVANCED=1
  fi
  # If a Postgres bind path was given (interactively below or via env), default PGDATA to a safe subdir.
  if [ "$ADVANCED" = 1 ]; then
    section "Advanced options"
    if confirm "Store the Postgres database on a host path instead of a Docker volume?"; then
      prompt POSTGRES_DATA_VOLUME "  Postgres data dir (host path)" "${DIR_ABS}/data/postgres"
      PGDATA_OVR="/var/lib/postgresql/data/pgdata"
      warn "  Bind mounts need correct ownership; on TrueNAS/NAS the Postgres user is uid 999. If it won't start, chown that dir."
    fi
    if confirm "Keep bumper music on a host path (drop files in, then 'Scan folder')?"; then
      prompt BUMPER_MUSIC_VOLUME "  Bumper-music dir (host path)" "${DIR_ABS}/data/bumper-music"
    fi
    if confirm "Enable the AI lineup workflow engine? (needs an AI key to actually use)" yes; then
      WORKFLOW_ENABLED=1
    else
      WORKFLOW_ENABLED=''
    fi
    if confirm "Serve the browser TV player (tvweb)?" yes; then
      COMPOSE_PROFILES=tvweb
    else
      COMPOSE_PROFILES=''; TV_WEB_PUBLIC_URL=''
    fi
    prompt EXTRA_CORS_ORIGINS "Extra admin origins to allow-list (comma-separated, blank = none)" ""
  fi
  # Postgres bind (from a prompt or from the env) needs PGDATA pointed at an empty subdir for initdb.
  [ -n "$POSTGRES_DATA_VOLUME" ] && [ -z "$PGDATA_OVR" ] && PGDATA_OVR="/var/lib/postgresql/data/pgdata"

  if dryrun; then
    plan "write .env (SERVER_PUBLIC_URL=${SERVER_PUBLIC_URL}, CG_IMAGE=${CG_IMAGE}, generated Postgres password + auth secret + Plex client id)"
    [ -n "$POSTGRES_DATA_VOLUME" ] && plan "bind Postgres data -> ${POSTGRES_DATA_VOLUME} (PGDATA=${PGDATA_OVR})"
    [ -n "$BUMPER_MUSIC_VOLUME" ] && plan "bind bumper music -> ${BUMPER_MUSIC_VOLUME}"
    [ "$WORKFLOW_ENABLED" = 1 ] && plan "enable the AI lineup workflow engine"
    [ -n "$COMPOSE_PROFILES" ] && plan "serve the browser TV player at ${TV_WEB_PUBLIC_URL}"
    [ -n "$EXTRA_CORS_ORIGINS" ] && plan "allow-list extra admin origins: ${EXTRA_CORS_ORIGINS}"
  else
    [ -n "$POSTGRES_DATA_VOLUME" ] && mkdir -p "$POSTGRES_DATA_VOLUME" 2>/dev/null
    [ -n "$BUMPER_MUSIC_VOLUME" ] && mkdir -p "$BUMPER_MUSIC_VOLUME" 2>/dev/null
    umask 077
    cat > .env <<EOF
# Airwave self-host config — generated by install.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)
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

# Long random secret — do NOT change after first boot (stored Plex/AI secrets are encrypted with it).
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
# Stable Plex client identity for this instance (kept across updates).
PLEX_CLIENT_IDENTIFIER=${PLEX_CLIENT_IDENTIFIER}

# First admin, seeded on first boot.
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

PUID=${PUID}
PGID=${PGID}
UMASK=022
TZ=${TZ_VAL}
EOF
    # ---- Optional / advanced: live when chosen, otherwise documented so nothing is hidden ----
    {
      echo ""
      echo "# ============================ Optional ============================"
      if [ -n "$POSTGRES_DATA_VOLUME" ]; then
        echo "# Postgres database on a host path (bind mount)."
        echo "POSTGRES_DATA_VOLUME=${POSTGRES_DATA_VOLUME}"
        echo "PGDATA=${PGDATA_OVR}"
      else
        echo "# Put the Postgres database on a host path instead of the Docker named volume:"
        echo "#   POSTGRES_DATA_VOLUME=/mnt/tank/apps/airwave/postgres"
        echo "#   PGDATA=/var/lib/postgresql/data/pgdata"
      fi
      if [ -n "$BUMPER_MUSIC_VOLUME" ]; then
        echo "# Bumper music on a host folder (drop tracks in, then 'Scan folder' in the admin)."
        echo "BUMPER_MUSIC_VOLUME=${BUMPER_MUSIC_VOLUME}"
      else
        echo "# Keep bumper music on a host folder you manage:"
        echo "#   BUMPER_MUSIC_VOLUME=/mnt/tank/apps/airwave/bumper-music"
      fi
      if [ "$WORKFLOW_ENABLED" = 1 ]; then
        echo "# AI lineup workflow engine (add an AI provider key in the admin to use it)."
        echo "WORKFLOW_ENABLED=1"
      else
        echo "# Enable the AI lineup workflow engine (needs an AI provider key added in the admin):"
        echo "#   WORKFLOW_ENABLED=1"
      fi
      if [ -n "$COMPOSE_PROFILES" ]; then
        echo "# Browser TV player (auth-gated web player, for casting / kiosk)."
        echo "COMPOSE_PROFILES=${COMPOSE_PROFILES}"
        echo "TV_WEB_PORT=${TV_WEB_PORT}"
        echo "TV_WEB_PUBLIC_URL=${TV_WEB_PUBLIC_URL}"
        if [ -n "$TV_SERVER_URL" ]; then
          echo "TV_SERVER_URL=${TV_SERVER_URL}"
        else
          echo "# Reverse proxy only: to serve the player at its own domain, set TV_WEB_PUBLIC_URL above to that"
          echo "# domain and TV_SERVER_URL to the same domain (with /api + /img forwarded to the server) so the"
          echo "# server never needs exposing. Leave unset for a normal LAN setup (the player uses SERVER_PUBLIC_URL)."
          echo "#   TV_SERVER_URL=https://tv.example.com"
        fi
      else
        echo "# Serve the 10-foot TV app as a browser player (for casting / kiosk):"
        echo "#   COMPOSE_PROFILES=tvweb"
        echo "#   TV_WEB_PORT=36022"
        echo "#   TV_WEB_PUBLIC_URL=http://<host>:36022"
      fi
      if [ -n "$EXTRA_CORS_ORIGINS" ]; then
        echo "EXTRA_CORS_ORIGINS=${EXTRA_CORS_ORIGINS}"
      else
        echo "# Extra admin origins to allow-list beyond WEB_PUBLIC_URL (comma-separated exact origins):"
        echo "#   EXTRA_CORS_ORIGINS=http://192.168.1.10:36021"
      fi
      echo "# Social login (set BOTH id + secret to enable a provider):"
      echo "#   GOOGLE_CLIENT_ID=      GOOGLE_CLIENT_SECRET="
      echo "#   GITHUB_CLIENT_ID=      GITHUB_CLIENT_SECRET="
    } >> .env
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

# ---- stale-volume guard ----------------------------------------------------
# Fresh install on a Docker named volume: if the DB volume already exists from a previous install, Postgres
# keeps its ORIGINAL password and ignores the one we just generated, so the server can't connect. Offer to
# reset it (data loss) rather than boot into an auth-fail loop.
if [ "$EXISTING" = 0 ] && [ -z "${POSTGRES_DATA_VOLUME:-}" ] && ! dryrun; then
  _pgvol=airwave_channelguide_pgdata
  if docker volume ls --format '{{.Name}}' 2>/dev/null | grep -qx "$_pgvol"; then
    section "Found an existing Airwave database volume (${_pgvol})."
    # Bring up ONLY Postgres against the existing volume (it uses its own baked password, ignoring .env), then
    # test whether our configured password authenticates. Reuse if it does; otherwise let the user pick.
    $DCOMPOSE up -d postgres >/dev/null 2>&1 || warn "couldn't start Postgres to check the existing database."
    _i=0; while [ $_i -lt 20 ]; do
      $DCOMPOSE exec -T postgres pg_isready -U channelguide >/dev/null 2>&1 && break
      _i=$((_i + 1)); sleep 1
    done
    pg_pw_works() { $DCOMPOSE exec -T -e PGPASSWORD="$1" postgres psql -h 127.0.0.1 -U channelguide -d channelguide -c 'select 1' >/dev/null 2>&1; }
    if pg_pw_works "$POSTGRES_PASSWORD"; then
      ok "The existing database accepts the configured password — reusing it (your data is kept)."
    else
      warn "That database was created with a different password than the one just generated."
      _pick=$(choose "How do you want to handle it?" \
        "Reuse it — enter the existing password (keeps your data)" \
        "Wipe it and start fresh (DELETES that database)" \
        "Quit")
      case "$_pick" in
        Reuse*)
          while :; do
            prompt_secret _EXPW "  Existing database password"
            if [ -n "$_EXPW" ] && pg_pw_works "$_EXPW"; then
              POSTGRES_PASSWORD=$_EXPW; set_env POSTGRES_PASSWORD "$_EXPW"
              ok "Password accepted — reusing the database."; break
            fi
            warn "  That password didn't authenticate. Try again, or Ctrl-C to abort."
          done ;;
        Wipe*)
          $DCOMPOSE down -v >/dev/null 2>&1 || true
          docker volume rm "$_pgvol" >/dev/null 2>&1 || warn "couldn't remove ${_pgvol}; try: cd ${DIR_ABS} && docker compose down -v"
          ok "Old database removed; a fresh one will be created." ;;
        *) $DCOMPOSE down >/dev/null 2>&1 || true; die "Aborted. Nothing was changed." ;;
      esac
    fi
  fi
fi

# ---- pull + up -------------------------------------------------------------
run "Pulling images (${CG_IMAGE})" $DCOMPOSE pull || die "docker compose pull failed. Does the tag '${VERSION}' exist? Your running stack is untouched."
run "Starting Airwave" $DCOMPOSE up -d || die "docker compose up failed."
if ! dryrun; then date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"; write_meta; fi

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
[ -n "${TV_WEB_PUBLIC_URL:-}" ] && say "  TV:     ${TV_WEB_PUBLIC_URL}  ${DIM}(browser TV player)${RST}"
if [ "$GEN_PW" = 1 ]; then
  say "  Admin login: ${BOLD}${ADMIN_EMAIL}${RST} / ${BOLD}${ADMIN_PASSWORD}${RST}  ${DIM}(generated — save this)${RST}"
fi
say ""
say "Update later:  ${DIM}cd ${DIR_ABS} && docker compose pull && docker compose up -d${RST}"
say "         or:   ${DIM}curl -fsSL https://www.getairwave.tv/install.sh | sh${RST}  (add --version X.Y.Z to pin)"
say "Uninstall:     ${DIM}curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --uninstall${RST}"
say "Open the TV app and point it at ${SERVER_PUBLIC_URL} to watch."
