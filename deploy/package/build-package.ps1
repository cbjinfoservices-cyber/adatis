<#
.SYNOPSIS
  Construit les packages d'installation hors ligne d'ASP Automation Service Portal.
.DESCRIPTION
  Produit dans deploy\package\dist :
    - asp-portal-<version>.tar.gz : package Linux (install.sh, k3s embarque optionnel)
    - asp-portal-<version>-windows.zip : package Windows (install.ps1, sans k3s)
  -NoImages omet images\images.tar.gz ; le cluster doit deja fournir les images.
  -BuildFromSource inclut les sources pour construire les images au moment de l'installation.
  Prerequis : tar.exe (Windows 10 1803+) ; Docker et acces Internet pour les images/k3s.
.EXAMPLE
  .\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key
  .\deploy\package\build-package.ps1 -Version 1.0.0 -AllowUnsigned -NoK3s -NoImages # test uniquement
  .\deploy\package\build-package.ps1 -Version 1.0.0 -AllowUnsigned -NoK3s -NoImages -BuildFromSource # test uniquement
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$K3sVersion = 'v1.36.6+k3s1',
    [ValidateSet('amd64', 'arm64')][string]$K3sArch = 'amd64',
    [string]$BasePath = '/',
    [string]$ApiImageRef,
    [string]$WebImageRef,
    [string]$PostgresImageRef,
    [string]$BusyboxImageRef,
    [ValidatePattern('^[0-9a-f]{64}$')][string]$K3sInstallSha256 = '46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad',
    [string]$CosignKey,
    [switch]$AllowUnsigned,
    [switch]$NoK3s,
    [switch]$SkipImages,
    [switch]$NoImages,
    [switch]$BuildFromSource
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$PkgSrc = Join-Path $Root 'deploy\package'
$Dist = Join-Path $PkgSrc 'dist'
$Name = "asp-portal-$Version"
$Platform = "linux/$K3sArch"

if ($Version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw "Version invalide : $Version" }
if ($AllowUnsigned -and $CosignKey) { throw 'Choisir -CosignKey ou -AllowUnsigned, pas les deux' }
if (-not $CosignKey -and -not $AllowUnsigned) {
    throw 'Signature obligatoire pour un package de production : fournir -CosignKey (ou -AllowUnsigned uniquement pour les builds de test)'
}
if ($CosignKey) {
    if (-not (Test-Path -LiteralPath $CosignKey -PathType Leaf)) { throw "Cle cosign introuvable : $CosignKey" }
    if (-not (Get-Command cosign -ErrorAction SilentlyContinue)) { throw 'cosign introuvable : requis pour signer les packages' }
}
if ($AllowUnsigned) { Write-Warning 'Build non signe : reserve aux tests, ne pas distribuer en production' }
if ($NoImages -and -not $NoK3s) { throw '-NoImages requiert -NoK3s : un package sans images cible un cluster deja installe' }
if ($BuildFromSource -and (-not $NoImages -or -not $NoK3s)) {
    throw '-BuildFromSource requiert -NoImages et -NoK3s'
}
if (-not $NoK3s -and $K3sVersion -ne 'v1.36.6+k3s1') {
    throw 'Les overrides d images k3s sont valides uniquement pour v1.36.6+k3s1'
}
foreach ($cmd in 'tar') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd introuvable" }
}
if (-not $NoImages) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker introuvable' }
    & docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker ne repond pas : demarrer Docker Desktop' }
}

# Les references d'images tierces sont lues dans deploy.sh.
$deployText = [IO.File]::ReadAllText((Join-Path $Root 'deploy\deploy.sh'))
$bbMatch = [regex]::Match($deployText, 'BUSYBOX_IMAGE="\$\{BUSYBOX_IMAGE:-([^}]+)\}"')
if (-not $bbMatch.Success) { throw 'Reference BUSYBOX_IMAGE introuvable dans deploy.sh' }
$BusyboxImage = $bbMatch.Groups[1].Value
$BusyboxTag = ($BusyboxImage -split '@', 2)[0]
$PostgresTag = "asp-postgres:$Version"

