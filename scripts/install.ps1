<#
.SYNOPSIS
  Airwave one-line installer (Docker path) for Windows.

.EXAMPLE
  irm https://getairwave.tv/install.ps1 | iex
  # with options, download then run:
  #   iwr https://getairwave.tv/install.ps1 -OutFile install.ps1; ./install.ps1 -Version 0.14.13
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
  [string]$Dir     = $(if ($env:AIRWAVE_DIR) { $env:AIRWAVE_DIR } else { "./airwave" }),
  [switch]$DryRun,
  [switch]$Uninstall,
  [switch]$Purge,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$ImageRepo   = "ghcr.io/quixomatic/airwave"
$ComposeUrl  = if ($env:AIRWAVE_COMPOSE_URL) { $env:AIRWAVE_COMPOSE_URL } else { "https://getairwave.tv/docker-compose.yml" }
$Marker      = ".airwave-install"
$NonInteractive = $Yes -or ($env:AIRWAVE_NONINTERACTIVE -eq "1")

function Info($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X   $m" -ForegroundColor Red; exit 1 }
function Plan($m) { Write-Host "[dry-run] would $m" -ForegroundColor DarkGray }

function Ask($question, $default) {
  if ($NonInteractive) { return $default }
  $suffix = if ($default) { " [$default]" } else { "" }
  $ans = Read-Host "$question$suffix"
  if ([string]::IsNullOrWhiteSpace($ans)) { return $default }
  return $ans
}
function Confirm($question) {
  if ($NonInteractive) { return $false }
  $ans = Read-Host "$question [y/N]"
  return ($ans -match '^(y|Y|yes|YES)$')
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

# ---- version -> image tag --------------------------------------------------
$Version = $Version -replace '^v', ''
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = "latest" }
$CgImage = "${ImageRepo}:${Version}"

$mode = if ($Uninstall) { "uninstall" } else { "install" }
Info ("=== Airwave {0}{1} ===" -f $mode, $(if ($DryRun) { " (dry run)" } else { "" }))

# ---- preflight -------------------------------------------------------------
$dockerOk = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerOk = $true } } catch {}
}
if (-not $dockerOk) {
  if ($DryRun) { Warn "Docker not reachable (dry-run: continuing)." }
  else { Die "Docker Desktop isn't installed or running. Get it at https://docs.docker.com/desktop/, start it, then re-run." }
} else { Ok "Docker is ready" }

# ---- uninstall -------------------------------------------------------------
if ($mode -eq "uninstall") {
  if (-not (Test-Path $Dir)) { Die "no Airwave install directory at $Dir (use -Dir to point at it)." }
  Push-Location $Dir
  $dirAbs = (Get-Location).Path
  if (-not ((Test-Path "docker-compose.yml") -or (Test-Path $Marker))) { Die "no Airwave install found in $dirAbs." }

  if ($DryRun) { Plan "run: docker compose down" } else { docker compose down; Ok "Removed the Airwave containers." }

  $removeData = $Purge -or (Confirm "Also DELETE all data (the Postgres database + bumper music)? This cannot be undone")
  if ($removeData) {
    if ($DryRun) { Plan "run: docker compose down -v" } else { docker compose down -v; Ok "Deleted the data volumes." }
    $removeDir = $Purge -or (Confirm "Delete the install directory $dirAbs (.env, docker-compose.yml)?")
    if ($removeDir) {
      if ($DryRun) { Plan "delete $dirAbs" } else { Pop-Location; Remove-Item -Recurse -Force $dirAbs; Ok "Deleted $dirAbs." }
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
  $serverPublicUrl = Ask "Server public URL" "http://${ip}:${serverPort}"
  $webPublicUrl    = Ask "Admin web public URL" "http://${ip}:${webPort}"
  $adminEmail = Ask "First admin email" "admin@example.com"
  $adminPass  = Ask "First admin password (blank = generate one)" ""
  if ([string]::IsNullOrWhiteSpace($adminPass)) { $adminPass = (New-Secret 12); $genPw = $true }
  $pgPass = New-Secret 24
  $authSecret = New-B64Secret 48

  if ($DryRun) {
    Plan "write .env (SERVER_PUBLIC_URL=$serverPublicUrl, WEB_PUBLIC_URL=$webPublicUrl, CG_IMAGE=$CgImage, generated Postgres password + auth secret)"
  } else {
@"
# Airwave self-host config - generated by install.ps1
CG_IMAGE=$CgImage

SERVER_PUBLIC_URL=$serverPublicUrl
WEB_PUBLIC_URL=$webPublicUrl
SERVER_PORT=$serverPort
WEB_PORT=$webPort

POSTGRES_USER=channelguide
POSTGRES_PASSWORD=$pgPass
POSTGRES_DB=channelguide

BETTER_AUTH_SECRET=$authSecret

ADMIN_EMAIL=$adminEmail
ADMIN_PASSWORD=$adminPass

PUID=1000
PGID=1000
UMASK=022
TZ=UTC
"@ | Set-Content -Path $envPath -Encoding UTF8
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
if ($genPw) { Write-Host "  Admin login: $adminEmail / $adminPass  (generated - save this)" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Update later:  cd `"$dirAbs`"; docker compose pull; docker compose up -d"
Write-Host "Uninstall:     ./install.ps1 -Uninstall"
Write-Host "Open the TV app and point it at $serverPublicUrl to watch."
