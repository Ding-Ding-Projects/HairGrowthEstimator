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
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Dependency manifest is missing at $manifestPath." }
$dependencyManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$gitManifest = $dependencyManifest.git
$version = [string] $gitManifest.exactVersion
$archiveName = [string] $gitManifest.archive
$archiveUrl = [string] $gitManifest.url
$expectedArchiveSha = ([string] $gitManifest.sha256).ToLowerInvariant()
$expectedCommandSha = ([string] $gitManifest.commandExecutableSha256).ToLowerInvariant()
$expectedCoreSha = ([string] $gitManifest.coreExecutableSha256).ToLowerInvariant()
$expectedUrl = "https://github.com/git-for-windows/git/releases/download/v$version/$archiveName"
if ($archiveName -ne "MinGit-$($version.Replace('.windows.', '.'))-64-bit.zip" -or $archiveUrl -ne $expectedUrl) {
    throw 'Dependency manifest does not contain the canonical MinGit asset URL.'
}
foreach ($digest in @($expectedArchiveSha, $expectedCommandSha, $expectedCoreSha)) {
    if ($digest -notmatch '^[0-9a-f]{64}$') { throw 'Dependency manifest contains an invalid MinGit digest.' }
}

$productRoot = Join-Path $env:LOCALAPPDATA 'DingDingProjects\HairGrowthEstimator'
$toolchainRoot = Join-Path $productRoot 'toolchain'
$downloadRoot = Join-Path $productRoot 'downloads'
$gitRoot = Join-Path $toolchainRoot "MinGit-$($version.Replace('.windows.', '.'))-64-bit"
$gitExe = Join-Path $gitRoot 'cmd\git.exe'
$gitCoreExe = Join-Path $gitRoot 'mingw64\bin\git.exe'
$archivePath = Join-Path $downloadRoot $archiveName
New-Item -ItemType Directory -Path $toolchainRoot -Force | Out-Null
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
    if ((Get-Sha256 $archivePath) -ne $expectedArchiveSha) {
        Write-Phase 'The cached MinGit archive digest is wrong. Removing only that invalid cached file.'
        Remove-Item -LiteralPath $archivePath -Force
    }
}
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    $downloadPath = "$archivePath.$PID.partial"
    Write-Phase "Downloading exact MinGit $version from $archiveUrl."
    try {
        Invoke-WebRequest -Uri $archiveUrl -OutFile $downloadPath -UseBasicParsing
        $downloadSha = Get-Sha256 $downloadPath
        if ($downloadSha -ne $expectedArchiveSha) { throw "MinGit archive digest mismatch. Expected $expectedArchiveSha but received $downloadSha." }
        Move-Item -LiteralPath $downloadPath -Destination $archivePath -Force
    }
    finally {
        if (Test-Path -LiteralPath $downloadPath) { Remove-Item -LiteralPath $downloadPath -Force }
    }
}
if ((Get-Sha256 $archivePath) -ne $expectedArchiveSha) { throw 'Cached MinGit archive failed its repeated digest check.' }

$installedValid = (Test-Path -LiteralPath $gitExe -PathType Leaf) -and (Test-Path -LiteralPath $gitCoreExe -PathType Leaf)
if ($installedValid) {
    $installedValid = (Get-Sha256 $gitExe) -eq $expectedCommandSha -and (Get-Sha256 $gitCoreExe) -eq $expectedCoreSha
}
if ($installedValid) {
    $reported = (& $gitExe --version).Trim()
    $installedValid = $LASTEXITCODE -eq 0 -and $reported -eq "git version $version"
}
if ($installedValid) {
    Write-Phase "Reverified MinGit $version archive and installed executables at $gitRoot."
    exit 0
}

$stagingRoot = Join-Path $toolchainRoot ".mingit-$PID-$([Guid]::NewGuid().ToString('N')).stage"
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
try {
    Expand-Archive -LiteralPath $archivePath -DestinationPath $stagingRoot -Force
    $stagedGit = Join-Path $stagingRoot 'cmd\git.exe'
    $stagedCore = Join-Path $stagingRoot 'mingw64\bin\git.exe'
    if ((Get-Sha256 $stagedGit) -ne $expectedCommandSha -or (Get-Sha256 $stagedCore) -ne $expectedCoreSha) {
        throw 'Verified MinGit archive extracted unexpected executable bytes.'
    }
    if ((& $stagedGit --version).Trim() -ne "git version $version") { throw 'Extracted MinGit reports the wrong version.' }
    if (Test-Path -LiteralPath $gitRoot) {
        $backup = "$gitRoot.invalid.$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
        Move-Item -LiteralPath $gitRoot -Destination $backup
        Write-Phase "Moved the invalid prior MinGit runtime to $backup for recoverable inspection."
    }
    Move-Item -LiteralPath $stagingRoot -Destination $gitRoot
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}

if ((Get-Sha256 $gitExe) -ne $expectedCommandSha -or (Get-Sha256 $gitCoreExe) -ne $expectedCoreSha) {
    throw 'MinGit bootstrap completed without the exact declared executable bytes.'
}
Write-Phase "Installed and verified MinGit $version at $gitRoot."
