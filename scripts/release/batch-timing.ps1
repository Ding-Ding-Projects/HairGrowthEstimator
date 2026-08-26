[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('start', 'phase-start', 'phase-finish', 'fail', 'finish')]
    [string]$Event,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ScriptName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$StatePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PhaseInventory,

    [string]$Phase,
    [ValidateSet('success', 'failure')]
    [string]$Status
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$terminalEvent = $Event -eq 'finish' -or $Event -eq 'fail'

function Get-EpochMilliseconds {
    return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function Format-UtcInstant {
    param([long]$EpochMilliseconds)
    return [DateTimeOffset]::FromUnixTimeMilliseconds($EpochMilliseconds).UtcDateTime.ToString(
        "yyyy-MM-ddTHH:mm:ss.fff'Z'",
        [Globalization.CultureInfo]::InvariantCulture
    )
}

function Format-StableDuration {
    param(
        [long]$StartedEpochMilliseconds,
        [long]$CompletedEpochMilliseconds
    )

    $elapsedMilliseconds = [Math]::Max(0, $CompletedEpochMilliseconds - $StartedEpochMilliseconds)
    $totalSeconds = [long][Math]::Floor($elapsedMilliseconds / 1000)
    $hours = [long][Math]::Floor($totalSeconds / 3600)
    $minutes = [long][Math]::Floor(($totalSeconds % 3600) / 60)
    $seconds = [long]($totalSeconds % 60)
    return '{0:D2}:{1:D2}:{2:D2}' -f $hours, $minutes, $seconds
}

function Get-PhaseNames {
    $names = @($PhaseInventory -split ';')
    if ($names.Count -eq 0 -or $names -contains '') {
        throw 'The phase inventory must contain non-empty semicolon-separated names.'
    }
    if (@($names | Select-Object -Unique).Count -ne $names.Count) {
        throw 'The phase inventory must not contain duplicate names.'
    }
    foreach ($name in $names) {
        if ($name -notmatch '^[a-z][a-z0-9-]*$') {
            throw "Invalid phase name: $name"
        }
    }
    return $names
}

function Write-State {
    param([object]$State)

    $parent = Split-Path -Parent $StatePath
    if ([string]::IsNullOrWhiteSpace($parent)) {
        throw 'The timing state path must have a parent directory.'
    }
    $null = New-Item -ItemType Directory -Force -Path $parent
    $temporaryPath = "$StatePath.tmp.$PID.$([Guid]::NewGuid().ToString('N'))"
    try {
        $json = $State | ConvertTo-Json -Depth 8
        [IO.File]::WriteAllText($temporaryPath, $json + [Environment]::NewLine, $utf8WithoutBom)
        Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

function Read-State {
    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
        throw "Timing state is missing: $StatePath"
    }
    $state = ConvertFrom-Json ([IO.File]::ReadAllText($StatePath, $utf8WithoutBom))
    if ($state.schemaVersion -ne 1) {
        throw 'The timing state schema is unsupported.'
    }
    if ($state.scriptName -cne $ScriptName) {
        throw 'The timing state belongs to a different script.'
    }
    if ((@($state.phaseInventory) -join ';') -cne $PhaseInventory) {
        throw 'The timing state phase inventory does not match the current script.'
    }
    return $state
}

function Write-PhaseResult {
    param(
        [object]$State,
        [string]$PhaseName,
        [string]$ResultStatus,
        [long]$CompletedEpochMilliseconds
    )

    if ($null -eq $State.activePhase -or $State.activePhase.name -cne $PhaseName) {
        throw "Phase $PhaseName is not the active phase."
    }
    $startedEpochMilliseconds = [long]$State.activePhase.startedEpochMilliseconds
    $entry = [ordered]@{
        name = $PhaseName
        startedEpochMilliseconds = $startedEpochMilliseconds
        completedEpochMilliseconds = $CompletedEpochMilliseconds
        status = $ResultStatus
    }
    $State.phases = @($State.phases) + @($entry)
    $State.activePhase = $null
    $State.nextPhaseIndex = [int]$State.nextPhaseIndex + 1
    Write-Output (
        'Phase {0} started {1}, completed {2}, duration {3}, status {4}.' -f
        $PhaseName,
        (Format-UtcInstant $startedEpochMilliseconds),
        (Format-UtcInstant $CompletedEpochMilliseconds),
        (Format-StableDuration $startedEpochMilliseconds $CompletedEpochMilliseconds),
        $ResultStatus
    )
}

function Write-OverallResult {
    param(
        [object]$State,
        [string]$ResultStatus,
        [long]$CompletedEpochMilliseconds
    )

    $startedEpochMilliseconds = [long]$State.startedEpochMilliseconds
    Write-Output (
        'Overall started {0}, completed {1}, duration {2}, status {3}.' -f
        (Format-UtcInstant $startedEpochMilliseconds),
        (Format-UtcInstant $CompletedEpochMilliseconds),
        (Format-StableDuration $startedEpochMilliseconds $CompletedEpochMilliseconds),
        $ResultStatus
    )
}

try {
    $phaseNames = @(Get-PhaseNames)
    switch ($Event) {
        'start' {
            if (Test-Path -LiteralPath $StatePath) {
                throw "Timing state already exists: $StatePath"
            }
            $startedEpochMilliseconds = Get-EpochMilliseconds
            $state = [ordered]@{
                schemaVersion = 1
                scriptName = $ScriptName
                phaseInventory = $phaseNames
                startedEpochMilliseconds = $startedEpochMilliseconds
                nextPhaseIndex = 0
                activePhase = $null
                phases = @()
            }
            Write-State $state
            Write-Output (
                'Overall started {0}, status running. Phase inventory: {1}.' -f
                (Format-UtcInstant $startedEpochMilliseconds),
                $PhaseInventory
            )
        }
        'phase-start' {
            if ([string]::IsNullOrWhiteSpace($Phase)) {
                throw 'A phase name is required for phase-start.'
            }
            $state = Read-State
            if ($null -ne $state.activePhase) {
                throw "Phase $($state.activePhase.name) is already active."
            }
            $nextIndex = [int]$state.nextPhaseIndex
            if ($nextIndex -ge $phaseNames.Count -or $phaseNames[$nextIndex] -cne $Phase) {
                throw "Phase $Phase is not the next declared phase."
            }
            $startedEpochMilliseconds = Get-EpochMilliseconds
            $state.activePhase = [ordered]@{
                name = $Phase
                startedEpochMilliseconds = $startedEpochMilliseconds
            }
            Write-State $state
            Write-Output ('Phase {0} started {1}, status running.' -f $Phase, (Format-UtcInstant $startedEpochMilliseconds))
        }
        'phase-finish' {
            if ([string]::IsNullOrWhiteSpace($Phase)) {
                throw 'A phase name is required for phase-finish.'
            }
            if ([string]::IsNullOrWhiteSpace($Status)) {
                throw 'A status is required for phase-finish.'
            }
            $state = Read-State
            $completedEpochMilliseconds = Get-EpochMilliseconds
            Write-PhaseResult $state $Phase $Status $completedEpochMilliseconds
            Write-State $state
        }
        'finish' {
            if ([string]::IsNullOrWhiteSpace($Status)) {
                throw 'A status is required for finish.'
            }
            $state = Read-State
            if ($null -ne $state.activePhase) {
                throw "Phase $($state.activePhase.name) is still active."
            }
            if ($Status -eq 'success' -and [int]$state.nextPhaseIndex -ne $phaseNames.Count) {
                throw 'A successful overall result requires every declared phase to complete.'
            }
            if ($Status -eq 'success' -and @($state.phases | Where-Object { $_.status -cne 'success' }).Count -ne 0) {
                throw 'A successful overall result requires every completed phase to be successful.'
            }
            Write-OverallResult $state $Status (Get-EpochMilliseconds)
        }
        'fail' {
            $resultStatus = if ([string]::IsNullOrWhiteSpace($Status)) { 'failure' } else { $Status }
            $state = Read-State
            $completedEpochMilliseconds = Get-EpochMilliseconds
            if ($null -ne $state.activePhase) {
                Write-PhaseResult $state $state.activePhase.name $resultStatus $completedEpochMilliseconds
            }
            Write-OverallResult $state $resultStatus $completedEpochMilliseconds
        }
    }
}
finally {
    if ($terminalEvent -and (Test-Path -LiteralPath $StatePath)) {
        Remove-Item -LiteralPath $StatePath -Force
    }
}
