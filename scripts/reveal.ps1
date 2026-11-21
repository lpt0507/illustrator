# Link Forge - reveal a file in Explorer and bring that window to the front.
# Explorer started by another process normally opens behind the caller, so the
# matching window handle is located through Shell.Application and activated.
# The caller passes the path through a UTF-8 file: Illustrator's app.system()
# throws whenever the command line itself carries CJK or UNC characters.
param(
    [string]$Path,
    [string]$PathFile,
    [string]$ResultFile
)

$ErrorActionPreference = 'Stop'

function Write-Log([string]$Value) {
    try {
        $line = ('{0:yyyy-MM-dd HH:mm:ss} | ps1 {1}' -f (Get-Date), $Value)
        Add-Content -Path (Join-Path $env:TEMP 'LinkForge.log') -Value $line -Encoding UTF8
    } catch { }
}

function Write-Result([string]$Value) {
    Write-Log $Value
    if ($ResultFile) {
        try {
            [System.IO.File]::WriteAllText($ResultFile, $Value, (New-Object System.Text.UTF8Encoding($false)))
        } catch { }
    }
    Write-Output $Value
}

function Normalize([string]$Value) {
    if (-not $Value) { return '' }
    return ($Value -replace '\\', '/').TrimEnd('/').ToLowerInvariant()
}

try {
    if (-not $Path -and $PathFile -and (Test-Path -LiteralPath $PathFile)) {
        $Path = [System.IO.File]::ReadAllText($PathFile, [System.Text.Encoding]::UTF8)
    }
    if (-not $Path) { throw 'empty path' }
    $Path = $Path.Trim()
    if ($Path.Length -gt 0 -and [int]$Path[0] -eq 0xFEFF) { $Path = $Path.Substring(1) }

    $full = [System.IO.Path]::GetFullPath($Path)
    $folder = Normalize ([System.IO.Path]::GetDirectoryName($full))

    $explorer = Join-Path $env:WINDIR 'explorer.exe'
    & $explorer "/select,$full" 2>$null | Out-Null

    Add-Type -Namespace LinkForge -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
'@

    $shell = New-Object -ComObject Shell.Application
    $deadline = (Get-Date).AddSeconds(1.8)
    $target = $null

    while (-not $target -and (Get-Date) -lt $deadline) {
        foreach ($window in $shell.Windows()) {
            try {
                if (-not $window.HWND -or -not $window.LocationURL) { continue }
                $local = ([uri]$window.LocationURL).LocalPath
                if ((Normalize $local) -eq $folder) {
                    $target = $window
                    break
                }
            } catch { }
        }
        if (-not $target) { Start-Sleep -Milliseconds 100 }
    }

    if (-not $target) {
        Write-Result 'window-not-found'
        exit 0
    }

    $handle = [IntPtr]$target.HWND
    if ([LinkForge.Native]::IsIconic($handle)) { [LinkForge.Native]::ShowWindow($handle, 9) | Out-Null }
    [LinkForge.Native]::BringWindowToTop($handle) | Out-Null
    $ok = [LinkForge.Native]::SetForegroundWindow($handle)

    if (-not $ok) {
        # Foreground lock is active: a synthetic ALT keystroke releases it.
        try {
            $keys = New-Object -ComObject WScript.Shell
            $keys.SendKeys('%')
            Start-Sleep -Milliseconds 80
            $ok = [LinkForge.Native]::SetForegroundWindow($handle)
        } catch { }
    }

    if ($ok) { Write-Result 'foreground' } else { Write-Result 'opened-behind' }
    exit 0
} catch {
    Write-Result ('error: ' + $_.Exception.Message)
    exit 1
}