function Write-LfFile([string]$Path, [string]$Text) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
}

function Copy-Script([string]$Source, [string]$Destination) {
    Write-LfFile $Destination ([IO.File]::ReadAllText($Source))
}

function Write-Checksums([string]$Dir) {
    $lines = Get-ChildItem -LiteralPath $Dir -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS' } | Sort-Object FullName | ForEach-Object {
        $rel = $_.FullName.Substring($Dir.Length).TrimStart('\', '/').Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $rel"
    }
    Write-LfFile (Join-Path $Dir 'SHA256SUMS') (($lines -join "`n") + "`n")
}

function Compress-GzipFile([string]$Source, [string]$Destination) {
    $in = [IO.File]::OpenRead($Source)
    try {
        $out = [IO.File]::Create($Destination)
        try {
            $gz = New-Object IO.Compression.GZipStream($out, [IO.Compression.CompressionLevel]::Optimal)
            try { $in.CopyTo($gz) } finally { $gz.Dispose() }
        } finally { $out.Dispose() }
    } finally { $in.Dispose() }
}

# ---------------------------------------------------------------------------
# 1. Images
# ---------------------------------------------------------------------------
$Work = Join-Path $Dist '_work'
if (Test-Path $Work) { Remove-Item -LiteralPath $Work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Work | Out-Null

$ApiImage = if ($NoImages -and $ApiImageRef) { $ApiImageRef } else { "asp-api:$Version" }
$WebImage = if ($NoImages -and $WebImageRef) { $WebImageRef } else { "asp-web:$Version" }
$PostgresImage = if ($NoImages -and $PostgresImageRef) { $PostgresImageRef } else { $PostgresTag }
$BusyboxTag = if ($NoImages -and $BusyboxImageRef) { $BusyboxImageRef } else { $BusyboxTag }
$IncludeImages = if ($NoImages) { 'false' } else { 'true' }
if (-not $NoImages -and -not $SkipImages) {
    Write-Host "== Construction de $ApiImage ($Platform)"
    & docker build --pull --no-cache --platform $Platform -t $ApiImage (Join-Path $Root 'api')
    if ($LASTEXITCODE -ne 0) { throw 'Build de l image API echoue' }

    Write-Host "== Construction de $WebImage (BASE_PATH=$BasePath)"
    & docker build --pull --no-cache --platform $Platform --build-arg "BASE_PATH=$BasePath" -t $WebImage -f (Join-Path $Root 'Dockerfile') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Build de l image web echoue' }

    Write-Host "== Construction de $PostgresImage"
    & docker build --pull --no-cache --platform $Platform -t $PostgresImage -f (Join-Path $Root 'deploy\package\postgres.Dockerfile') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Build de l image PostgreSQL durcie echoue' }

    Write-Host "== Telechargement des images tierces"
    foreach ($img in $BusyboxImage) {
        & docker pull --platform $Platform $img
        if ($LASTEXITCODE -ne 0) { throw "Pull de $img echoue" }
        $tag = $img -replace '@sha256:[0-9a-f]{64}$', ''
        & docker tag $img $tag
        if ($LASTEXITCODE -ne 0) { throw "Tag de $img echoue" }
    }
}

if (-not $NoImages) {
    Write-Host '== Export des images (docker save)'
    $TarImages = Join-Path $Work 'images.tar'
    & docker save -o $TarImages $ApiImage $WebImage $PostgresTag $BusyboxTag
    if ($LASTEXITCODE -ne 0) { throw 'docker save echoue' }
}

# ---------------------------------------------------------------------------
# 2. Arborescence commune
# ---------------------------------------------------------------------------
$Stage = Join-Path $Work $Name
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
if (-not $NoImages) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'images') | Out-Null
    Compress-GzipFile $TarImages (Join-Path $Stage 'images\images.tar.gz')
    Remove-Item -LiteralPath $TarImages -Force
}

