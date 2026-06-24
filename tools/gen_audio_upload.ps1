param(
  [string[]]$Chapter,
  [switch]$All,
  [int]$Limit = 0,
  [string[]]$Preset = @("nu-cam-xuc"),
  [ValidateSet("fpt", "video", "direct")]
  [string]$Engine = "fpt",
  [switch]$Overwrite,
  [switch]$Upload,
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

if (-not $All -and (-not $Chapter -or $Chapter.Count -eq 0)) {
  throw "Dùng -Chapter c001 hoặc -All."
}

$validPresets = @("nu-cam-xuc", "nam-tram", "nu-cham-am", "nam-cang-thang", "nu-nhe-nhang")
if ($Preset.Count -eq 1 -and $Preset[0] -eq "all") {
  $Preset = $validPresets
}

foreach ($item in $Preset) {
  if ($validPresets -notcontains $item) {
    throw "Preset không hợp lệ: $item. Dùng: $($validPresets -join ', ') hoặc all."
  }
}

$python = "python"
$bundledPython = "C:\Users\thanh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (Test-Path $bundledPython) {
  $python = $bundledPython
}

$env:AUTO_VIDEO_EXTRA_PACKAGES = "E:\ThanhMV\python-packages"
$generatedChapters = @()

foreach ($presetId in $Preset) {
  if ($All) {
    $args = @("tools\generate_chapter_audio.py", "--all", "--preset", $presetId, "--engine", $Engine)
    if ($Limit -gt 0) { $args += @("--limit", "$Limit") }
    if ($Overwrite) { $args += "--overwrite" }
    Write-Output "=== Generate all chapters preset=$presetId engine=$Engine limit=$Limit ==="
    & $python @args
    if ($LASTEXITCODE -ne 0) { throw "Generate failed for preset $presetId" }
  } else {
    foreach ($chapterId in $Chapter) {
      $args = @("tools\generate_chapter_audio.py", "--chapter", $chapterId, "--preset", $presetId, "--engine", $Engine)
      if ($Overwrite) { $args += "--overwrite" }
      Write-Output "=== Generate $chapterId preset=$presetId engine=$Engine ==="
      & $python @args
      if ($LASTEXITCODE -ne 0) { throw "Generate failed for $chapterId / $presetId" }
      if ($generatedChapters -notcontains $chapterId) { $generatedChapters += $chapterId }
    }
  }
}

if ($All) {
  $listCode = "import json,re; from pathlib import Path; raw=Path('doc-truyen-vip/data.js').read_text(encoding='utf-8'); data=json.loads(re.match(r'\s*window\.STORY_DATA\s*=\s*(.*);\s*$', raw, re.S).group(1)); print('\n'.join(ch['id'] for ch in data['stories'][0]['chapters']))"
  $generatedChapters = & $python -c $listCode
  if ($Limit -gt 0) { $generatedChapters = $generatedChapters | Select-Object -First $Limit }
}

foreach ($chapterId in $generatedChapters) {
  $verifyArgs = @("tools\verify_audio.py", "--chapter", $chapterId)
  foreach ($presetId in $Preset) { $verifyArgs += @("--preset", $presetId) }
  & $python @verifyArgs
  if ($LASTEXITCODE -ne 0) { throw "Verify failed for $chapterId" }
}

& $python "tools\build_doc_truyen_data.py"
if ($LASTEXITCODE -ne 0) { throw "Rebuild data.js failed" }

$node = "C:\Users\thanh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $node) {
  & $node --check "doc-truyen-vip\app.js"
  if ($LASTEXITCODE -ne 0) { throw "app.js syntax check failed" }
  & $node --check "doc-truyen-vip\data.js"
  if ($LASTEXITCODE -ne 0) { throw "data.js syntax check failed" }
}

Write-Output "=== Audio ready locally ==="
git status --short

if ($Upload) {
  git add doc-truyen-vip/audio/*.mp3 doc-truyen-vip/audio/manifest.json doc-truyen-vip/audio/verified-audio.json doc-truyen-vip/data.js doc-truyen-vip/app.js tools/build_doc_truyen_data.py tools/verify_audio.py tools/gen_audio_upload.ps1
  if (-not $Message) {
    $chapterText = if ($All) { "batch" } else { $generatedChapters -join "," }
    $presetText = $Preset -join ","
    $Message = "Upload generated audio $chapterText $presetText"
  }
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "Git commit failed" }
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw "Git push failed" }
  Write-Output "=== Uploaded to production branch ==="
}
