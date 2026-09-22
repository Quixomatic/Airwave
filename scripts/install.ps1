<#
.SYNOPSIS
  Airwave one-line installer (Docker path) for Windows.

.EXAMPLE
  irm https://www.getairwave.tv/install.ps1 | iex
  # with options, download then run:
  #   iwr https://www.getairwave.tv/install.ps1 -OutFile install.ps1; ./install.ps1 -Version 0.14.13
  #   ./install.ps1 -DryRun
  #   ./install.ps1 -Uninstall            (add -Purge to also delete data + dir)

.DESCRIPTION
  Installs (or updates) a self-hosted Airwave server via Docker Desktop + compose:
  checks Docker, writes docker-compose.yml + .env into a target dir, and brings the
  stack up. Re-running against an existing install updates it in place, keeping your
  secrets. Latest by default; pin with -Version. See .plans/curl-sh-installer.md.
#>
[CmdletBinding()]
param(
  [string]$Version = $(if ($env:AIRWAVE_VERSION) { $env:AIRWAVE_VERSION } else { "latest" }),
  [string]$Dir     = $(if ($env:AIRWAVE_DIR) { $env:AIRWAVE_DIR } else { Join-Path $HOME "airwave" }),
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$Purge,
  [switch]$Advanced,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$InstallerVersion = "0.14.36"   # kept in lockstep with the app version by scripts/bump-version.ts
$ImageRepo   = "ghcr.io/quixomatic/airwave"
$ComposeUrl  = if ($env:AIRWAVE_COMPOSE_URL) { $env:AIRWAVE_COMPOSE_URL } else { "https://www.getairwave.tv/docker-compose.yml" }
$Marker      = ".airwave-install"
$NonInteractive = $Yes -or ($env:AIRWAVE_NONINTERACTIVE -eq "1")

# Pretty prompts via gum if it's on PATH (install once with `winget install charmbracelet.gum`). No
# auto-download: gum ships no Windows binary on GitHub for this release, and a winget install mid-run
# wouldn't be on this session's PATH anyway. Falls back to Read-Host.
$Gum = $null
if (-not $env:AIRWAVE_NO_GUM) {
  $g = Get-Command gum -ErrorAction SilentlyContinue
  if ($g) { $Gum = $g.Source }
}

function Info($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X   $m" -ForegroundColor Red; exit 1 }
function Plan($m) { Write-Host "[dry-run] would $m" -ForegroundColor DarkGray }

function Ask($question, $default) {
  if ($NonInteractive) { return $default }
  if ($Gum) {
    $ans = & $Gum input --prompt "$question > " --value "$default" --placeholder "$default"
    if ([string]::IsNullOrWhiteSpace($ans)) { $ans = $default }
    Write-Host "  ${question}: $ans" -ForegroundColor DarkGray   # gum clears its UI; keep the answer on screen
    return $ans
  }
  $suffix = if ($default) { " [$default]" } else { "" }
  $ans = Read-Host "$question$suffix"
  if ([string]::IsNullOrWhiteSpace($ans)) { return $default }
  return $ans
}
function Confirm($question, $default = "no") {
  if ($NonInteractive) { return ($default -eq "yes") }
  if ($Gum) {
    if ($default -eq "yes") { & $Gum confirm --default=true "$question" } else { & $Gum confirm "$question" }
    $r = ($LASTEXITCODE -eq 0)
    Write-Host ("  {0}: {1}" -f $question, $(if ($r) { "yes" } else { "no" })) -ForegroundColor DarkGray
    return $r
  }
  $hint = if ($default -eq "yes") { "[Y/n]" } else { "[y/N]" }
  $ans = Read-Host "$question $hint"
  if ([string]::IsNullOrWhiteSpace($ans)) { return ($default -eq "yes") }
  return ($ans -match '^(y|Y|yes|YES)$')
}
function AskSecret($question) {
  if ($NonInteractive) { return "" }
  if ($Gum) { return (& $Gum input --password --prompt "$question > ") }
  $sec = Read-Host "$question" -AsSecureString
  return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
function Choose($header, [string[]]$options) {
  if ($Gum) { $sel = & $Gum choose --header $header @options; Write-Host "  ${header}: $sel" -ForegroundColor DarkGray; return $sel }
  Write-Host $header
  for ($i = 0; $i -lt $options.Count; $i++) { Write-Host ("  {0}) {1}" -f ($i + 1), $options[$i]) }
  $n = Read-Host "Choose [1]"
  if ([string]::IsNullOrWhiteSpace($n)) { return $options[0] }
  $idx = 0; [int]::TryParse($n, [ref]$idx) | Out-Null
  if ($idx -ge 1 -and $idx -le $options.Count) { return $options[$idx - 1] }
  return $options[0]
}
function New-Secret([int]$bytes = 24) {
  $b = New-Object 'System.Byte[]' $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}
function New-B64Secret([int]$bytes = 48) {
  $b = New-Object 'System.Byte[]' $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b)
}
function Get-LanIp {
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Sort-Object -Property SkipAsSource |
      Select-Object -First 1 -ExpandProperty IPAddress)
    if ($ip) { return $ip }
  } catch {}
  return "127.0.0.1"
}
function Set-EnvVar($path, $key, $val) {
  $lines = if (Test-Path $path) { Get-Content $path } else { @() }
  $found = $false
  $out = foreach ($l in $lines) {
    if ($l -match "^$([regex]::Escape($key))=") { $found = $true; "$key=$val" } else { $l }
  }
  if (-not $found) { $out += "$key=$val" }
  Set-Content -Path $path -Value $out -Encoding UTF8
}

