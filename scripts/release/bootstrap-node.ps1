param(
    [Parameter(Mandatory = $true)]
    [string] $RepositoryRoot,
    [switch] $Silent
)

$ErrorActionPreference = 'Stop'

function Write-Phase([string] $Message) {
    if (-not $Silent) { Write-Host "[bootstrap] $Message" }
}

function Get-Sha256([string] $LiteralPath) {
    $stream = [System.IO.File]::OpenRead($LiteralPath)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $hasher.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
}

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$manifestPath = Join-Path $resolvedRoot 'dependencies.manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Dependency manifest is missing at $manifestPath."
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 2 -or $manifest.runtime.name -ne 'Node.js') {
    throw 'Dependency manifest schema or runtime is unsupported.'
}
$version = [string] $manifest.runtime.exactVersion
$archiveName = [string] $manifest.runtime.portable.archive
$archiveUrl = [string] $manifest.runtime.portable.url
$expectedSha = ([string] $manifest.runtime.portable.sha256).ToLowerInvariant()
$expectedNodeExeSha = ([string] $manifest.runtime.portable.nodeExecutableSha256).ToLowerInvariant()
if ($archiveName -ne "node-v$version-win-x64.zip" -or $archiveUrl -ne "https://nodejs.org/dist/v$version/$archiveName" -or $expectedSha -notmatch '^[0-9a-f]{64}$' -or $expectedNodeExeSha -notmatch '^[0-9a-f]{64}$') {
    throw 'Dependency manifest does not contain a canonical exact Node.js portable archive and digest.'
}

$productRoot = Join-Path $env:LOCALAPPDATA 'DingDingProjects\HairGrowthEstimator'
$toolchainRoot = Join-Path $productRoot 'toolchain'
$downloadRoot = Join-Path $productRoot 'downloads'
$nodeRoot = Join-Path $toolchainRoot "node-v$version-win-x64"
$nodeExe = Join-Path $nodeRoot 'node.exe'
$archivePath = Join-Path $downloadRoot $archiveName
New-Item -ItemType Directory -Path $toolchainRoot -Force | Out-Null
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
    $archiveSha = Get-Sha256 $archivePath
    if ($archiveSha -ne $expectedSha) {
        Write-Phase 'The cached Node.js archive digest is wrong. Removing only that invalid cached file.'
        Remove-Item -LiteralPath $archivePath -Force
    }
}

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    $downloadPath = "$archivePath.$PID.partial"
    Write-Phase "Downloading exact Node.js $version from $archiveUrl."
    try {
        Invoke-WebRequest -Uri $archiveUrl -OutFile $downloadPath -UseBasicParsing
        $downloadSha = Get-Sha256 $downloadPath
        if ($downloadSha -ne $expectedSha) {
            throw "Node.js archive digest mismatch. Expected $expectedSha but received $downloadSha."
        }
        Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
    }
    finally {
        if (Test-Path -LiteralPath $downloadPath) { Remove-Item -LiteralPath $downloadPath -Force }
    }
}

$verifiedSha = Get-Sha256 $archivePath
if ($verifiedSha -ne $expectedSha) {
    throw "Cached Node.js archive digest mismatch. Expected $expectedSha but received $verifiedSha."
}

if (Test-Path -LiteralPath $nodeExe -PathType Leaf) {
    $observed = (& $nodeExe --version).Trim()
    $installedSha = Get-Sha256 $nodeExe
    if ($LASTEXITCODE -eq 0 -and $observed -eq "v$version" -and $installedSha -eq $expectedNodeExeSha) {
        Write-Phase "Reverified Node.js $observed archive and installed executable at $nodeRoot."
        exit 0
    }
}

$stagingRoot = Join-Path $toolchainRoot ".node-$version-$PID-stage"
if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
try {
    Write-Phase "Extracting the verified archive into $toolchainRoot."
    Expand-Archive -LiteralPath $archivePath -DestinationPath $stagingRoot -Force
    $stagedNodeRoot = Join-Path $stagingRoot "node-v$version-win-x64"
    $stagedNodeExe = Join-Path $stagedNodeRoot 'node.exe'
    if (-not (Test-Path -LiteralPath $stagedNodeExe -PathType Leaf)) { throw 'Verified Node.js archive did not contain node.exe at the declared path.' }
    if ((Get-Sha256 $stagedNodeExe) -ne $expectedNodeExeSha) { throw 'Verified Node.js archive extracted unexpected node.exe bytes.' }
    $observed = (& $stagedNodeExe --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $observed -ne "v$version") { throw "Extracted Node.js runtime reported '$observed' instead of v$version." }
    if (Test-Path -LiteralPath $nodeRoot) {
        $backup = "$nodeRoot.invalid.$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
        Move-Item -LiteralPath $nodeRoot -Destination $backup
        Write-Phase "Moved the invalid prior runtime to $backup for recoverable inspection."
    }
    Move-Item -LiteralPath $stagedNodeRoot -Destination $nodeRoot
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}

$finalVersion = (& $nodeExe --version).Trim()
if ($LASTEXITCODE -ne 0 -or $finalVersion -ne "v$version" -or (Get-Sha256 $nodeExe) -ne $expectedNodeExeSha) { throw 'Node.js bootstrap completed without the exact declared runtime.' }
Write-Phase "Installed and verified Node.js $finalVersion at $nodeRoot with SHA-256 $verifiedSha."
