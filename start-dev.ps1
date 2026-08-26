param([int]$ParentProcessId = 0)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ProcessJob {
    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS {
        public UInt64 ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public UInt64 ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct BASIC_LIMITS {
        public Int64 PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public UInt32 LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public UInt32 ActiveProcessLimit;
        public Int64 Affinity;
        public UInt32 PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct EXTENDED_LIMITS {
        public BASIC_LIMITS BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")]
    public static extern bool SetInformationJobObject(IntPtr job, int infoClass,
        ref EXTENDED_LIMITS information, uint length);
    [DllImport("kernel32.dll")]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr handle);
}
'@

function New-KillOnCloseJob {
    $job = [ProcessJob]::CreateJobObject([IntPtr]::Zero, $null)
    if ($job -eq [IntPtr]::Zero) { throw 'Could not create the process job.' }
    $information = New-Object ProcessJob+EXTENDED_LIMITS
    $information.BasicLimitInformation.LimitFlags = 0x00002000
    $size = [Runtime.InteropServices.Marshal]::SizeOf($information)
    if (-not [ProcessJob]::SetInformationJobObject($job, 9, [ref]$information, $size)) {
        [ProcessJob]::CloseHandle($job) | Out-Null
        throw 'Could not enable kill-on-close for the process job.'
    }
    return $job
}

function Add-ProcessToJob([IntPtr]$Job, [Diagnostics.Process]$Process) {
    if (-not [ProcessJob]::AssignProcessToJobObject($Job, $Process.Handle)) {
        throw "Could not attach process $($Process.Id) to the process job."
    }
}

function Stop-ProcessTree([Diagnostics.Process]$Process) {
    if ($null -ne $Process -and -not $Process.HasExited) {
        & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
    }
}

Push-Location $projectRoot
try {
    & npm run build:packages
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $job = New-KillOnCloseJob
    $exitCode = 0
    try {
        $npm = (Get-Command npm.cmd).Source
        $web = Start-Process $npm -ArgumentList @(
            'run', 'start', '--workspace', '@munchkin-lan/web'
        ) -WorkingDirectory $projectRoot -NoNewWindow -PassThru
        Add-ProcessToJob $job $web

        $server = Start-Process $npm -ArgumentList @(
            'run', 'start:dev', '--workspace', '@munchkin-lan/server'
        ) -WorkingDirectory $projectRoot -NoNewWindow -PassThru
        Add-ProcessToJob $job $server

        while (-not $web.HasExited -and -not $server.HasExited) {
            if ($ParentProcessId -gt 0 -and
                $null -eq (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 250
            $web.Refresh()
            $server.Refresh()
        }
        if ($web.HasExited -and $web.ExitCode -ne 0) { $exitCode = $web.ExitCode }
        if ($server.HasExited -and $server.ExitCode -ne 0) { $exitCode = $server.ExitCode }
    }
    finally {
        Stop-ProcessTree $web
        Stop-ProcessTree $server
        [ProcessJob]::CloseHandle($job) | Out-Null
    }
    exit $exitCode
}
finally {
    Pop-Location
}
