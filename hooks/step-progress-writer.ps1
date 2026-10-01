# step-progress-writer.ps1 - Step 완료 상태 자동 기록 (Stop 훅)
# 전략: 매 턴 끝에 transcript 전체를 스캔해 모든 "Step NNN 완료" 패턴을 추출.
# 멱등 동작: 이미 completed_steps에 있으면 스킵. 누락된 과거 완료도 자동 복구.
# Run boundary: when progress.json has run_started_at (written by the /webapp bootstrap and by
# harness-pause.mjs reset), only transcript entries from that moment on count, so a new topic in
# the same session never gets the completions of the old one. Without it (runs started by 2.9.0
# and earlier) the whole transcript counts as before. Mirrors step-progress-writer.sh.
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
# Node prints UTF-8; Windows PowerShell 5.1 decodes native output in the console code page (cp949 on
# Korean Windows), which garbled Korean paths in the inspector results kept for refusals.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$logFile = Join-Path $PSScriptRoot "step-progress-writer.log"
function Write-WriterLog($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $logFile -Value "[$ts] $msg" -Encoding UTF8 } catch {}
}
$projectRoot = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($harnessEvent.cwd) { [string]$harnessEvent.cwd } else { [System.IO.Directory]::GetCurrentDirectory() }
$stepArchive = Join-Path $projectRoot "step_archive"
$progressFile = Join-Path $stepArchive "progress.json"

