# Updates assets\js\pages-manifest.js from the .html files inside the tools\ folder.
# Existing entries (name, icon, desc...) are kept exactly as they are; entries whose file
# was removed are dropped. Each new page gets an entry built from its <title> and
# <meta name="tool-name|tool-icon|tool-desc"> tags. Sub-pages (pages linked from a listed
# tool, like ddsrules.html from dds.html) are not added.
# Usage:  scan-pages.ps1          -> run once
#         scan-pages.ps1 -Watch   -> keep running, auto-update when files are added/removed
param([switch]$Watch)
$root  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tools = Join-Path $root 'tools'
$out   = Join-Path $root 'assets\js\pages-manifest.js'
$utf8  = New-Object System.Text.UTF8Encoding($false)

function Get-Pages {
    Get-ChildItem -LiteralPath $tools -File |
        Where-Object { $_.Extension -match '^\.html?$' } |
        Sort-Object Name | ForEach-Object { $_.Name }
}
function Read-Page($file) { [System.IO.File]::ReadAllText((Join-Path $tools $file), $utf8) }
function Get-JsString($s) { '"' + ($s -replace '\\','\\' -replace '"','\"') + '"' }
function Get-Meta($html, $key) {
    if ($html -match ('<meta\s+name="' + $key + '"\s+content="([^"]*)"')) {
        return [System.Net.WebUtility]::HtmlDecode($matches[1]).Trim()
    }
    ''
}
function Test-SubPage($file, $names) {
    foreach ($other in $names) {
        if ($other -ne $file -and (Read-Page $other).Contains($file)) { return $true }
    }
    $false
}
function New-Entry($file) {
    $html = Read-Page $file
    $title = ''
    if ($html -match '<title>([^<]*)</title>') { $title = [System.Net.WebUtility]::HtmlDecode($matches[1]).Trim() }
    $name = Get-Meta $html 'tool-name'
    if (-not $name) { $name = $title }
    if (-not $name) { $name = [System.IO.Path]::GetFileNameWithoutExtension($file) }
    $icon = Get-Meta $html 'tool-icon'
    if (-not $icon) { $icon = [string][char]0x26A1 }   # lightning bolt default
    $desc = Get-Meta $html 'tool-desc'
    if (-not $desc) { $desc = $name }
    Write-Host "  New page: $file  (check its name and icon in pages-manifest.js)"
    [pscustomobject]@{ file = $file; title = $title; name = $name; icon = $icon; desc = $desc }
}
function Format-Entry($e, $nl) {
    $props = @($e.PSObject.Properties | Where-Object { $_.Value -ne $null -and "$($_.Value)" -ne '' })
    $lines = for ($i = 0; $i -lt $props.Count; $i++) {
        '        "' + $props[$i].Name + '":  ' + (Get-JsString ([string]$props[$i].Value)) + $(if ($i -lt $props.Count - 1) { ',' } else { '' })
    }
    '    {' + $nl + ($lines -join $nl) + $nl + '    }'
}
function Write-Manifest($names) {
    $text  = [System.IO.File]::ReadAllText($out, $utf8)
    $nl    = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $open  = $text.IndexOf('var pages = [')
    $close = $text.IndexOf('];', $open)
    if ($open -lt 0 -or $close -lt 0) { throw "Could not find 'var pages = [ ... ];' in $out - not changed." }
    $start = $open + 'var pages = ['.Length
    $existing = @{}
    $parsed = ConvertFrom-Json ('[' + $text.Substring($start, $close - $start) + ']')   # PS 5.1 returns the array as one item
    foreach ($e in $parsed) { $existing[$e.file] = $e }
    $listed = @($names | Where-Object { $existing.ContainsKey($_) })
    $entries = foreach ($n in $names) {
        if ($existing.ContainsKey($n)) { $existing[$n] }
        elseif (-not (Test-SubPage $n $listed)) { New-Entry $n }
    }
    $body = $nl + ((@($entries) | ForEach-Object { Format-Entry $_ $nl }) -join (',' + $nl)) + $nl
    [System.IO.File]::WriteAllText($out, $text.Substring(0, $start) + $body + $text.Substring($close), $utf8)
    @($entries).Count
}

$last = @(Get-Pages)
$count = Write-Manifest $last
Write-Host "Manifest updated: $count tools"
if ($Watch) {
    Write-Host "Watching tools folder... (Ctrl+C to stop)"
    while ($true) {
        Start-Sleep -Seconds 2
        $now = @(Get-Pages)
        if (($now -join '|') -ne ($last -join '|')) {
            $last = $now
            $count = Write-Manifest $last
            Write-Host "$(Get-Date -Format T)  Manifest updated: $count tools"
        }
    }
}