# ── Install-location metadata (cross-environment recenter) ──────────────────
# Record WHERE the stack physically lives, in every form the other shells can reach, as labels on a tiny
# `airwave_meta` volume on the shared Docker engine, so a later run from WSL/Git Bash finds the real install.
function Get-MetaPaths($dir) {
  $m = @{ windows = $dir; wsl = ""; gitbash = ""; unix = "" }
  if ($dir -match '^([A-Za-z]):\\(.*)$') {
    $drive = $Matches[1].ToLower(); $rest = ($Matches[2] -replace '\\', '/')
    $m.wsl = "/mnt/$drive/$rest"
    $m.gitbash = "/$drive/$rest"
  }
  return $m
}
function Write-Meta($dir) {
  $m = Get-MetaPaths $dir
  docker volume rm airwave_meta *> $null
  docker volume create airwave_meta `
    --label "airwave.origin=windows" `
    --label "airwave.path.windows=$($m.windows)" `
    --label "airwave.path.wsl=$($m.wsl)" `
    --label "airwave.path.gitbash=$($m.gitbash)" `
    --label "airwave.path.unix=$($m.unix)" *> $null
}
function Get-Meta {
  # Read the airwave_meta labels as JSON (avoids Go-template quoting, which PowerShell mangles for native exes).
  try {
    $j = docker volume inspect airwave_meta 2>$null | ConvertFrom-Json
    if ($j) { return $j[0].Labels }
  } catch {}
  return $null
}

# ---- version -> image tag --------------------------------------------------
$Version = $Version -replace '^v', ''
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = "latest" }
$CgImage = "${ImageRepo}:${Version}"

$mode = if ($Uninstall) { "uninstall" } else { "install" }
$modeExplicit = $Uninstall.IsPresent
Info ("=== Airwave {0} v{1}{2} ===" -f $mode, $InstallerVersion, $(if ($DryRun) { " (dry run)" } else { "" }))

# ---- preflight -------------------------------------------------------------
$dockerOk = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerOk = $true } } catch {}
}
if (-not $dockerOk) {
  if ($DryRun) { Warn "Docker not reachable (dry-run: continuing)." }
  else { Die "Docker Desktop isn't installed or running. Get it at https://docs.docker.com/desktop/, start it, then re-run." }
} else { Ok "Docker is ready" }

# ---- pick an action (when none was given on the command line) --------------
if (-not $modeExplicit -and -not $NonInteractive) {
  $existingHere = (Test-Path (Join-Path $Dir $Marker)) -and (Test-Path (Join-Path $Dir ".env"))
  $first = if ($existingHere) { "Update Airwave (found in $Dir)" } else { "Install or update Airwave" }
  $act = Choose "What would you like to do?" @($first, "Uninstall Airwave", "Quit")
  switch -Wildcard ($act) {
    "Uninstall*" { $mode = "uninstall" }
    "Quit"       { Write-Host "Cancelled."; exit 0 }
    default      { $mode = "install" }
  }
}

# ---- uninstall -------------------------------------------------------------
if ($mode -eq "uninstall") {
  # Recenter onto the recorded install (unless -Dir / AIRWAVE_DIR was given) so we remove the REAL one.
  if (-not $PSBoundParameters.ContainsKey('Dir') -and -not $env:AIRWAVE_DIR) {
    $meta = Get-Meta
    $mp = if ($meta) { [string]$meta.'airwave.path.windows' } else { "" }
    if ($mp -like '\\wsl*') {
      $wslPath = [string]$meta.'airwave.path.wsl'
      $distro = if ($mp -match '^\\\\wsl[^\\]+\\([^\\]+)\\') { $Matches[1] } else { 'Ubuntu' }
      Info "Airwave is installed inside WSL ($distro) at $wslPath."
      $doPurge = $Purge -or (Confirm "Also DELETE all data (the Postgres database + bumper music)? This cannot be undone")
      $purgeArg = if ($doPurge) { "--purge" } else { "" }
      Info "Handing off to uninstall inside WSL ($distro)..."
      wsl.exe -d $distro bash -lc "curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --uninstall --dir '$wslPath' $purgeArg --yes"
      exit $LASTEXITCODE
    } elseif ($mp -and (Test-Path $mp)) {
      $Dir = $mp
    }
  }
  if (-not (Test-Path $Dir)) { Die "no Airwave install directory at $Dir (use -Dir to point at it)." }
  Push-Location $Dir
  $dirAbs = (Get-Location).Path
  if (-not ((Test-Path "docker-compose.yml") -or (Test-Path $Marker))) { Die "no Airwave install found in $dirAbs." }

  if ($DryRun) { Plan "run: docker compose down" } else { docker compose down; Ok "Removed the Airwave containers." }

  $removeData = $Purge -or (Confirm "Also DELETE all data (the Postgres database + bumper music)? This cannot be undone")
  if ($removeData) {
    if ($DryRun) { Plan "run: docker compose down -v" } else { docker compose down -v; docker volume rm airwave_meta *> $null; Ok "Deleted the data volumes." }
    $removeDir = $Purge -or (Confirm "Delete the install directory $dirAbs (.env, docker-compose.yml)?")
    if ($removeDir) {
      if ($DryRun) { Plan "delete $dirAbs" }
      else {
        Pop-Location
        try { Remove-Item -Recurse -Force $dirAbs -ErrorAction Stop; Ok "Deleted $dirAbs." }
        catch {
          # Bind-mounted Postgres data is owned by the container user; clear it from inside a container, then retry.
          docker run --rm -v "${dirAbs}:/t" postgres:16-alpine find /t -mindepth 1 -delete *> $null
          try { Remove-Item -Recurse -Force $dirAbs -ErrorAction Stop; Ok "Deleted $dirAbs." }
          catch { Warn "couldn't fully remove $dirAbs (files owned by the container). Remove it manually." }
        }
      }
    }
    Write-Host ""; Ok ("Airwave fully removed.{0}" -f $(if ($DryRun) { " (dry run - nothing changed)" } else { "" }))
  } else {
    Write-Host ""; Ok "Airwave stopped. Your data volumes and $dirAbs were kept."
    Write-Host "  Start it again:  cd `"$dirAbs`"; docker compose up -d"
    Write-Host "  Delete data too: re-run with -Uninstall -Purge"
  }
  if (Get-Location) { try { Pop-Location -ErrorAction SilentlyContinue } catch {} }
  exit 0
}

