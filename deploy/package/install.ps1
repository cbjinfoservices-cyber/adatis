<#
.SYNOPSIS
  Installe ASP Automation Service Portal depuis le package Windows (sur un cluster existant).
.DESCRIPTION
  1. Verifie l'integrite du package (SHA256SUMS).
  2. Charge images\images.tar.gz dans Docker (ou le pousse vers REGISTRY).
  3. Lance deploy\deploy.sh --skip-build avec Git Bash, avec les parametres de config.env.
  Prerequis : Docker Desktop, kubectl avec un kubeconfig vers le cluster cible, Git Bash.
  Pour une VM Linux vierge, utiliser le package .tar.gz et install.sh a la place.
.EXAMPLE
  Copy-Item config.env.example config.env   # puis renseigner les valeurs
  .\install.ps1
  .\install.ps1 -DeployArgs '--no-ingress'
#>
[CmdletBinding()]
param(
    [string]$ConfigFile = (Join-Path $PSScriptRoot 'config.env'),
    [string[]]$DeployArgs = @()
)

$ErrorActionPreference = 'Stop'
$PkgDir = $PSScriptRoot

function Read-KeyValueFile([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $text = $line.Trim()
        if ($text -eq '' -or $text.StartsWith('#')) { continue }
        if ($text -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { throw "Ligne invalide dans ${Path} : $text" }
        if ($values.ContainsKey($Matches[1])) { throw "Cle dupliquee dans ${Path} : $($Matches[1])" }
        $value = $Matches[2].Trim()
        if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
        $values[$Matches[1]] = $value
    }
    return $values
}

function Protect-ConfigFile([string]$Path) {
    try {
        $acl = Get-Acl -LiteralPath $Path
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
        $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
        $administratorsSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
        $rules = @(
            (New-Object System.Security.AccessControl.FileSystemAccessRule(
                [Security.Principal.WindowsIdentity]::GetCurrent().User, 'Modify', 'Allow')),
            (New-Object System.Security.AccessControl.FileSystemAccessRule(
                $systemSid, 'FullControl', 'Allow')),
            (New-Object System.Security.AccessControl.FileSystemAccessRule(
                $administratorsSid, 'FullControl', 'Allow'))
        )
        foreach ($rule in $rules) { $acl.AddAccessRule($rule) }
        Set-Acl -LiteralPath $Path -AclObject $acl
    } catch {
        throw "Impossible de proteger config.env (ACL utilisateur uniquement) : $($_.Exception.Message)"
    }
}

Write-Host '== Verification de l integrite du package'
$sumsPath = Join-Path $PkgDir 'SHA256SUMS'
if (-not (Test-Path -LiteralPath $sumsPath -PathType Leaf)) { throw 'SHA256SUMS absent' }
$reparsePoints = @(Get-ChildItem -LiteralPath $PkgDir -Force -Recurse |
    Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
if ($reparsePoints.Count) { throw 'Liens symboliques interdits dans le package' }
$expectedFiles = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PkgDir 'SHA256SUMS')) {
    if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { throw "SHA256SUMS : ligne invalide : $line" }
    $relativePath = $Matches[2]
    if ($relativePath.StartsWith('/') -or $relativePath.Contains('\') -or $relativePath -match '(^|/)\.\.?(/|$)') {
        throw "SHA256SUMS : chemin invalide : $relativePath"
    }
    if ($expectedFiles.ContainsKey($relativePath)) { throw "SHA256SUMS : doublon : $relativePath" }
    $expectedFiles[$relativePath] = $Matches[1]
    $file = Join-Path $PkgDir ($relativePath.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Fichier manquant : $($Matches[2])" }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Matches[1]) { throw "Empreinte invalide : $($Matches[2]) (package altere)" }
}
$actualFiles = @(Get-ChildItem -LiteralPath $PkgDir -Recurse -File |
    ForEach-Object { $_.FullName.Substring($PkgDir.Length).TrimStart('\', '/').Replace('\', '/') } |
    Where-Object { $_ -ne 'SHA256SUMS' -and $_ -ne 'config.env' } |
    Sort-Object -CaseSensitive)
$manifestFiles = @($expectedFiles.Keys | Sort-Object -CaseSensitive)
if (Compare-Object -ReferenceObject $actualFiles -DifferenceObject $manifestFiles -CaseSensitive) {
    throw 'SHA256SUMS : fichiers manquants, surnumeraires ou dupliques'
}
foreach ($required in 'VERSION', 'config.env.example', 'images/images.tar.gz', 'install.ps1', 'deploy/deploy.sh') {
    if (-not $expectedFiles.ContainsKey($required)) { throw "Fichier requis absent de SHA256SUMS : $required" }
}
$version = Read-KeyValueFile (Join-Path $PkgDir 'VERSION')
if (-not $version.ContainsKey('TAG') -or -not $version['TAG']) { throw 'TAG absent de VERSION' }
foreach ($key in $version.Keys) {
    if ($key -notin @(
        'TAG', 'API_IMAGE', 'WEB_IMAGE', 'POSTGRES_IMAGE', 'BUSYBOX_IMAGE',
        'K3S_VERSION', 'K3S_ARCH', 'K3S_BINARY', 'THIRD_PARTY_IMAGES',
        'BASE_PATH', 'PLATFORM', 'BUILT_AT', 'COMMIT'
    )) {
        throw "Cle $key non autorisee dans VERSION"
    }
}
if (-not $version['API_IMAGE'] -or -not $version['WEB_IMAGE']) { throw 'Images API/WEB absentes de VERSION' }
Write-Host "OK Package $($version.TAG) integre"

foreach ($cmd in 'docker', 'kubectl') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd introuvable" }
}

# bash du Windows (WSL) ne voit pas les variables d'environnement Windows : Git Bash obligatoire.
$gitBash = @(
    (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $gitBash) { throw 'Git Bash introuvable : installer Git for Windows (https://git-scm.com)' }

$config = @{}
if (Test-Path -LiteralPath $ConfigFile) {
    Protect-ConfigFile $ConfigFile
    $config = Read-KeyValueFile $ConfigFile
    $allowedKeys = @(
        'KUBECONFIG', 'K3S_INSTALL', 'K3S_EXTRA_ARGS', 'REGISTRY', 'NAMESPACE', 'DOMAIN',
        'LETSENCRYPT_EMAIL', 'CERT_MANAGER_ISSUER', 'TLS_CERT_FILE', 'TLS_KEY_FILE', 'TLS_SELF_SIGNED',
        'AWX_BASE_URL', 'AWX_CLIENT_ID', 'AWX_CLIENT_SECRET', 'AWX_ADMIN_USERS', 'ASCENDER_CA_FILE',
        'SESSION_IDLE_MINUTES', 'SESSION_TTL_HOURS', 'INGRESS_NAMESPACE', 'API_EGRESS_CIDR',
        'CONNECTOR_ALLOWED_HOSTS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD',
        'ALERT_EMAIL_TO', 'ALERT_EMAIL_FROM', 'PORTAL_URL', 'AWX_REDIRECT_URI', 'AWX_SCOPES',
        'TOKEN_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEYS_PREVIOUS', 'FORCE_DB_PASSWORD', 'ALLOWED_ORIGINS',
        'API_URL', 'BASE_PATH', 'DB_NAME', 'DB_USER', 'RESEND_API_KEY', 'ALLOW_EXTERNAL_MAIL'
    )
    foreach ($key in $config.Keys) {
        if ($key -notin $allowedKeys) { throw "Cle $key non autorisee dans config.env" }
    }
    Write-Host "Configuration : $ConfigFile"
} else {
    throw 'config.env requis : copier config.env.example et renseigner les parametres de production'
}
if (-not $config['API_EGRESS_CIDR'] -or $config['API_EGRESS_CIDR'] -in @('0.0.0.0/0', '::/0')) {
    throw 'API_EGRESS_CIDR doit limiter l egress aux reseaux Ascender, SMTP et connecteurs'
}
foreach ($key in $config.Keys) {
    [Environment]::SetEnvironmentVariable($key, $config[$key], 'Process')
}
[Environment]::SetEnvironmentVariable('TAG', $version.TAG, 'Process')

$registry = $config['REGISTRY']
$kubeContext = (& kubectl config current-context 2>$null)
if ($LASTEXITCODE -ne 0) { throw 'kubectl : aucun contexte actif (verifier KUBECONFIG)' }
& kubectl cluster-info *> $null
if ($LASTEXITCODE -ne 0) { throw "Cluster injoignable avec le contexte '$kubeContext'" }
Write-Host "OK Cluster : $kubeContext"

$archive = Join-Path $PkgDir 'images\images.tar.gz'
$tar = Join-Path $env:TEMP "asp-portal-images-$([guid]::NewGuid().ToString('N')).tar"
try {
    Write-Host '== Chargement des images dans Docker'
    $in = [IO.File]::OpenRead($archive)
    try {
        $gz = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
        $out = [IO.File]::Create($tar)
        try { $gz.CopyTo($out) } finally { $out.Dispose(); $gz.Dispose() }
    } finally { $in.Dispose() }
    & docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker ne repond pas : demarrer Docker Desktop' }
    & docker load -i $tar
    if ($LASTEXITCODE -ne 0) { throw 'docker load a echoue' }
}
finally {
    Remove-Item -LiteralPath $tar -Force -ErrorAction SilentlyContinue
}

if ($registry) {
    foreach ($image in $version.API_IMAGE, $version.WEB_IMAGE) {
        Write-Host "== Push de $registry/$image"
        & docker tag $image "$registry/$image"
        if ($LASTEXITCODE -ne 0) { throw "Tag de $image echoue" }
        & docker push "$registry/$image"
        if ($LASTEXITCODE -ne 0) { throw "Push de $image echoue" }
    }
} elseif ($kubeContext -ne 'docker-desktop') {
    Write-Warning "REGISTRY non defini et contexte '$kubeContext' : le cluster doit partager le runtime Docker de cette machine"
}

Write-Host '== Deploiement (deploy.sh --skip-build)'
Push-Location $PkgDir
try {
    & $gitBash ./deploy/deploy.sh --skip-build @DeployArgs
    if ($LASTEXITCODE -ne 0) { throw "deploy.sh a echoue (code $LASTEXITCODE)" }
}
finally { Pop-Location }
Write-Host 'OK Installation terminee'
