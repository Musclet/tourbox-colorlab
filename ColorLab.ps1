param([ValidateSet('Install','Restore')][string]$Mode = $env:COLORLAB_MODE)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramFiles 'TourBox Console'
$launcher = Join-Path $root 'TourBox Console.exe'
$runtime = Join-Path $root 'app\TourBox.exe'
$resources = Join-Path $root 'app\resources'
$active = Join-Path $resources 'app.asar'

function Get-PackageHash([string]$File) {
    if (Test-Path -LiteralPath $File -PathType Leaf) { return (Get-FileHash -LiteralPath $File).Hash }
    return ''
}

function Assert-TourBoxClosed {
    if (Get-Process -Name 'TourBox Console','TourBox' -ErrorAction SilentlyContinue) {
        throw 'Quit TourBox Console from the Windows system tray, then run this tool again.'
    }
}

function Start-Builder([string]$Source, [string]$Output) {
    $builder = Join-Path $PSScriptRoot 'build-tourbox-patch.cjs'
    $run = New-Object Diagnostics.ProcessStartInfo
    $run.FileName = $runtime
    $run.Arguments = '"{0}" "{1}" "{2}"' -f $builder, $Source, $Output
    $run.UseShellExecute = $false
    $run.CreateNoWindow = $true
    $run.RedirectStandardOutput = $true
    $run.RedirectStandardError = $true
    $run.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
    $process = [Diagnostics.Process]::Start($run)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw ('Build failed: ' + $stderr.Result.Trim()) }
        Write-Host $stdout.Result.Trim()
    } finally { $process.Dispose() }
}

$staged = $null
$built = $null
$restoredPatch = $null
try {
    if (!(Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'TourBox Console was not found in Program Files.' }
    $versions = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'versions.json') -Raw | ConvertFrom-Json
    $currentHash = Get-PackageHash $active
    if (!$currentHash) { throw 'The active TourBox archive is missing. Repair TourBox using its official installer.' }
    $supported = @($versions | Where-Object { $currentHash -in @($_.original,$_.previous,$_.patched) })
    if ($supported.Count -ne 1) { throw 'Unsupported TourBox build. Use the matching ColorLab release.' }
    $version = $supported[0]
    $backup = Join-Path $resources ('app.asar.before-colorlab-' + $version.version)
    $restorePath = $backup
    if ($Mode -eq 'Install') {
        if ($currentHash -eq $version.patched) { Write-Host 'TourBox ColorLab is already installed.'; exit 0 }
        if ((Test-Path -LiteralPath $backup) -and (Get-PackageHash $backup) -ne $currentHash) {
            throw 'The backup for this TourBox version differs from the active package. No files were changed.'
        }
    } else {
        if ($currentHash -ne $version.patched) { throw 'The active TourBox package does not contain this ColorLab patch.' }
        if ($version.version -eq '5.12.0-beta10.1' -and !(Test-Path -LiteralPath $restorePath)) {
            $restorePath = Join-Path $resources 'app.asar.before-colorlab'
            if (!(Test-Path -LiteralPath $restorePath)) { $restorePath = Join-Path $resources 'app.asar.before-inkpick' }
        }
        if ((Get-PackageHash $restorePath) -notin @($version.original,$version.previous)) {
            throw 'No verified backup for the active TourBox version is available.'
        }
    }
    Assert-TourBoxClosed
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $scriptPath = $PSCommandPath.Replace("'", "''")
        $command = "& '$scriptPath' -Mode '$Mode'"
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
        $worker = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @(
            '-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded
        ) -Verb RunAs -WindowStyle Hidden -PassThru -Wait
        if ($worker.ExitCode -ne 0) {
            throw 'The elevated operation failed. TourBox can be reopened after checking the files or running Restore.cmd.'
        }
        Write-Host 'Done. Open TourBox Console from the Start menu.'
        exit 0
    }

    $nonce = [Guid]::NewGuid().ToString('N')
    $staged = Join-Path $resources ('app.asar.colorlab-' + $nonce)
    if ($Mode -eq 'Install') {
        $source = $active
        if ($currentHash -eq $version.previous) { $source = Join-Path $resources 'app.asar.backup' }
        if ((Get-PackageHash $source) -ne $version.original) { throw 'The original TourBox backup is missing or unsupported.' }
        $built = Join-Path ([IO.Path]::GetTempPath()) ('colorlab-' + $nonce + '.asar')
        Start-Builder $source $built
        $replacement = $built
        $replacementHash = $version.patched
    } else {
        $replacement = $restorePath
        $replacementHash = Get-PackageHash $restorePath
    }
    [IO.File]::Copy($replacement, $staged, $false)
    if ((Get-PackageHash $staged) -ne $replacementHash) { throw 'The staged archive failed its checksum.' }
    Assert-TourBoxClosed
    if ((Get-PackageHash $active) -ne $currentHash) { throw 'The active TourBox archive changed during preparation.' }

    if ($Mode -eq 'Install') {
        [IO.File]::Replace($staged, $active, $backup)
    } else {
        $restoredPatch = Join-Path $resources ('app.asar.colorlab-restore-' + $nonce)
        [IO.File]::Replace($staged, $active, $restoredPatch)
        if ($restorePath -eq $backup -and (Get-PackageHash $active) -eq $replacementHash) {
            Remove-Item -LiteralPath $backup -ErrorAction SilentlyContinue
        }
    }
    if ((Get-PackageHash $active) -ne $replacementHash) { throw 'Archive verification failed after replacement.' }
    if ($restoredPatch) { Remove-Item -LiteralPath $restoredPatch -ErrorAction SilentlyContinue }
    Write-Host 'Done. Open TourBox Console from the Start menu.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    foreach ($file in @($staged,$built)) {
        if ($file -and (Test-Path -LiteralPath $file)) { Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue }
    }
}