# ---- resolve dir + detect existing -----------------------------------------
$existing = (Test-Path (Join-Path $Dir $Marker)) -and (Test-Path (Join-Path $Dir ".env"))
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
$dirAbs = if (Test-Path $Dir) { (Resolve-Path $Dir).Path } else { $Dir }
$envPath = Join-Path $Dir ".env"

# ---- cross-environment guard -----------------------------------------------
# Docker Desktop shares ONE engine across Windows/WSL, and the compose project name is fixed 'airwave'. If a
# stack already exists from a DIFFERENT directory (e.g. installed via WSL, now running from Windows), a second
# install here collides on the same containers, volumes, and ports.
if (-not $existing -and -not $DryRun) {
  $meta = Get-Meta
  $mp = if ($meta) { [string]$meta.'airwave.path.windows' } else { "" }
  if ($mp -and $mp -ne $dirAbs -and (Test-Path (Join-Path $mp ".env"))) {
    if ($mp -like '\\wsl*') {
      # WSL-internal install: docker compose can't be driven from a \\wsl$ dir on Windows, so hand off into WSL.
      $wslPath = [string]$meta.'airwave.path.wsl'
      $distro = if ($mp -match '^\\\\wsl[^\\]+\\([^\\]+)\\') { $Matches[1] } else { 'Ubuntu' }
      Info "Airwave is installed inside WSL ($distro) at:"
      Write-Host "  $wslPath"
      switch -Wildcard (Choose "What do you want to do?" @("Update it (runs inside WSL)", "Install a separate Windows copy here", "Quit")) {
        "Update*" {
          Info "Handing off to the installer inside WSL ($distro)..."
          wsl.exe -d $distro bash -lc "curl -fsSL https://www.getairwave.tv/install.sh | sh -s -- --install --dir '$wslPath' --version '$Version' --yes"
          exit $LASTEXITCODE
        }
        "Quit" { Die "Cancelled." }
      }
    } else {
      Info "Airwave is already installed at:"
      Write-Host "  $mp"
      switch -Wildcard (Choose "What do you want to do?" @("Update that install", "Install a separate copy here ($dirAbs)", "Quit")) {
        "Update*" { $Dir = $mp; $dirAbs = (Resolve-Path $mp).Path; $envPath = Join-Path $Dir ".env"; $existing = $true; Ok "Recentered on $dirAbs." }
        "Quit"    { Die "Cancelled." }
      }
    }
  }
}