Copy-Script (Join-Path $PkgSrc 'install.sh') (Join-Path $Stage 'install.sh')
Copy-Item -LiteralPath (Join-Path $PkgSrc 'config.env.example') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $PkgSrc 'INSTALL.md') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $Root 'db') -Destination $Stage -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'deploy\k8s') | Out-Null
Copy-Script (Join-Path $Root 'deploy\deploy.sh') (Join-Path $Stage 'deploy\deploy.sh')
Copy-Item -Path (Join-Path $Root 'deploy\k8s\*.yaml') -Destination (Join-Path $Stage 'deploy\k8s')

if ($BuildFromSource) {
    $sourceFiles = @(
        '.dockerignore', 'Dockerfile', 'index.html', 'package.json', 'package-lock.json',
        'postcss.config.ts', 'tailwind.config.ts', 'tsconfig.app.json', 'tsconfig.json',
        'tsconfig.node.json', 'vite-env.d.ts', 'vite.config.ts'
    )
    foreach ($file in $sourceFiles) {
        $source = Join-Path $Root $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Fichier source requis absent : $file" }
        Copy-Item -LiteralPath $source -Destination $Stage
    }
    foreach ($directory in 'public', 'src') {
        Copy-Item -LiteralPath (Join-Path $Root $directory) -Destination $Stage -Recurse
    }

    $apiStage = Join-Path $Stage 'api'
    New-Item -ItemType Directory -Force -Path $apiStage | Out-Null
    foreach ($file in '.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json') {
        $source = Join-Path (Join-Path $Root 'api') $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Fichier source requis absent : api\$file" }
        Copy-Item -LiteralPath $source -Destination $apiStage
    }
    foreach ($directory in 'scripts', 'src') {
        Copy-Item -LiteralPath (Join-Path (Join-Path $Root 'api') $directory) -Destination $apiStage -Recurse
    }
    Copy-Item -LiteralPath (Join-Path $Root 'deploy\nginx.conf') -Destination (Join-Path $Stage 'deploy')
    $packageDeployDir = Join-Path $Stage 'deploy\package'
    New-Item -ItemType Directory -Force -Path $packageDeployDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $PkgSrc 'postgres.Dockerfile') -Destination $packageDeployDir
}