# Reported completions this Stop refused, kept in step_archive/progress-refusals.json for
# step-auto-continue to name in its block reason. Before, a refusal reached only this log: the model
# was asked for the same step again with no reason until the stall counter released the run.
$refusalFile = Join-Path $stepArchive "progress-refusals.json"
$refusals = New-Object System.Collections.Generic.List[object]
$script:rootForms = $null
function Get-RootForms {
    # The hook's spellings of the project root and the physical path that quality-gate.mjs reports
    # (realpath: junctions, symlinks and 8.3 names resolved), longest first so that one form never
    # leaves part of another behind.
    if ($null -ne $script:rootForms) { return $script:rootForms }
    $forms = New-Object System.Collections.Generic.List[string]
    $physical = ''
    try { $physical = [string](& node -e "try{process.stdout.write(require('fs').realpathSync.native(process.argv[1]))}catch{}" $projectRoot 2>$null) } catch {}
    foreach ($form in @([string]$projectRoot, $physical)) {
        if (-not $form) { continue }
        foreach ($spelling in @($form, ($form -replace '\\', '/'), ($form -replace '/', '\'))) {
            if ($spelling -and -not $forms.Contains($spelling)) { $forms.Add($spelling) }
        }
    }
    $script:rootForms = @($forms | Sort-Object { $_.Length } -Descending)
    return $script:rootForms
}
# Steps the refusal file of this run (same run_started_at) already holds. A paused run does not
# count them as new work: they were inspected and refused before, and are inspected again once
# the run resumes.
function Get-RefusedSteps($state) {
    $steps = New-Object System.Collections.Generic.HashSet[int]
    try {
        if (Test-Path -LiteralPath $refusalFile) {
            $data = Get-Content -LiteralPath $refusalFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
            if ($null -ne $data -and [string]$data.run_started_at -ceq [string]$state.run_started_at) {
                foreach ($r in @($data.refusals)) { if ($r -and ($r.step -is [int] -or $r.step -is [long])) { [void]$steps.Add([int]$r.step) } }
            }
        }
    } catch {}
    # The comma keeps the set whole instead of unrolling it into the pipeline.
    return ,$steps
}
function Add-Refusal($step, $gate, $status, $verdict, $detail) {
    # Inspector errors can name files by absolute path; the reason uses the same placeholder as the
    # other hook messages. Root forms are replaced before whitespace is collapsed, so a root with
    # repeated spaces still matches.
    $text = [string]$detail
    if ($text) {
        foreach ($rootForm in Get-RootForms) {
            $text = [regex]::Replace($text, [regex]::Escape($rootForm), '<project-root>', 'IgnoreCase')
        }
    }
    $text = ($text -replace '\s+', ' ').Trim()
    if ($text.Length -gt 160) { $text = $text.Substring(0, 157) + '...' }
    $refusals.Add([pscustomobject]@{ step = [int]$step; gate = $gate; status = [string]$status; verdict = [string]$verdict; detail = $text })
}

# stdin 이벤트 JSON — UTF-8 명시 read (PS 5.1 default는 시스템 코드페이지로 한글 mojibake 위험)
$inputJson = $null
try {
    $stdinStream = [System.IO.StringReader]::new($harnessRaw)
    $raw = $harnessRaw
    $stdinStream.Close()
    if ($raw) { $inputJson = $raw | ConvertFrom-Json }
} catch {
    Write-WriterLog "stdin parse FAILED: $_"
}

# Codex coexistence: the Codex state manager owns completion when its state exists.
# Leave progress.json and its .bak untouched and never take the progress mutex.
if (Test-Path -LiteralPath (Join-Path (Join-Path $stepArchive ".harness50-codex") "state.json")) {
    Write-WriterLog "Codex workflow state present -> exit 0 (progress.json left unchanged)"
    exit 0
}

if (-not (Test-Path -LiteralPath $progressFile)) { exit 0 }

# UTC ticks of an ISO 8601 instant: date, 'T', time, any number of fraction digits (cut to
# microseconds like step-progress-writer.sh) and 'Z' or a +hh:mm/-hh:mm offset. Anything else is
# $null. Instants are compared as times, never as text: '01:02:03Z' and '01:02:03.000Z' are equal.
function Get-UtcTicks($value) {
    if ($value -isnot [string]) { return $null }
    $m = [regex]::Match($value, '^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})\z')
    if (-not $m.Success) { return $null }
    $fraction = ($m.Groups[2].Value + '000000').Substring(0, 6)
    $offset = if ($m.Groups[3].Value -ceq 'Z') { '+00:00' } else { $m.Groups[3].Value }
    try {
        return [DateTimeOffset]::ParseExact("$($m.Groups[1].Value).$fraction$offset", "yyyy-MM-dd'T'HH:mm:ss.ffffffzzz", [System.Globalization.CultureInfo]::InvariantCulture).UtcTicks
    } catch { return $null }
}

# 1) 누적 응답 수집 (last_assistant_message + 전체 transcript 스캔). Each text keeps the UTC ticks
#    of its transcript entry. last_assistant_message is the final message of the turn that is
#    stopping, written after any run_started_at recorded before or during that turn (webapp-trigger
#    at UserPromptSubmit, harness-pause.mjs reset inside the turn), so it has no time and counts.
$responseParts = New-Object System.Collections.Generic.List[object]
if ($inputJson -and $inputJson.last_assistant_message) {
    $responseParts.Add([pscustomobject]@{ Ticks = $null; Text = [string]$inputJson.last_assistant_message })
}

# Only a line that contains 완료, as text or as the JSON escape \uc644\ub8cc, can hold a completion
# report, so every other line is skipped before ConvertFrom-Json. Parsing every line and joining
# every text block (see Get-ReportedSteps) took 29 s on a 4.6 MiB transcript of 8,000 text blocks
# in Windows PowerShell 5.1, past this hook's 28 s budget in run-hook.mjs, and the completions of a
# long session were then never recorded. Lines are streamed, not read whole. Mirrors
# step-progress-writer.sh.
$completionLine = [regex]::new('완료|\\u[cC]644\\u[bB]8[cC][cC]')
if ($inputJson -and $inputJson.transcript_path -and (Test-Path -LiteralPath $inputJson.transcript_path)) {
    try {
        $transcriptPath = (Resolve-Path -LiteralPath $inputJson.transcript_path).ProviderPath
        # Shared read like Get-Content: the host may still hold the transcript open for appending.
        $transcriptStream = [System.IO.FileStream]::new($transcriptPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
        $transcriptReader = [System.IO.StreamReader]::new($transcriptStream, [System.Text.Encoding]::UTF8)
        try {
            while ($null -ne ($line = $transcriptReader.ReadLine())) {
                if (-not $line -or -not $completionLine.IsMatch($line)) { continue }
                try {
                    $entry = $line | ConvertFrom-Json
                    if ($entry.type -eq 'assistant' -and $entry.message.content) {
                        $entryTicks = Get-UtcTicks $entry.timestamp
                        foreach ($block in $entry.message.content) {
                            if ($block.type -eq 'text' -and $block.text) {
                                $responseParts.Add([pscustomobject]@{ Ticks = $entryTicks; Text = [string]$block.text })
                            }
                        }
                    }
                } catch {}
            }
        } finally {
            $transcriptReader.Dispose()
        }
    } catch {}
}

# 2)+3) Completion lines of this run whose step body exists, judged against one progress state.
function Get-ReportedSteps($state) {
    # Run boundary. Entries before run_started_at belong to an earlier run of this workspace (the
    # topic before a /webapp bootstrap or /harness-reset in the same session). An entry without a
    # parsable timestamp still counts: Claude Code stamps every transcript entry, so only a foreign
    # or damaged line lacks one, and dropping it could lose a real completion (the step would run
    # again, and in a new session the record is gone), while counting it is what every writer did
    # before the boundary existed. A missing or unparsable run_started_at (runs started by 2.9.0
    # and earlier) sets no boundary: the whole transcript counts.
    $boundary = Get-UtcTicks $state.run_started_at
    # Joined once: repeated += copied the whole string for every text block (quadratic).
    $texts = New-Object System.Collections.Generic.List[string]
    foreach ($part in $responseParts) {
        if ($null -ne $boundary -and $null -ne $part.Ticks -and $part.Ticks -lt $boundary) { continue }
        $texts.Add([string]$part.Text)
    }
    $response = "`n" + ($texts -join "`n")

    # 2) Step 완료 패턴 매칭 - 엄격한 명시 완료 보고만 허용
    #    total_steps 범위를 벗어난 숫자는 무시 (본문 언급 오탐 방지)
    #    F4 fix (2026-06-10): 줄 단위 스캔 + 인용 가드 — 백틱/인용부호(>)/예시(예:) 줄은 제외하고
    #    줄 머리에 anchoring하여, 모델이 문서 예시 문자열("✅ Step 023/107 완료" 등)을 본문에
    #    인용했을 때의 위양성 완료 처리를 차단한다.
    $total = [int]$state.total_steps
    $foundSteps = New-Object System.Collections.Generic.HashSet[int]

    # 패턴 A: "Step NNN/MMM 완료" - 슬래시 + 총수 필수 (가장 엄격)
    $patternA = '^\s*[✅→\-\*\s]*Step\s+(\d{1,3})\s*/\s*(\d{1,3})\s*완료'
    # 패턴 B: "Step NNN 완료" (총수 없는 약식 보고)
    $patternB = '^\s*[✅→\-\*\s]*Step\s+(\d{1,3})\s+완료'

    $inFence = $false
    foreach ($respLine in ($response -split "`n")) {
        if ($null -eq $respLine) { continue }
        # H3 수정: 코드펜스(```/~~~) 블록 추적 — 펜스 안의 "Step NNN/107 완료" 예시는
        # 완료 신호로 인정하지 않는다 (백틱이 같은 줄에 없어도 차단).
        if ($respLine -match '^\s*(```|~~~)') { $inFence = -not $inFence; continue }
        if ($inFence) { continue }
        if (-not $respLine) { continue }
        # 인용/예시 컨텍스트 가드: 코드 인용(백틱), 마크다운 인용(>), 예시 표기 줄은 스킵
        if ($respLine -match '`' -or $respLine -match '^\s*>' -or $respLine -match '예\s*[:)]' -or $respLine -match '예시') { continue }
        $mA = [regex]::Match($respLine, $patternA, 'IgnoreCase')
        if ($mA.Success) {
            $stepNum = [int]$mA.Groups[1].Value
            $declaredTotal = [int]$mA.Groups[2].Value
            if ($stepNum -ge 1 -and $stepNum -le $total -and $declaredTotal -eq $total) {
                [void]$foundSteps.Add($stepNum)
            }
            continue
        }
        $mB = [regex]::Match($respLine, $patternB, 'IgnoreCase')
        if ($mB.Success) {
            $stepNum = [int]$mB.Groups[1].Value
            if ($stepNum -ge 1 -and $stepNum -le $total) {
                [void]$foundSteps.Add($stepNum)
            }
        }
    }

    # 3) 실존 Step 파일 검증: stepNNN.md 파일이 실제 존재해야 완료로 인정
    #    (대화 본문 오탐, 테스트 주입 문자열 차단)
    #    경로 견고화: step_archive/stepNNN.md 또는 step_archive/archived/stepNNN.md 둘 중 하나면 인정
    #    (하네스 재가동 시 step 파일이 archived/ 로 이동된 케이스 대응 — 다른 세션 재발 방지)
    $archivedDirW = Join-Path $stepArchive "archived"
    $reported = New-Object System.Collections.Generic.HashSet[int]
    foreach ($s in $foundSteps) {
        $stepFileFlat = Join-Path $stepArchive ("step{0:D3}.md" -f $s)
        $stepFileArch = Join-Path $archivedDirW ("step{0:D3}.md" -f $s)
        if ((Test-Path -LiteralPath $stepFileFlat) -or (Test-Path -LiteralPath $stepFileArch)) {
            [void]$reported.Add($s)
        }
    }
    # The comma keeps the set whole instead of unrolling it into the pipeline.
    return ,$reported
}

# Named pause (harness-rules 2-1): hooks/lib/harness-activity.mjs starts this hook for a paused run
# so that the completion lines of the turn that paused are recorded; the pause fields are kept as
# they are. A drifted cursor is put back as well (below). With no new line to record and the cursor
# on the first unfinished step it changes nothing: no progress.json rewrite, no .bak, no log line.
# Same judgement as scripts/lib/pause-state.mjs isPaused.
$peek = $null
try { $peek = Get-Content -LiteralPath $progressFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop } catch {}
$hasPaused = @($peek.PSObject.Properties.Name) -ccontains 'paused'
$isPaused = ($hasPaused -and -not ($peek.paused -is [bool] -and -not $peek.paused)) -or ($peek.status -is [string] -and $peek.status -ceq 'paused')
if ($null -ne $peek -and $isPaused) {
    $recorded = New-Object System.Collections.Generic.HashSet[int]
    foreach ($s in @($peek.completed_steps)) { try { [void]$recorded.Add([int]$s) } catch {} }
    $refusedBefore = Get-RefusedSteps $peek
    $pending = @((Get-ReportedSteps $peek) | Where-Object { -not $recorded.Contains([int]$_) -and -not $refusedBefore.Contains([int]$_) })
    $peekFirst = $null
    for ($i = 1; $i -le [int]$peek.total_steps; $i++) { if (-not $recorded.Contains($i)) { $peekFirst = $i; break } }
    $peekAligned = ($null -eq $peekFirst) -or (($peek.current_step -is [int] -or $peek.current_step -is [long]) -and $peek.current_step -eq $peekFirst)
    if ($pending.Count -eq 0 -and $peekAligned) { exit 0 }
}

Write-WriterLog "=== invoked ==="

# B-P2-1/6/7 fix: Mutex 락으로 progress.json 동시 쓰기 방지
$mutex = New-Object System.Threading.Mutex($false, "Global\step-progress-writer-mutex")
$mutexAcquired = $false
try { $mutexAcquired = $mutex.WaitOne(5000) } catch { $mutexAcquired = $false }
if (-not $mutexAcquired) {
    Write-WriterLog "mutex acquire FAILED (timeout 5s) -> exit 0"
    # Nothing was inspected on this Stop, so an older refusal must not be repeated as current.
    Remove-Item -LiteralPath $refusalFile -Force -ErrorAction SilentlyContinue
    exit 0
}

# B-P2-3 fix: 빈 파일/잘린 파일 재시도 (TOCTOU)
$progress = $null
for ($i = 0; $i -lt 3; $i++) {
    try {
        $rawProgress = Get-Content -LiteralPath $progressFile -Raw -Encoding UTF8
        if ($rawProgress -and $rawProgress.Trim().Length -gt 0) {
            $progress = $rawProgress | ConvertFrom-Json
            if ($null -ne $progress) { break }
        }
    } catch {
        Write-WriterLog "progress.json read attempt $($i+1) FAILED: $_"
    }
    Start-Sleep -Milliseconds 50
}

# B-P2-6 fix: $null 가드 — null이면 절대 직렬화하지 않음
if ($null -eq $progress) {
    Write-WriterLog "progress.json read failed after 3 retries -> exit 0 (preserve existing file)"
    Remove-Item -LiteralPath $refusalFile -Force -ErrorAction SilentlyContinue
    try { $mutex.ReleaseMutex() } catch {}
    exit 0
}

# 2)+3) 이번 실행의 완료 보고 중 본문이 있는 Step (잠금 후 읽은 progress 기준)
$totalSteps = [int]$progress.total_steps
$validSteps = Get-ReportedSteps $progress

# 4) 기존 completed_steps와 병합
$existing = New-Object System.Collections.Generic.HashSet[int]
foreach ($s in @($progress.completed_steps)) { [void]$existing.Add([int]$s) }

$completedNew = @()
foreach ($s in $validSteps) {
    if (-not $existing.Contains($s)) {
        if ($totalSteps -eq 50 -and $s -in @(38, 44)) {
            # The r1 (step 38) and r2 (step 44) milestones need current measured quality, as on Codex
            # (codex/scripts/lib/acceptance.mjs). The trust5 Stop block cannot enforce them during
            # continuous runs (stop_hook_active). Inspection only: no project commands run here.
            $qualityPassed = $false
            $qualityVerdict = 'unavailable'
            $qualityDetail = ''
            $qualityInspector = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/quality-gate.mjs'
            if ((Test-Path -LiteralPath $qualityInspector) -and (Get-Command node -ErrorAction SilentlyContinue)) {
                try {
                    $qualityJson = (& node $qualityInspector --inspect --workspace $projectRoot 2>$null | Out-String)
                    $qualityExit = $LASTEXITCODE
                    $qualityResult = $qualityJson | ConvertFrom-Json -ErrorAction Stop
                    # An empty output parses to $null in Windows PowerShell 5.1: keep 'unavailable'.
                    if ($null -ne $qualityResult) {
                        $qualityVerdict = [string]$qualityResult.verdict
                        $qualityDetail = [string]$qualityResult.error
                    }
                    $qualityPassed = $qualityExit -eq 0 -and $qualityResult.verdict -eq 'PASS'
                } catch {}
            }
            if (-not $qualityPassed) {
                Write-WriterLog "Step $s remains incomplete: measured quality evidence missing, failed, or stale."
                Add-Refusal $s 'quality' '' $qualityVerdict $qualityDetail
                continue
            }
        }
        if ($totalSteps -eq 50 -and $s -in @(39, 40, 43, 46, 47, 48)) {
            # Inspect immutable QA evidence only; a completion sentence is not proof.
            $qaPassed = $false
            $qaStatus = 'unavailable'
            $qaVerdict = ''
            $qaInspector = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/qa-report.mjs'
            if ((Test-Path -LiteralPath $qaInspector) -and (Get-Command node -ErrorAction SilentlyContinue)) {
                try {
                    # inspect prints its result for every outcome; exit 0 means current and PASS.
                    $qaJson = (& node $qaInspector inspect --workspace $projectRoot --step $s 2>$null | Out-String)
                    $qaExit = $LASTEXITCODE
                    $qaResult = $qaJson | ConvertFrom-Json -ErrorAction Stop
                    if ($null -ne $qaResult) {
                        $qaStatus = [string]$qaResult.status
                        $qaVerdict = [string]$qaResult.verdict
                    }
                    $qaPassed = $qaExit -eq 0 -and $qaResult.status -eq 'current' -and $qaResult.verdict -eq 'PASS'
                } catch {}
            }
            if (-not $qaPassed) {
                Write-WriterLog "Step $s remains incomplete: QA evidence missing, failed, or stale."
                Add-Refusal $s 'qa' $qaStatus $qaVerdict ''
                continue
            }
        }
        if ($totalSteps -eq 50 -and $s -eq 50) {
            # New final completion needs current measured evidence. Inspection only:
            # never install a browser or run project commands inside a Stop hook.
            $finalPassed = $false
            $finalVerdict = 'unavailable'
            $finalDetail = ''
            $inspector = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/quality-gate.mjs'
            if ((Test-Path -LiteralPath $inspector) -and (Get-Command node -ErrorAction SilentlyContinue)) {
                try {
                    $finalJson = (& node $inspector --inspect-final --workspace $projectRoot 2>$null | Out-String)
                    $finalExit = $LASTEXITCODE
                    $finalResult = $finalJson | ConvertFrom-Json -ErrorAction Stop
                    if ($null -ne $finalResult) {
                        $finalVerdict = [string]$finalResult.verdict
                        $finalDetail = [string]$finalResult.error
                    }
                    $finalPassed = $finalExit -eq 0 -and $finalResult.verdict -eq 'PASS'
                } catch {}
            }
            if (-not $finalPassed) {
                Write-WriterLog 'Step 50 remains incomplete: final quality/browser routing evidence missing, failed, or stale.'
                Add-Refusal $s 'final' '' $finalVerdict $finalDetail
                continue
            }
        }
        $completedNew += $s
    }
}

# Refused completions for step-auto-continue (see Add-Refusal): replaced or removed on every Stop that
# gets this far, through a temp file and rename, so a reader never sees a half-written file.
try {
    if ($refusals.Count -gt 0) {
        # run_started_at ties the refusals to this run: step-auto-continue ignores a file left by an
        # earlier run of the workspace (after /harness-reset or a new /webapp bootstrap).
        $refusalJson = [pscustomobject]@{ schema_version = 1; run_started_at = $progress.run_started_at; refusals = @($refusals.ToArray()) } | ConvertTo-Json -Depth 4 -Compress
        $refusalTemp = "$refusalFile.tmp.$PID"
        [System.IO.File]::WriteAllText($refusalTemp, $refusalJson, (New-Object System.Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $refusalTemp -Destination $refusalFile -Force -ErrorAction Stop
    } elseif (Test-Path -LiteralPath $refusalFile) {
        Remove-Item -LiteralPath $refusalFile -Force -ErrorAction Stop
    }
} catch {
    Write-WriterLog "refusal file update FAILED: $_"
}

if ($completedNew.Count -gt 0) {
    $allCompleted = @($existing) + $completedNew | Sort-Object -Unique
    $progress.completed_steps = @($allCompleted)

    # F3 fix (2026-06-10): next-step 결정을 loader/obedience-guard와 동일한 first-gap
    # 규칙으로 통일 (구버전 max+1 방식은 완료 누락(gap) 발생 시 훅 3곳이 서로 다른
    # step을 지시하는 분기를 만들었음)
    $nextGap = $null
    for ($i = 1; $i -le [int]$progress.total_steps; $i++) {
        if ($allCompleted -notcontains $i) { $nextGap = $i; break }
    }
    if ($null -ne $nextGap) {
        $progress.current_step = $nextGap
    } else {
        $progress.current_step = [int]$progress.total_steps
    }

    Write-WriterLog "Newly completed: $($completedNew -join ', ')"
    Write-WriterLog "Total: $($progress.completed_steps.Count)/$($progress.total_steps) (next=first-gap=$($progress.current_step))"
} else {
    # Cursor drift (harness-activity 'drift'): nothing new to record, but current_step is not the
    # first unfinished step, for example after a hand edit of progress.json. Put it back so the run
    # reads as active again; a paused run keeps its pause fields. A finished run keeps its cursor.
    # Mirrors step-progress-writer.sh.
    $driftGap = $null
    for ($i = 1; $i -le $totalSteps; $i++) { if (-not $existing.Contains($i)) { $driftGap = $i; break } }
    $cursorOk = ($progress.current_step -is [int] -or $progress.current_step -is [long]) -and $progress.current_step -eq $driftGap
    if ($null -ne $driftGap -and -not $cursorOk) {
        Write-WriterLog "current_step $($progress.current_step) -> $driftGap (cursor drift)"
        $progress.current_step = $driftGap
    }
}

# 4) 세션 이력 업데이트 (필드 없으면 생성)
if (-not $progress.PSObject.Properties.Name.Contains('session_history')) {
    $progress | Add-Member -NotePropertyName 'session_history' -NotePropertyValue @() -Force
}
$sessions = @($progress.session_history)
if ($sessions.Count -gt 0) {
    $lastSession = $sessions[-1]
    if ($lastSession) {
        $lastSession | Add-Member -NotePropertyName 'ended_at' -NotePropertyValue (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') -Force
        $lastSession | Add-Member -NotePropertyName 'steps_completed' -NotePropertyValue $completedNew.Count -Force
        $sessions[-1] = $lastSession
        $progress.session_history = $sessions
    }
}

# MoAI-ADK 벤치마킹: 보조 산출물 카운트 반영
try {
    $specDir = Join-Path $stepArchive "specs"
    if (Test-Path -LiteralPath $specDir) {
        $specCount = (Get-ChildItem -LiteralPath $specDir -Filter "SPEC-*.md" -ErrorAction SilentlyContinue).Count
        if (-not $progress.PSObject.Properties.Name.Contains('moai_features')) {
            $progress | Add-Member -NotePropertyName 'moai_features' -NotePropertyValue ([PSCustomObject]@{ spec_generated_count=0; mx_tag_warnings=0; lsp_autofixes=0 }) -Force
        }
        $progress.moai_features.spec_generated_count = $specCount
    }
    # @MX 경고 / LSP 자동수정 카운트 (로그 행 수 기반 근사)
    $mxLog = Join-Path $PSScriptRoot "mx-tag-validator.log"
    if (Test-Path -LiteralPath $mxLog) {
        $progress.moai_features.mx_tag_warnings = (Select-String -LiteralPath $mxLog -Pattern '@MX-WARN' -ErrorAction SilentlyContinue).Count
    }
    $lspLog = Join-Path $PSScriptRoot "lsp-autofix.log"
    if (Test-Path -LiteralPath $lspLog) {
        $progress.moai_features.lsp_autofixes = (Select-String -LiteralPath $lspLog -Pattern 'OK:' -ErrorAction SilentlyContinue).Count
    }
} catch {
    Write-WriterLog "moai_features update FAILED: $_"
}

# Add-Member -Force: a hand-edited progress.json may lack the field, and plain assignment would
# then print an error (step-progress-writer.sh assigns the key either way).
$progress | Add-Member -NotePropertyName 'last_updated' -NotePropertyValue (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') -Force

# B-P2-7 fix: 비원자적 truncate 대신 temp 파일 → rename
try {
    $jsonOutput = $progress | ConvertTo-Json -Depth 32 -Compress
    if ([string]::IsNullOrWhiteSpace($jsonOutput) -or $jsonOutput -eq 'null') {
        Write-WriterLog "ERROR: ConvertTo-Json produced null/empty — refusing to write"
    } else {
        $tempFile = "$progressFile.tmp.$PID"
        $jsonOutput | Out-File -LiteralPath $tempFile -Encoding UTF8 -Force
        # PS 5.1 Out-File은 BOM을 추가하므로 BOM 제거
        $bytes = [System.IO.File]::ReadAllBytes($tempFile)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $bytes = $bytes[3..($bytes.Length - 1)]
            [System.IO.File]::WriteAllBytes($tempFile, $bytes)
        }
        # 원자적 rename (Windows: Move-Item -Force는 같은 볼륨에서 원자적)
        Move-Item -LiteralPath $tempFile -Destination $progressFile -Force
        Write-WriterLog "Progress saved atomically"
        # F1 fix (2026-06-10): 롤링 백업 — 완주 이력이 리셋/삭제로 소실되는 사고 대비
        try { Copy-Item -LiteralPath $progressFile -Destination "$progressFile.bak" -Force } catch {}
    }
} catch {
    Write-WriterLog "atomic write FAILED: $_"
}

try { $mutex.ReleaseMutex() } catch {}
$mutex.Dispose()
exit 0