# ---- configure -------------------------------------------------------------
$genPw = $false
if ($existing) {
  Info "Existing install found in $dirAbs - updating in place (keeping your settings)."
  if ($DryRun) {
    Plan "back up .env -> .env.bak"; Plan "set CG_IMAGE=$CgImage in .env"
  } else {
    Copy-Item $envPath "$envPath.bak" -Force
    Set-EnvVar $envPath "CG_IMAGE" $CgImage
  }
  $serverPublicUrl = (Get-Content $envPath | Where-Object { $_ -match '^SERVER_PUBLIC_URL=' } | ForEach-Object { $_ -replace '^SERVER_PUBLIC_URL=', '' } | Select-Object -First 1)
  $webPublicUrl    = (Get-Content $envPath | Where-Object { $_ -match '^WEB_PUBLIC_URL=' } | ForEach-Object { $_ -replace '^WEB_PUBLIC_URL=', '' } | Select-Object -First 1)
} else {
  Info "Setting up a new Airwave server in $dirAbs"
  Write-Host "The public URLs must be reachable from your browser and TVs (a LAN IP or domain), not localhost." -ForegroundColor DarkGray
  $ip = Get-LanIp
  $serverPort = Ask "Server (API) port" "36020"
  $webPort    = Ask "Admin web port" "36021"
  $tvPort     = Ask "Browser TV player port" $(if ($env:TV_WEB_PORT) { $env:TV_WEB_PORT } else { "36022" })
  $serverPublicUrl = Ask "Server public URL" "http://${ip}:${serverPort}"
  $webPublicUrl    = Ask "Admin web public URL" "http://${ip}:${webPort}"
  $tvUrl           = Ask "Browser TV player public URL" $(if ($env:TV_WEB_PUBLIC_URL) { $env:TV_WEB_PUBLIC_URL } else { "http://${ip}:${tvPort}" })
  $adminEmail = Ask "First admin email" "admin@example.com"
  $adminPass  = Ask "First admin password (blank = generate one)" ""
  if ([string]::IsNullOrWhiteSpace($adminPass)) { $adminPass = (New-Secret 12); $genPw = $true }
  $pgPass = New-Secret 24
  $authSecret = New-B64Secret 48
  $plexId = [guid]::NewGuid().ToString()   # stable, so Plex doesn't re-auth on each redeploy

  # Advanced options — opt-in (env-seedable for unattended use).
  $adv = $Advanced -or ($env:AIRWAVE_ADVANCED -eq "1")
  $pgVolume = $env:POSTGRES_DATA_VOLUME; $pgData = $env:PGDATA; $bumperVol = $env:BUMPER_MUSIC_VOLUME
  $workflow = if ($env:WORKFLOW_ENABLED) { $env:WORKFLOW_ENABLED -eq "1" } else { $true }
  $profiles = if ($env:COMPOSE_PROFILES) { $env:COMPOSE_PROFILES } else { "tvweb" }
  $tvServer = $env:TV_SERVER_URL   # reverse-proxy only; else the player uses SERVER_PUBLIC_URL
  $extraCors = $env:EXTRA_CORS_ORIGINS
  if (-not $adv -and -not $NonInteractive -and (Confirm "Configure advanced options (data locations, AI engine, TV player)?")) { $adv = $true }
  if ($adv) {
    Info "Advanced options"
    if (Confirm "Store the Postgres database on a host path instead of a Docker volume?") {
      $pgVolume = Ask "  Postgres data dir (host path)" (Join-Path $dirAbs "data/postgres")
      Warn "  Bind mounts need correct ownership; if Postgres won't start, chown that dir."
    }
    if (Confirm "Keep bumper music on a host path (drop files in, then 'Scan folder')?") {
      $bumperVol = Ask "  Bumper-music dir (host path)" (Join-Path $dirAbs "data/bumper-music")
    }
    if (Confirm "Enable the AI lineup workflow engine? (needs an AI key to use)" "yes") { $workflow = $true } else { $workflow = $false }
    if (Confirm "Serve the browser TV player (tvweb)?" "yes") {
      $profiles = "tvweb"
    } else {
      $profiles = ""; $tvUrl = ""
    }
    $extraCors = Ask "Extra admin origins to allow-list (comma-separated, blank = none)" ""
  }
  if ($pgVolume -and -not $pgData) { $pgData = "/var/lib/postgresql/data/pgdata" }

  if ($DryRun) {
    Plan "write .env (SERVER_PUBLIC_URL=$serverPublicUrl, CG_IMAGE=$CgImage, generated Postgres password + auth secret + Plex client id)"
    if ($pgVolume) { Plan "bind Postgres data -> $pgVolume (PGDATA=$pgData)" }
    if ($bumperVol) { Plan "bind bumper music -> $bumperVol" }
    if ($workflow) { Plan "enable the AI lineup workflow engine" }
    if ($profiles) { Plan "serve the browser TV player at $tvUrl" }
    if ($extraCors) { Plan "allow-list extra admin origins: $extraCors" }
  } else {
    if ($pgVolume) { New-Item -ItemType Directory -Force -Path $pgVolume | Out-Null }
    if ($bumperVol) { New-Item -ItemType Directory -Force -Path $bumperVol | Out-Null }
    $lines = @(
      "# Airwave self-host config - generated by install.ps1"
      "CG_IMAGE=$CgImage"
      ""
      "SERVER_PUBLIC_URL=$serverPublicUrl"
      "WEB_PUBLIC_URL=$webPublicUrl"
      "SERVER_PORT=$serverPort"
      "WEB_PORT=$webPort"
      ""
      "POSTGRES_USER=channelguide"
      "POSTGRES_PASSWORD=$pgPass"
      "POSTGRES_DB=channelguide"
      ""
      "# Do NOT change after first boot (stored Plex/AI secrets are encrypted with it)."
      "BETTER_AUTH_SECRET=$authSecret"
      "# Stable Plex client identity (kept across updates)."
      "PLEX_CLIENT_IDENTIFIER=$plexId"
      ""
      "ADMIN_EMAIL=$adminEmail"
      "ADMIN_PASSWORD=$adminPass"
      ""
      "PUID=1000"
      "PGID=1000"
      "UMASK=022"
      "TZ=UTC"
      ""
      "# ============================ Optional ============================"
    )
    if ($pgVolume) { $lines += @("POSTGRES_DATA_VOLUME=$pgVolume", "PGDATA=$pgData") }
    else { $lines += @("# POSTGRES_DATA_VOLUME=/mnt/tank/apps/airwave/postgres", "# PGDATA=/var/lib/postgresql/data/pgdata") }
    if ($bumperVol) { $lines += "BUMPER_MUSIC_VOLUME=$bumperVol" }
    else { $lines += "# BUMPER_MUSIC_VOLUME=/mnt/tank/apps/airwave/bumper-music" }
    if ($workflow) { $lines += "WORKFLOW_ENABLED=1" }
    else { $lines += "# WORKFLOW_ENABLED=1   # AI lineup engine (needs an AI provider key in the admin)" }
    if ($profiles) {
      $lines += @("COMPOSE_PROFILES=$profiles", "TV_WEB_PORT=$tvPort", "TV_WEB_PUBLIC_URL=$tvUrl")
      if ($tvServer) { $lines += "TV_SERVER_URL=$tvServer" }
      else { $lines += @("# Reverse proxy only: to serve the player at its own domain, set TV_WEB_PUBLIC_URL to that",
                         "# domain and TV_SERVER_URL to the same domain (/api + /img forwarded to the server).",
                         "# TV_SERVER_URL=https://tv.example.com") }
    }
    else { $lines += @("# COMPOSE_PROFILES=tvweb", "# TV_WEB_PORT=36022", "# TV_WEB_PUBLIC_URL=http://<host>:36022") }
    if ($extraCors) { $lines += "EXTRA_CORS_ORIGINS=$extraCors" }
    else { $lines += "# EXTRA_CORS_ORIGINS=http://192.168.1.10:36021" }
    $lines += @("# GOOGLE_CLIENT_ID=   GOOGLE_CLIENT_SECRET=", "# GITHUB_CLIENT_ID=   GITHUB_CLIENT_SECRET=")
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
    Ok "Wrote .env"
  }
}

