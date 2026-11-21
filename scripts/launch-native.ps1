$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root 'LinkForge.jsx'
if (-not (Test-Path -LiteralPath $Script)) { throw "找不到面板脚本：$Script" }
$Lock = New-Object Threading.Mutex($false, 'Local\LinkForge.NativeLauncher')
$Acquired = $false
try {
    try { $Acquired = $Lock.WaitOne(0) } catch [Threading.AbandonedMutexException] { $Acquired = $true }
    if (-not $Acquired) { Write-Host 'Link Forge 正在启动中。'; exit 0 }

    # Old ScriptUI close() could leave a blank HWND although visible=false.
    # Hide only legacy Link Forge windows owned by Illustrator; never stop the app.
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class LinkForgeLegacyWindows {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int mode);
 public static void HideLegacy() {
  EnumWindows((h,p)=>{
   var title=new StringBuilder(256);GetWindowText(h,title,256);var text=title.ToString();
   if(text.StartsWith("Link Forge |")&&!text.EndsWith("[0.1.1]")) {
    uint pid;GetWindowThreadProcessId(h,out pid);
    try{if(Process.GetProcessById((int)pid).ProcessName.Equals("Illustrator",StringComparison.OrdinalIgnoreCase))ShowWindow(h,0);}catch(ArgumentException){}
   }
   return true;
  },IntPtr.Zero);
 }
}
'@
[LinkForgeLegacyWindows]::HideLegacy()
$Illustrator = New-Object -ComObject Illustrator.Application
[void]$Illustrator.DoJavaScriptFile($Script)
Write-Host 'Link Forge 原生面板已在 Illustrator 中打开，无需 CEP 或 Quicker。'
} finally {
    if ($Acquired) { $Lock.ReleaseMutex() }
    $Lock.Dispose()
}
