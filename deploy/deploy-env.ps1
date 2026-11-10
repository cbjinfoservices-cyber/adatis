<#
.SYNOPSIS
  Deploiement ASP par environnement (dev, staging, prod) depuis Windows.
.DESCRIPTION
  Lit deploy/environments/<env>.env et applique les memes regles que deploy-env.sh.
  -Target compose : execute directement avec docker.
  -Target k8s     : delegue a deploy-env.sh via bash (Git Bash ou WSL), car deploy.sh est en bash.
.EXAMPLE
  .\deploy\deploy-env.ps1 -Environment dev -Target compose
  .\deploy\deploy-env.ps1 -Environment staging -Target k8s -SkipBuild
  .\deploy\deploy-env.ps1 -Environment prod -Target k8s -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('dev', 'staging', 'prod')][string]$Environment,
    [Parameter(Mandatory)][ValidateSet('k8s', 'compose')][string]$Target,
    [switch]$SkipBuild,
    [switch]$ResetDb,
    [switch]$NoIngress,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ProfilePath = Join-Path $Root "deploy\environments\$Environment.env"
if (-not (Test-Path -LiteralPath $ProfilePath)) {
    throw "Profil introuvable : $ProfilePath (copier $Environment.env.example)"
}

if ($Target -eq 'k8s') {
    if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
        throw 'bash introuvable : installer Git Bash ou WSL pour le deploiement Kubernetes'
    }
    $bashArgs = @('--env', $Environment, '--target', 'k8s')
    if ($SkipBuild) { $bashArgs += '--skip-build' }
    if ($ResetDb)   { $bashArgs += '--reset-db' }
    if ($NoIngress) { $bashArgs += '--no-ingress' }
    if ($DryRun)    { $bashArgs += '--dry-run' }

    Push-Location $Root
    try {
        & bash ./deploy/deploy-env.sh @bashArgs
        if ($LASTEXITCODE -ne 0) { throw "deploy-env.sh a echoue (code $LASTEXITCODE)" }
    }
    finally { Pop-Location }
    return
}

# --- Compose : memes regles que deploy-env.sh ----------------------------------
$vars = @{}
foreach ($line in Get-Content -LiteralPath $ProfilePath) {
    $text = $line.Trim()
    if ($text -eq '' -or $text.StartsWith('#')) { continue }
    if ($text -notmatch '^([A-Z_][A-Z0-9_]*)=(.*)$') { throw "Ligne invalide dans ${ProfilePath} : $text" }
    $vars[$Matches[1]] = $Matches[2]
}
function Get-ProfileValue([string]$Name) {
    if ($vars.ContainsKey($Name)) { $vars[$Name] } else { '' }
}

if ((Get-ProfileValue 'APP_ENV') -ne $Environment) { throw "APP_ENV doit valoir '$Environment' dans $ProfilePath" }
if ($Environment -ne 'dev') {
    if ((Get-ProfileValue 'NODE_ENV') -cne 'production') { throw "$Environment : NODE_ENV doit valoir production" }
    if ((Get-ProfileValue 'AUTH_MODE') -cne 'awx')       { throw "$Environment : AUTH_MODE doit valoir awx (SSO Ascender)" }
    if ((Get-ProfileValue 'COOKIE_SECURE') -cne 'true')  { throw "$Environment : COOKIE_SECURE doit valoir true" }
    if ((Get-ProfileValue 'PORTAL_URL') -notlike 'https://*')   { throw "$Environment : PORTAL_URL doit etre en https://" }
    if ((Get-ProfileValue 'AWX_BASE_URL') -notlike 'https://*') { throw "$Environment : AWX_BASE_URL doit etre en https://" }
}
if ($Environment -eq 'prod') {
    throw 'prod ne se deploie pas avec Docker Compose (pas de TLS PostgreSQL) : utiliser -Target k8s'
}
if ($ResetDb)   { throw "-ResetDb n'est pas disponible avec compose" }
if ($NoIngress) { throw "-NoIngress n'est pas disponible avec compose" }
if (-not (Get-ProfileValue 'DB_PASSWORD')) { throw 'DB_PASSWORD est obligatoire avec compose' }
if ($Environment -ne 'dev' -and -not (Get-ProfileValue 'TOKEN_ENCRYPTION_KEY')) {
    throw "TOKEN_ENCRYPTION_KEY est obligatoire pour $Environment"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker introuvable' }

$composeFile = Join-Path $Root 'deploy\compose\docker-compose.yml'
$base = @('compose', '-p', "asp-portal-$Environment", '-f', $composeFile, '--env-file', $ProfilePath)

if ($DryRun) {
    & docker @base config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Validation Compose echouee' }
    Write-Host "OK Profil $Environment valide (compose)"
    return
}

$up = @('up', '-d')
if (-not $SkipBuild) { $up += '--build' }
Write-Host "Deploiement $Environment avec Docker Compose (projet asp-portal-$Environment)"
& docker @base @up
if ($LASTEXITCODE -ne 0) { throw "docker compose a echoue (code $LASTEXITCODE)" }