$k3sLine = ''
$k3sSourceImagesSha256 = ''
if (-not $NoK3s) {
    Write-Host "== Telechargement de k3s $K3sVersion ($K3sArch)"
    $k3sDir = Join-Path $Stage 'k3s'
    New-Item -ItemType Directory -Force -Path $k3sDir | Out-Null
    $base = "https://github.com/k3s-io/k3s/releases/download/$($K3sVersion.Replace('+', '%2B'))"
    $k3sBinaryName = if ($K3sArch -eq 'arm64') { 'k3s-arm64' } else { 'k3s' }
    Invoke-WebRequest -Uri "$base/$k3sBinaryName" -OutFile (Join-Path $k3sDir $k3sBinaryName) -UseBasicParsing
    Invoke-WebRequest -Uri "$base/k3s-airgap-images-$K3sArch.tar.zst" -OutFile (Join-Path $k3sDir "k3s-airgap-images-$K3sArch.tar.zst") -UseBasicParsing
    $releaseSumsPath = Join-Path $k3sDir "sha256sum-$K3sArch.txt"
    Invoke-WebRequest -Uri "$base/sha256sum-$K3sArch.txt" -OutFile $releaseSumsPath -UseBasicParsing
    $sums = [IO.File]::ReadAllText($releaseSumsPath)
    foreach ($f in $k3sBinaryName, "k3s-airgap-images-$K3sArch.tar.zst") {
        $expected = ([regex]::Match($sums, "(?m)^([0-9a-f]{64})\s+\*?$([regex]::Escape($f))\s*$")).Groups[1].Value
        if (-not $expected) { throw "Empreinte de $f absente de sha256sum-$K3sArch.txt" }
        $actual = (Get-FileHash -LiteralPath (Join-Path $k3sDir $f) -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expected) { throw "Empreinte invalide pour $f (telechargement corrompu)" }
    }
    $sourceArchive = Join-Path $k3sDir "k3s-airgap-images-$K3sArch.tar.zst"
    $k3sSourceImagesSha256 = (Get-FileHash -LiteralPath $sourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host '== Chargement de l archive officielle des images k3s'
    & docker image load -i $sourceArchive
    if ($LASTEXITCODE -ne 0) { throw 'Chargement de l archive officielle k3s echoue' }

    $k3sSystemImages = @(
        'rancher/klipper-helm:v0.13.3-build20261021',
        'rancher/klipper-lb:v0.4.17',
        'rancher/local-path-provisioner:v0.0.37',
        'rancher/mirrored-coredns-coredns:1.14.7',
        'rancher/mirrored-library-busybox:1.37.0',
        'rancher/mirrored-library-traefik:3.7.15',
        'rancher/mirrored-metrics-server:v0.9.0',
        'rancher/mirrored-pause:3.10.2'
    )
    foreach ($image in $k3sSystemImages) {
        & docker image inspect $image *> $null
        if ($LASTEXITCODE -ne 0) { throw "Image systeme absente de l archive k3s : $image" }
        $imagePlatform = & docker image inspect --format '{{.Os}}/{{.Architecture}}' $image
        if ($LASTEXITCODE -ne 0) { throw "Inspection de la plateforme k3s echouee : $image" }
        if ($imagePlatform -ne $Platform) { throw "Plateforme inattendue pour $image : $imagePlatform" }
    }

    $helmPin = 'rancher/klipper-helm@sha256:e2289066485f0bd74730401d3fbd91f6918c5e5bd100943aa743b6f39dfc3019'
    $lbPin = 'rancher/klipper-lb@sha256:fb8981e8c235a6e276dc94033948e60f1a82219c579629b957dfa1d640b64a72'
    foreach ($pin in $helmPin, $lbPin) {
        & docker pull --platform $Platform $pin
        if ($LASTEXITCODE -ne 0) { throw "Telechargement de l image k3s corrigee echoue : $pin" }
    }
    & docker tag $helmPin $k3sSystemImages[0]
    if ($LASTEXITCODE -ne 0) { throw 'Tag de klipper-helm echoue' }
    & docker tag $lbPin $k3sSystemImages[1]
    if ($LASTEXITCODE -ne 0) { throw 'Tag de klipper-lb echoue' }

    $localPathImage = 'asp-k3s-local-path:v0.0.37-asp1'
    Write-Host '== Construction de local-path-provisioner durci'
    & docker build --pull --no-cache --platform $Platform -t $localPathImage `
        -f (Join-Path $PkgSrc 'k3s-local-path.Dockerfile') $PkgSrc
    if ($LASTEXITCODE -ne 0) { throw 'Build de local-path-provisioner durci echoue' }
    & docker tag $localPathImage $k3sSystemImages[2]
    if ($LASTEXITCODE -ne 0) { throw 'Tag de local-path-provisioner echoue' }
    foreach ($image in $k3sSystemImages) {
        & docker image inspect $image *> $null
        if ($LASTEXITCODE -ne 0) { throw "Image systeme k3s indisponible : $image" }
        $imagePlatform = & docker image inspect --format '{{.Os}}/{{.Architecture}}' $image
        if ($LASTEXITCODE -ne 0) { throw "Inspection de la plateforme k3s echouee : $image" }
        if ($imagePlatform -ne $Platform) { throw "Plateforme inattendue pour $image : $imagePlatform" }
    }

    $customTar = Join-Path $k3sDir "k3s-airgap-images-$K3sArch.tar"
    $customArchive = Join-Path $k3sDir "k3s-airgap-images-$K3sArch.tar.gz"
    Write-Host '== Recreation de l archive air-gap avec les overrides tracés'
    & docker image save --platform $Platform -o $customTar $k3sSystemImages
    if ($LASTEXITCODE -ne 0) { throw 'Export de l archive k3s personnalisee echoue' }
    Compress-GzipFile $customTar $customArchive
    Remove-Item -LiteralPath $customTar -Force
    Remove-Item -LiteralPath $sourceArchive -Force
    Copy-Item -LiteralPath (Join-Path $PkgSrc 'K3S-IMAGE-OVERRIDES.txt') -Destination $k3sDir

    $installUrlVersion = $K3sVersion.Replace('+', '%2B')
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/k3s-io/k3s/$installUrlVersion/install.sh" -OutFile (Join-Path $k3sDir 'install.sh') -UseBasicParsing
    $installHash = (Get-FileHash -LiteralPath (Join-Path $k3sDir 'install.sh') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($installHash -ne $K3sInstallSha256) { throw "Empreinte invalide pour k3s/install.sh : mettez a jour K3sInstallSha256 depuis une source de confiance" }
    $k3sLine = $k3sBinaryName
}

Write-LfFile (Join-Path $Stage 'VERSION') (@(
    "TAG=$Version",
    "API_IMAGE=$ApiImage",
    "WEB_IMAGE=$WebImage",
    "POSTGRES_IMAGE=$PostgresImage",
    "BUSYBOX_IMAGE=$BusyboxTag",
    "K3S_VERSION=$K3sVersion",
    "K3S_ARCH=$K3sArch",
    "K3S_BINARY=$k3sLine",
    "K3S_SOURCE_IMAGES_SHA256=$k3sSourceImagesSha256",
    "THIRD_PARTY_IMAGES=`"$BusyboxImage`"",
    "INCLUDE_IMAGES=$IncludeImages",
    "BUILD_FROM_SOURCE=$($BuildFromSource.ToString().ToLowerInvariant())"
) -join "`n")

