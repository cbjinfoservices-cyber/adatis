<#
.SYNOPSIS
  Construit les packages d'installation hors ligne d'ASP Automation Service Portal.
.DESCRIPTION
  Produit dans deploy\package\dist :
    - asp-portal-<version>.tar.gz : package Linux (install.sh, k3s embarque optionnel)
    - asp-portal-<version>-windows.zip : package Windows (install.ps1, sans k3s)
  Chaque package contient images\images.tar.gz (images asp-api, asp-web et les images
  tierces epinglees dans deploy.sh) et SHA256SUMS.
  Prerequis : Docker Desktop demarre, tar.exe (Windows 10 1803+), acces Internet pour k3s.
.EXAMPLE
  .\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key
  .\deploy\package\build-package.ps1 -Version 1.0.0 -AllowUnsigned -NoK3s # test uniquement
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [string]$K3sVersion = 'v1.36.5+k3s1',
    [ValidateSet('amd64', 'arm64')][string]$K3sArch = 'amd64',
    [string]$BasePath = '/',
    [ValidatePattern('^[0-9a-f]{64}$')][string]$K3sInstallSha256 = '46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad',
    [string]$CosignKey,
    [switch]$AllowUnsigned,
    [switch]$NoK3s,
    [switch]$SkipImages
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
foreach ($cmd in 'docker', 'tar') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd introuvable" }
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker ne repond pas : demarrer Docker Desktop' }

# Les references d'images tierces sont lues dans deploy.sh (source unique).
$deployText = [IO.File]::ReadAllText((Join-Path $Root 'deploy\deploy.sh'))
$pgMatch = [regex]::Match($deployText, 'POSTGRES_IMAGE="\$\{POSTGRES_IMAGE:-([^}]+)\}"')
$bbMatch = [regex]::Match($deployText, 'BUSYBOX_IMAGE="\$\{BUSYBOX_IMAGE:-([^}]+)\}"')
if (-not ($pgMatch.Success -and $bbMatch.Success)) { throw 'References POSTGRES_IMAGE / BUSYBOX_IMAGE introuvables dans deploy.sh' }
$PostgresImage = $pgMatch.Groups[1].Value
$BusyboxImage = $bbMatch.Groups[1].Value
$PostgresTag = ($PostgresImage -split '@', 2)[0]
$BusyboxTag = ($BusyboxImage -split '@', 2)[0]

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

$ApiImage = "asp-api:$Version"
$WebImage = "asp-web:$Version"
if (-not $SkipImages) {
    Write-Host "== Construction de $ApiImage ($Platform)"
    & docker build --platform $Platform -t $ApiImage (Join-Path $Root 'api')
    if ($LASTEXITCODE -ne 0) { throw 'Build de l image API echoue' }

    Write-Host "== Construction de $WebImage (BASE_PATH=$BasePath)"
    & docker build --platform $Platform --build-arg "BASE_PATH=$BasePath" -t $WebImage -f (Join-Path $Root 'Dockerfile') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Build de l image web echoue' }

    Write-Host "== Telechargement des images tierces"
    foreach ($img in $PostgresImage, $BusyboxImage) {
        & docker pull --platform $Platform $img
        if ($LASTEXITCODE -ne 0) { throw "Pull de $img echoue" }
        $tag = $img -replace '@sha256:[0-9a-f]{64}$', ''
        & docker tag $img $tag
        if ($LASTEXITCODE -ne 0) { throw "Tag de $img echoue" }
    }
}

Write-Host '== Export des images (docker save)'
$TarImages = Join-Path $Work 'images.tar'
& docker save -o $TarImages $ApiImage $WebImage $PostgresTag $BusyboxTag
if ($LASTEXITCODE -ne 0) { throw 'docker save echoue' }

