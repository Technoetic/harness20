# webapp-trigger.ps1 — UserPromptSubmit hook
# /webapp 명시 명령만 발급, 완료 기록이 있는 progress는 덮어쓰지 않음.
# 첫 줄이 `/webapp <주제>`(또는 `/harness50:webapp <주제>`)인 prompt에서만:
#   1) step_archive/ 부트스트랩 (없으면 생성, step001~050 복사)
#   2) TOPIC/TOPIC.md 작성 (사용자 prompt 원문 보존)
#   3) progress.json 초기화 (current_step=1)
#   4) stdout으로 system-reminder 주입 → step001 즉시 진입 강제
# 자연어 요청은 아무것도 하지 않는다. 완료 단계가 기록됐거나 읽을 수 없는 progress.json이
# 있으면 lib/harness-activity.mjs precheck-webapp의 한 줄만 알리고 아무것도 바꾸지 않는다.

param()

$harnessRaw = ""
$harnessEvent = $null
try {
    $harnessReader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $harnessRaw = $harnessReader.ReadToEnd()
    $harnessReader.Close()
    if ($harnessRaw) { $harnessEvent = $harnessRaw | ConvertFrom-Json -ErrorAction Stop }
} catch {}

$ErrorActionPreference = "Continue"

$pluginRoot  = Split-Path $PSScriptRoot -Parent
$projectRoot = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($harnessEvent.cwd) { [string]$harnessEvent.cwd } else { [System.IO.Directory]::GetCurrentDirectory() }
$stepArchive = Join-Path $projectRoot "step_archive"
$archivedDir = Join-Path $stepArchive "archived"
$topicDir    = Join-Path $stepArchive "TOPIC"
$progressFile= Join-Path $stepArchive "progress.json"
$topicFile   = Join-Path $topicDir "TOPIC.md"
$assetSteps  = Join-Path $pluginRoot "assets\steps"
$logFile     = Join-Path $PSScriptRoot "webapp-trigger.log"

function Write-Log($msg) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  try { Add-Content -LiteralPath $logFile -Value "[$ts] $msg" -Encoding UTF8 } catch {}
}

# stdin JSON 수신
$raw = ""
try {
  $r = [System.IO.StringReader]::new($harnessRaw)
  $raw = $harnessRaw; $r.Close()
} catch { Write-Log "stdin read failed: $_"; exit 0 }

if (-not $raw) { exit 0 }
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$prompt = [string]$j.prompt
if (-not $prompt) { exit 0 }

# 트리거 — 첫 줄의 명시 명령 `/webapp <주제>` 또는 `/harness50:webapp <주제>`만 (대소문자 구분).
# 자연어 요청은 자동 시작하지 않는다. lib/harness-activity.mjs의 EXPLICIT_WEBAPP와 같은 규칙.
if (-not ($prompt -cmatch '^[ \t]*/(harness50:)?webapp[ \t]+\S')) { exit 0 }

Write-Log "TRIGGER matched. prompt head: $($prompt.Substring(0,[Math]::Min(80,$prompt.Length)))"

# Codex coexistence: an existing Codex workflow is resumed, never re-initialized
# (codex/skills/webapp/SKILL.md). Leave TOPIC.md, progress.json and step_archive/ untouched.
$codexState = Join-Path (Join-Path $stepArchive ".harness50-codex") "state.json"
if (Test-Path -LiteralPath $codexState) {
  Write-Log "Codex workflow state present -> trigger skipped"
  $codexLine = ""
  if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
      $codexOut = @(& node (Join-Path $PSScriptRoot "lib/codex-workflow.mjs") (Join-Path $projectRoot ".") 2>$null)
      if ($codexOut.Count -gt 0) { $codexLine = [string]$codexOut[0] }
    } catch {}
  }
  if (-not $codexLine) { $codexLine = "[HARNESS] WARNING: step_archive/.harness50-codex/state.json exists but is unreadable or incomplete - Claude hooks will not create progress.json or block Stop here. Inspect it with the harness50 plugin's codex/scripts/harness-state.mjs show and ask the user before repairing or resetting it." }
  Write-Output "[HARNESS] webapp trigger skipped: a Codex workflow owns this workspace, so step_archive/TOPIC/TOPIC.md and progress.json were left unchanged. Resume that workflow, or use a separate workspace for a different topic."
  Write-Output $codexLine
  exit 0
}

# Never overwrite a run that recorded completed steps, or a progress.json that cannot be read.
# lib/harness-activity.mjs precheck-webapp answers 'issue' when a new topic may start; any other
# line is printed as is. Without node nothing is checked, so nothing is changed either.
$preLine = ""
try {
  $pre = @(& node (Join-Path $PSScriptRoot 'lib/harness-activity.mjs') precheck-webapp (Join-Path $projectRoot '.') 2>$null)
  if ($pre.Count -gt 0) { $preLine = [string]$pre[0] }
} catch {}
if ($preLine -ne 'issue') {
  if (-not $preLine) { $preLine = '[HARNESS] webapp trigger skipped: node is unavailable, so existing progress could not be checked and nothing was changed.' }
  Write-Log "precheck -> trigger skipped"
  Write-Output $preLine
  exit 0
}

