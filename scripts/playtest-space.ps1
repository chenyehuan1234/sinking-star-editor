param(
    [Parameter(Mandatory)][string]$GamePath,
    [string]$TestCopy = 'workspace/playtest-game',
    [switch]$VerifyAssets
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $GamePath).Path
$testRoot = (Resolve-Path -LiteralPath $TestCopy).Path
if ([StringComparer]::OrdinalIgnoreCase.Equals($sourceRoot, $testRoot)) { throw 'Choose a separate managed test copy.' }

# File allocation on Windows can differ from the length reported by the editor.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class SstarFileAllocation {
    [StructLayout(LayoutKind.Sequential)]
    private struct StandardInfo {
        public long Allocation;
        public long EndOfFile;
        public uint Links;
        public byte DeletePending;
        public byte Directory;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int kind, out StandardInfo info, uint size);

    public static long Bytes(string path) {
        using (var file = File.OpenHandle(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
            StandardInfo info;
            if (!GetFileInformationByHandleEx(file, 1, out info, (uint) Marshal.SizeOf<StandardInfo>()))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            return info.Allocation;
        }
    }
}
'@

function Measure-Tree([string]$Root) {
    $byFolder = @{}
    $assets = [Collections.Generic.Dictionary[string,IO.FileInfo]]::new([StringComparer]::OrdinalIgnoreCase)
    $skipped = 0
    $stack = [Collections.Generic.Stack[string]]::new()
    $stack.Push($Root)
    while ($stack.Count) {
        foreach ($entry in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $skipped++; continue }
            if ($entry.PSIsContainer) { $stack.Push($entry.FullName); continue }
            $relative = [IO.Path]::GetRelativePath($Root, $entry.FullName)
            $folder = if ($relative.Contains('\')) { ($relative -split '\\', 2)[0] } else { '(root)' }
            if (!$byFolder.ContainsKey($folder)) {
                $byFolder[$folder] = [pscustomobject]@{ folder = $folder; files = 0; bytes = [long]0; allocatedBytes = [long]0 }
            }
            $row = $byFolder[$folder]
            $row.files++
            $row.bytes += $entry.Length
            $row.allocatedBytes += [SstarFileAllocation]::Bytes($entry.FullName)
            if ($folder -eq 'data-pc' -and $entry.Extension -in '.compressed_mesh','.texture') { $assets[$relative] = $entry }
        }
    }
    return @{ folders = @($byFolder.Values | Sort-Object bytes -Descending); assets = $assets; skippedLinks = $skipped }
}

$source = Measure-Tree $sourceRoot
$test = Measure-Tree $testRoot
$stateFile = Join-Path (Split-Path -Parent $testRoot) 'playtest-state.json'
$private = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
    foreach ($item in (Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).aux) { [void]$private.Add($item.Replace('/','\')) }
}

$candidates = [ordered]@{ exactFiles = 0; exactBytes = [long]0; sameLengthUnverified = 0; privateOrDifferent = 0; absentFromCopy = 0 }
foreach ($key in $source.assets.Keys) {
    if (!$test.assets.ContainsKey($key)) { $candidates.absentFromCopy++; continue }
    $from = $source.assets[$key]
    $to = $test.assets[$key]
    if ($from.Length -ne $to.Length -or $private.Contains($key)) { $candidates.privateOrDifferent++; continue }
    if (!$VerifyAssets) { $candidates.sameLengthUnverified++; continue }
    if ((Get-FileHash -LiteralPath $from.FullName).Hash -eq (Get-FileHash -LiteralPath $to.FullName).Hash) {
        $candidates.exactFiles++
        $candidates.exactBytes += $from.Length
    } else { $candidates.privateOrDifferent++ }
}

[pscustomobject]@{
    measuredAt = (Get-Date).ToString('o')
    sourceVolume = [IO.Path]::GetPathRoot($sourceRoot)
    testVolume = [IO.Path]::GetPathRoot($testRoot)
    source = $source.folders
    activeCopy = $test.folders
    activeCopyBytes = ($test.folders | Measure-Object bytes -Sum).Sum
    activeCopyAllocatedBytes = ($test.folders | Measure-Object allocatedBytes -Sum).Sum
    candidateAssets = $candidates
    copyOnlyAssets = @($test.assets.Keys | Where-Object { !$source.assets.ContainsKey($_) }).Count
    registeredAuxFiles = $private.Count
    skippedLinks = $source.skippedLinks + $test.skippedLinks
} | ConvertTo-Json -Depth 5
