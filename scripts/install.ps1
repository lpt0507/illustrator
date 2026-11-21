param([switch]$Uninstall, [switch]$RestoreDebugSettings, [string]$IllustratorRoot)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent $PSScriptRoot
$Id = 'com.aether.illustrator.linktoolkit'
$Extensions = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Destination = [IO.Path]::GetFullPath((Join-Path $Extensions $Id))
$StateRoot = Join-Path $env:LOCALAPPDATA 'LinkForge'
$StatePath = Join-Path $StateRoot 'install-state.json'
$ExpectedParent = [IO.Path]::GetFullPath($Extensions).TrimEnd('\') + '\'
if (-not $Destination.StartsWith($ExpectedParent, [StringComparison]::OrdinalIgnoreCase)) { throw '扩展安装目标路径无效。' }

function Resolve-IllustratorRoot {
    param([string]$ExplicitRoot)
    if ($ExplicitRoot) { return [IO.Path]::GetFullPath($ExplicitRoot) }
    $ClassKey = Get-Item -LiteralPath 'Registry::HKEY_CLASSES_ROOT\Illustrator.Application\CLSID' -ErrorAction SilentlyContinue
    $ClassId = if ($null -ne $ClassKey) { $ClassKey.GetValue('') } else { $null }
    if (-not $ClassId) { return $null }
    $ServerKey = Get-Item -LiteralPath "Registry::HKEY_CLASSES_ROOT\CLSID\$ClassId\LocalServer32" -ErrorAction SilentlyContinue
    $Command = if ($null -ne $ServerKey) { $ServerKey.GetValue('') } else { $null }
    if (-not $Command) { return $null }
    $Match = [regex]::Match([string]$Command, '^\s*(?:"([^"]+Illustrator\.exe)"|(.+?Illustrator\.exe))(?:\s|$)', 'IgnoreCase')
    if (-not $Match.Success) { return $null }
    $Executable = if ($Match.Groups[1].Success) { $Match.Groups[1].Value } else { $Match.Groups[2].Value }
    $Windows = Split-Path -Parent $Executable
    $Contents = Split-Path -Parent $Windows
    $SupportFiles = Split-Path -Parent $Contents
    return Split-Path -Parent $SupportFiles
}

function Get-IllustratorScriptFolders {
    param([string]$AppRoot)
    if (-not $AppRoot) { return @() }
    if (-not (Test-Path -LiteralPath (Join-Path $AppRoot 'Support Files\Contents\Windows\Illustrator.exe'))) {
        throw '检测到的 Illustrator 根目录中没有找到预期的 Illustrator 可执行文件。'
    }
    return @(Get-ChildItem -LiteralPath (Join-Path $AppRoot 'Presets') -Directory | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -Directory | Where-Object { $_.Name -eq 'Scripts' -or $_.Name -eq ([string][char]0x811A + [char]0x672C) }
    })
}

$ResolvedIllustratorRoot = Resolve-IllustratorRoot $IllustratorRoot
$ResolvedScriptFolders = Get-IllustratorScriptFolders $ResolvedIllustratorRoot

if ($Uninstall) {
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    if ($RestoreDebugSettings -and (Test-Path -LiteralPath $StatePath)) {
        $State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        foreach ($Entry in $State.Registry) {
            if ($Entry.Existed) {
                New-ItemProperty -LiteralPath $Entry.Path -Name PlayerDebugMode -Value $Entry.Value -PropertyType String -Force | Out-Null
            } else {
                Remove-ItemProperty -LiteralPath $Entry.Path -Name PlayerDebugMode -ErrorAction SilentlyContinue
            }
        }
    }
    foreach ($Folder in $ResolvedScriptFolders) {
        $MenuPath = Join-Path $Folder.FullName 'Link Forge.jsx'
        if (Test-Path -LiteralPath $MenuPath) {
            $InstalledHash = (Get-FileHash -LiteralPath $MenuPath -Algorithm SHA256).Hash
            $OurHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'menu-entry.jsx') -Algorithm SHA256).Hash
            if ($InstalledHash -eq $OurHash) { Remove-Item -LiteralPath $MenuPath -Force }
            else { Write-Warning "脚本菜单文件内容不同，未删除：$MenuPath" }
        }
    }
    Write-Host 'Link Forge 已卸载。Illustrator 文档未被修改。'
    exit 0
}

$Required = @('CSXS\manifest.xml','index.html','css\panel.css','js\panel.js','jsx\host.jsx','jsx\core.jsx','jsx\artwork.jsx')
foreach ($File in $Required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Source $File))) { throw "缺少发布文件：$File" }
}
New-Item -ItemType Directory -Path $StateRoot,$Extensions -Force | Out-Null
if (Test-Path -LiteralPath $Destination) {
    $Backup = Join-Path $StateRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    Copy-Item -LiteralPath $Destination -Destination $Backup -Recurse
    Write-Host "旧面板已备份到：$Backup"
}
$Registry = @()
foreach ($Version in @(11,12)) {
    $Key = "HKCU:\Software\Adobe\CSXS.$Version"
    $Prior = Get-ItemProperty -LiteralPath $Key -Name PlayerDebugMode -ErrorAction SilentlyContinue
    $Registry += [pscustomobject]@{Path=$Key;Existed=($null -ne $Prior);Value=if($Prior){$Prior.PlayerDebugMode}else{$null}}
    New-Item -Path $Key -Force | Out-Null
    New-ItemProperty -LiteralPath $Key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $StatePath)) {
    [pscustomobject]@{Destination=$Destination;Registry=$Registry} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
foreach ($Part in @('CSXS','css','js','jsx','index.html','LinkForge.jsx')) {
    Copy-Item -LiteralPath (Join-Path $Source $Part) -Destination $Destination -Recurse -Force
}
$RevealScript = Join-Path $Source 'scripts/reveal.ps1'
if (Test-Path -LiteralPath $RevealScript) {
    New-Item -ItemType Directory -Path (Join-Path $Destination 'scripts') -Force | Out-Null
    Copy-Item -LiteralPath $RevealScript -Destination (Join-Path $Destination 'scripts/reveal.ps1') -Force
}
if ($ResolvedIllustratorRoot) {
    if ($ResolvedScriptFolders.Count -eq 0) { throw '未找到 Illustrator 预设脚本文件夹。' }
    foreach ($Folder in $ResolvedScriptFolders) {
        $MenuPath = Join-Path $Folder.FullName 'Link Forge.jsx'
        if (Test-Path -LiteralPath $MenuPath) {
            Copy-Item -LiteralPath $MenuPath -Destination (Join-Path $StateRoot ('menu-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.jsx'))
        }
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'menu-entry.jsx') -Destination $MenuPath -Force
        Write-Host "已安装“文件 > 脚本”入口：$MenuPath"
    }
} else {
    Write-Warning '未检测到 Illustrator。CEP 文件已安装，但未创建“文件 > 脚本”入口。'
}
Write-Host "已安装到：$Destination"
Write-Host '请重启 Illustrator，然后从“文件 > 脚本 > Link Forge”打开。'
Write-Host '“窗口 > 扩展功能 > Link Toolkit”也已安装，但需要可用的 CEP 宿主。'
Write-Host '未签名的开发版面板：仅为 CEP 11 和 12 启用了 PlayerDebugMode。'