# 1) step_archive 부트스트랩
if (-not (Test-Path -LiteralPath $stepArchive)) { New-Item -ItemType Directory -Path $stepArchive -Force | Out-Null }
if (-not (Test-Path -LiteralPath $archivedDir)) { New-Item -ItemType Directory -Path $archivedDir -Force | Out-Null }
if (-not (Test-Path -LiteralPath $topicDir))    { New-Item -ItemType Directory -Path $topicDir -Force | Out-Null }

# step001~050 복사 (없는 것만)
if (Test-Path -LiteralPath $assetSteps) {
  Get-ChildItem -LiteralPath $assetSteps -Filter "step*.md" | ForEach-Object {
    $dst = Join-Path $archivedDir $_.Name
    if (-not (Test-Path -LiteralPath $dst)) { Copy-Item -LiteralPath $_.FullName -Destination $dst -Force }
  }
}

# H4 수정: html-bundler를 프로젝트로 복사해 step038에서 실행 가능하게 한다.
# (플러그인 hooks/는 ${CLAUDE_PLUGIN_ROOT} 밖이라 step 본문의 상대경로로 도달 불가)
$toolsDir = Join-Path $stepArchive "tools"
if (-not (Test-Path -LiteralPath $toolsDir)) { New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null }
foreach ($b in @("html-bundler.ps1", "html-bundler.sh")) {
  $bSrc = Join-Path $PSScriptRoot $b
  if (Test-Path -LiteralPath $bSrc) { Copy-Item -LiteralPath $bSrc -Destination (Join-Path $toolsDir $b) -Force }
}

# 2) TOPIC.md 작성 (덮어쓰기 — 완료 기록이 없을 때의 신규 요청은 신규 주제)
$today = Get-Date -Format "yyyy-MM-dd"
$topicBody = @"
---
created: $today
session_prompt: |
$(($prompt -split "`n" | ForEach-Object { "  $_" }) -join "`n")
---

# 튜토리얼 주제

본 TOPIC.md는 webapp-trigger hook이 자동 생성했다.
step001이 진입 시 본 파일의 session_prompt를 읽어 topic/audience/interactive/real_world_apps/constraints를 추출한다.

- raw_prompt: 위 session_prompt 블록 참조

## 결정/사유 (NEW-WORK-규칙 3번)

- 자동 추출 항목이 모호하면 step001이 즉시 결정·기록 후 진행 (질문 금지)
"@
$topicBody | Out-File -LiteralPath $topicFile -Encoding UTF8 -Force
# BOM 제거
$bytes = [System.IO.File]::ReadAllBytes($topicFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  [System.IO.File]::WriteAllBytes($topicFile, $bytes[3..($bytes.Length-1)])
}
Write-Log "TOPIC.md written"

# 3) progress.json 초기화
$progress = @{
  current_step = 1
  completed_steps = @()
  skipped_steps = @()
  failed_steps = @()
  total_steps = 50
  metrics = @{ total_duration_minutes = 0; total_sessions = 0; steps_per_session_avg = 0 }
  session_history = @()
  last_updated = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
}
$progress | ConvertTo-Json -Depth 6 | Out-File -LiteralPath $progressFile -Encoding UTF8 -Force
$bytes = [System.IO.File]::ReadAllBytes($progressFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  [System.IO.File]::WriteAllBytes($progressFile, $bytes[3..($bytes.Length-1)])
}
Write-Log "progress.json initialized"

# 4) system-reminder 주입
Write-Output "<harness50-trigger>"
Write-Output "WEBAPP TUTORIAL TRIGGER DETECTED"
Write-Output ""
Write-Output "Bootstrap complete:"
Write-Output "  - step_archive/ ready"
Write-Output "  - step_archive/TOPIC/TOPIC.md written with the user prompt"
Write-Output "  - step_archive/progress.json initialized (current_step=1, total=50)"
Write-Output "  - step_archive/archived/step001.md ~ step050.md available"
Write-Output ""
Write-Output "ABSOLUTE OVERRIDE:"
Write-Output "  Before addressing anything else, IMMEDIATELY:"
Write-Output "    1. Read step_archive/archived/step001.md"
Write-Output "    2. Execute its instructions in full (including TOPIC pickup from TOPIC.md)"
Write-Output "    3. On completion report 'Step 001/50 완료' and Read step002.md"
Write-Output "    4. Continue without user confirmation through step050"
Write-Output ""
Write-Output "Do NOT ask the user any clarifying questions."
Write-Output "Do NOT pause for confirmation."
Write-Output "Do NOT end the turn until you literally cannot continue."
Write-Output "</harness50-trigger>"
exit 0