# ---------------------------------------------------------------------------
# 3. Package Linux (.tar.gz)
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
Write-Host '== Package Linux'
Write-Checksums $Stage
$LinuxArchive = Join-Path $Dist "$Name.tar.gz"
Remove-Item -LiteralPath $LinuxArchive -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$LinuxArchive.sigstore.json" -ErrorAction SilentlyContinue
& tar.exe -czf $LinuxArchive -C $Work $Name
if ($LASTEXITCODE -ne 0) { throw 'Creation de l archive Linux echouee' }

# ---------------------------------------------------------------------------
# 4. Package Windows (.zip, sans k3s, avec install.ps1)
# ---------------------------------------------------------------------------
Write-Host '== Package Windows'
$WinWork = Join-Path $Work 'win'
$WinStage = Join-Path $WinWork $Name
New-Item -ItemType Directory -Force -Path $WinWork | Out-Null
& robocopy.exe $Stage $WinStage /E /XD k3s /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a echoue (code $LASTEXITCODE)" }
Write-LfFile (Join-Path $WinStage 'VERSION') ((Get-Content -LiteralPath (Join-Path $Stage 'VERSION') -Raw) -replace '(?m)^K3S_BINARY=.*$', 'K3S_BINARY=' -replace '(?m)^K3S_SOURCE_IMAGES_SHA256=.*$', 'K3S_SOURCE_IMAGES_SHA256=')
Copy-Item -LiteralPath (Join-Path $PkgSrc 'install.ps1') -Destination $WinStage
Write-Checksums $WinStage
$WinArchive = Join-Path $Dist "$Name-windows.zip"
Remove-Item -LiteralPath $WinArchive -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$WinArchive.sigstore.json" -ErrorAction SilentlyContinue
Compress-Archive -LiteralPath $WinStage -DestinationPath $WinArchive

if ($CosignKey) {
    foreach ($archive in $LinuxArchive, $WinArchive) {
        Write-Host "== Signature de $(Split-Path -Leaf $archive)"
        & cosign sign-blob --yes --key $CosignKey --bundle "$archive.sigstore.json" $archive
        if ($LASTEXITCODE -ne 0) { throw "Signature de $archive echouee" }
    }
}

Remove-Item -LiteralPath $Work -Recurse -Force
Write-Host "== Termine"
Get-ChildItem -LiteralPath $Dist -File | ForEach-Object { '{0}  {1:N0} Mo' -f $_.Name, ($_.Length / 1MB) }