# ---------------------------------------------------------------------------
# 2. Arborescence commune
# ---------------------------------------------------------------------------
$Stage = Join-Path $Work $Name
New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'images') | Out-Null
Compress-GzipFile $TarImages (Join-Path $Stage 'images\images.tar.gz')
Remove-Item -LiteralPath $TarImages -Force

Copy-Script (Join-Path $PkgSrc 'install.sh') (Join-Path $Stage 'install.sh')
Copy-Item -LiteralPath (Join-Path $PkgSrc 'config.env.example') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $PkgSrc 'INSTALL.md') -Destination $Stage
Copy-Item -LiteralPath (Join-Path $Root 'db') -Destination $Stage -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'deploy\k8s') | Out-Null
Copy-Script (Join-Path $Root 'deploy\deploy.sh') (Join-Path $Stage 'deploy\deploy.sh')
Copy-Item -Path (Join-Path $Root 'deploy\k8s\*.yaml') -Destination (Join-Path $Stage 'deploy\k8s')

$k3sLine = ''
if (-not $NoK3s) {
    Write-Host "== Telechargement de k3s $K3sVersion ($K3sArch)"
    $k3sDir = Join-Path $Stage 'k3s'
    New-Item -ItemType Directory -Force -Path $k3sDir | Out-Null
    $base = "https://github.com/k3s-io/k3s/releases/download/$($K3sVersion.Replace('+', '%2B'))"
    $k3sBinaryName = if ($K3sArch -eq 'arm64') { 'k3s-arm64' } else { 'k3s' }
    Invoke-WebRequest -Uri "$base/$k3sBinaryName" -OutFile (Join-Path $k3sDir $k3sBinaryName) -UseBasicParsing
    Invoke-WebRequest -Uri "$base/k3s-airgap-images-$K3sArch.tar.zst" -OutFile (Join-Path $k3sDir "k3s-airgap-images-$K3sArch.tar.zst") -UseBasicParsing
    $sums = (Invoke-WebRequest -Uri "$base/sha256sum-$K3sArch.txt" -UseBasicParsing).Content
    foreach ($f in $k3sBinaryName, "k3s-airgap-images-$K3sArch.tar.zst") {
        $expected = ([regex]::Match($sums, "(?m)^([0-9a-f]{64})\s+\*?$([regex]::Escape($f))\s*$")).Groups[1].Value
        if (-not $expected) { throw "Empreinte de $f absente de sha256sum-$K3sArch.txt" }
        $actual = (Get-FileHash -LiteralPath (Join-Path $k3sDir $f) -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expected) { throw "Empreinte invalide pour $f (telechargement corrompu)" }
    }
    $installUrlVersion = $K3sVersion.Replace('+', '%2B')
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/k3s-io/k3s/$installUrlVersion/install.sh" -OutFile (Join-Path $k3sDir 'install.sh') -UseBasicParsing
    $installHash = (Get-FileHash -LiteralPath (Join-Path $k3sDir 'install.sh') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($installHash -ne $K3sInstallSha256) { throw "Empreinte invalide pour k3s/install.sh : mettez a jour K3sInstallSha256 depuis une source de confiance" }
    $k3sLine = $k3sBinaryName
}

Write-LfFile (Join-Path $Stage 'VERSION') (@(
    "TAG=$Version",
    "API_IMAGE=asp-api:$Version",
    "WEB_IMAGE=asp-web:$Version",
    "POSTGRES_IMAGE=$PostgresTag",
    "BUSYBOX_IMAGE=$BusyboxTag",
    "K3S_VERSION=$K3sVersion",
    "K3S_ARCH=$K3sArch",
    "K3S_BINARY=$k3sLine",
    "THIRD_PARTY_IMAGES=`"$PostgresImage $BusyboxImage`""
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
Write-LfFile (Join-Path $WinStage 'VERSION') ((Get-Content -LiteralPath (Join-Path $Stage 'VERSION') -Raw) -replace '(?m)^K3S_BINARY=.*$', 'K3S_BINARY=')
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