# ---- fetch compose ---------------------------------------------------------
Info "docker-compose.yml"
$composePath = Join-Path $Dir "docker-compose.yml"
if ($DryRun) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $ComposeUrl | Out-Null; Ok "compose reachable at $ComposeUrl" }
  catch { Warn "couldn't reach $ComposeUrl" }
  Plan "write docker-compose.yml (name rewritten to 'airwave')"
} else {
  try { $composeText = (Invoke-WebRequest -UseBasicParsing -Uri $ComposeUrl).Content }
  catch { Die "couldn't download the compose file from $ComposeUrl" }
  if ($composeText -notmatch 'CG_ROLE') { Die "the downloaded compose file didn't look right; aborting (nothing changed)" }
  $composeText = ($composeText -replace '(?m)^name: channelguide$', 'name: airwave')
  Set-Content -Path $composePath -Value $composeText -Encoding UTF8
  Ok "Wrote docker-compose.yml"
}

# ---- stale-volume guard ----------------------------------------------------
# Fresh install on a Docker named volume: an existing DB volume keeps its original password, so the newly
# generated one won't match and the server can't connect. Offer to reset it rather than auth-fail loop.
if (-not $existing -and -not $pgVolume -and -not $DryRun) {
  $pgvol = "airwave_channelguide_pgdata"
  if (@(docker volume ls --format '{{.Name}}' 2>$null) -contains $pgvol) {
    Info "Found an existing Airwave database volume ($pgvol)."
    Push-Location $Dir
    docker compose up -d postgres *> $null
    for ($i = 0; $i -lt 20; $i++) { docker compose exec -T postgres pg_isready -U channelguide *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
    function Test-PgPw($pw) { docker compose exec -T -e "PGPASSWORD=$pw" postgres psql -h 127.0.0.1 -U channelguide -d channelguide -c 'select 1' *> $null; return ($LASTEXITCODE -eq 0) }
    if (Test-PgPw $pgPass) {
      Ok "The existing database accepts the configured password - reusing it (your data is kept)."
    } else {
      Warn "That database was created with a different password than the one just generated."
      $pick = Choose "How do you want to handle it?" @("Reuse it - enter the existing password (keeps your data)", "Wipe it and start fresh (DELETES that database)", "Quit")
      switch -Wildcard ($pick) {
        "Reuse*" {
          while ($true) {
            $ex = AskSecret "  Existing database password"
            if ($ex -and (Test-PgPw $ex)) { $pgPass = $ex; Set-EnvVar $envPath "POSTGRES_PASSWORD" $ex; Ok "Password accepted - reusing the database."; break }
            Warn "  That password didn't authenticate. Try again, or Ctrl-C to abort."
          }
        }
        "Wipe*" { docker compose down -v *> $null; docker volume rm $pgvol *> $null; Ok "Old database removed; a fresh one will be created." }
        default { docker compose down *> $null; Pop-Location; Die "Aborted. Nothing was changed." }
      }
    }
    Pop-Location
  }
}

# ---- pull + up -------------------------------------------------------------
if ($DryRun) {
  Plan "run: docker compose pull"; Plan "run: docker compose up -d"
} else {
  Push-Location $Dir
  Info "Pulling images ($CgImage)"
  docker compose pull; if ($LASTEXITCODE -ne 0) { Pop-Location; Die "docker compose pull failed. Does the tag '$Version' exist? Your running stack is untouched." }
  Info "Starting Airwave"
  docker compose up -d; if ($LASTEXITCODE -ne 0) { Pop-Location; Die "docker compose up failed." }
  Pop-Location
  Set-Content -Path (Join-Path $Dir $Marker) -Value (Get-Date -Format o) -Encoding UTF8
  Write-Meta $dirAbs
}

# ---- wait for health -------------------------------------------------------
if ($DryRun) {
  Plan "wait for $serverPublicUrl/api/health, then print the admin URL"
} else {
  Info "Waiting for the server (first start builds the admin, up to ~4 min)..."
  $up = $false
  for ($i = 0; $i -lt 48; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$($serverPublicUrl.TrimEnd('/'))/api/health" | Out-Null; $up = $true; break } catch { Start-Sleep -Seconds 5 }
  }
  if ($up) { Ok "Server is up" } else { Warn "Server didn't answer health yet - it may still be starting. Check: cd `"$dirAbs`"; docker compose logs -f" }
}

# ---- summary ---------------------------------------------------------------
$verb = if ($existing) { "updated" } else { "installed" }
Write-Host ""
Ok ("Airwave {0}{1} in {2}" -f $verb, $(if ($DryRun) { " (dry run - nothing changed)" } else { "" }), $dirAbs)
Write-Host "  Admin:  $webPublicUrl"
Write-Host "  Server: $serverPublicUrl"
if ($tvUrl) { Write-Host "  TV:     $tvUrl  (browser TV player)" }
if ($genPw) { Write-Host "  Admin login: $adminEmail / $adminPass  (generated - save this)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Update later:  cd `"$dirAbs`"; docker compose pull; docker compose up -d"
Write-Host "Uninstall:     ./install.ps1 -Uninstall"
Write-Host "Open the TV app and point it at $serverPublicUrl to watch."
