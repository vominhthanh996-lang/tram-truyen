param(
  [string]$SourceRoot = "E:\ThanhMV\Content truyen\phe-tho-ta-nhat-duoc-ca-the-gioi",
  [string]$StoryRoot = "phe-tho-ta-nhat-duoc-ca-the-gioi",
  [string]$Message = "Publish story content update",
  [switch]$AllowDirty,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "== $Message =="
}

function Count-Parts {
  param([string]$Path)
  return (Get-ChildItem -LiteralPath $Path -Recurse -Filter "phan-*.md" -File | Measure-Object).Count
}

$repo = Resolve-Path "."
$source = Resolve-Path -LiteralPath $SourceRoot
$destination = Resolve-Path -LiteralPath $StoryRoot

Write-Step "Check running audio job"
$audioJobs = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -match "run_full_edge_audio_job|generate_chapter_audio|generate_voice_edge" -and $_.ProcessId -ne $PID
}
if ($audioJobs) {
  throw "Audio job is running. Wait until audio finishes before publishing text content."
}

Write-Step "Check git state"
$dirty = git status --porcelain
if ($dirty -and -not $AllowDirty) {
  Write-Host $dirty
  throw "Working tree is dirty. Commit/stash changes first, or rerun with -AllowDirty if you know they are unrelated."
}

Write-Step "Sync markdown files"
Get-ChildItem -LiteralPath $source -Directory | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
}

$sourceCount = Count-Parts $source
$destCount = Count-Parts $destination
Write-Host "Source parts: $sourceCount"
Write-Host "Repo parts:   $destCount"
if ($sourceCount -ne $destCount) {
  throw "Part count mismatch after sync."
}

Write-Step "Build website data"
python tools\build_doc_truyen_data.py

Write-Step "Validate built data"
@'
import json
import re
from pathlib import Path

raw = Path("doc-truyen-vip/data.js").read_text(encoding="utf-8")
data = json.loads(re.sub(r"^window\.STORY_DATA = |;\s*$", "", raw, flags=re.S))
chapters = data["stories"][0]["chapters"]
print(f"Built chapters: {len(chapters)}")
print(f"Last chapter:   {chapters[-1]['id']} - {chapters[-1]['title']}")
if not chapters:
    raise SystemExit("No chapters were built.")
if any(not chapter.get("free") for chapter in chapters):
    raise SystemExit("Expected all chapters to be free right now.")
'@ | python -

Write-Step "Commit content"
git add $StoryRoot doc-truyen-vip\data.js tools\build_doc_truyen_data.py
$pending = git diff --cached --name-only
if (-not $pending) {
  Write-Host "No content changes to publish."
  exit 0
}
git commit -m $Message

if (-not $SkipPush) {
  Write-Step "Push production"
  git pull --rebase origin main
  git push origin main
}

Write-Step "Done"
$siteConfig = Get-Content -Raw -LiteralPath "tools\site-config.json" | ConvertFrom-Json
Write-Host "Production URL: $($siteConfig.siteUrl)/"
