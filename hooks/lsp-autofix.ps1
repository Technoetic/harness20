# lsp-autofix.ps1 - LSP 기반 자동수정 (PostToolUse: Edit/Write)
#
# MoAI-ADK Ralph Engine (`moai-workflow-loop` 스킬) 부분 모방:
#   - 정식 Ralph Engine: LSP diagnostics + AST-grep 결합, Level 1~4 자동 분류, 최대 100회 반복
#   - 본 구현: Biome / Stylelint 자동수정만 호출 (AST-grep 미포함, 분류 미수행, 1패스)
#     ※ tsc는 호출하지 않음 (2026-06-10 문서 정정 — tsc --noEmit은 단일 파일 검사 불가,
#        전체 프로젝트 타입체크라 30초 훅 타임아웃 위험으로 의도적 미포함)
# 즉 Ralph Engine의 LSP 진단 부분만 단순 인라인화한 축약 변형.
#
# 정책:
#   - fail-open (exit 0). 진단 실패 시 경고만 로그.
#   - 자동수정은 Biome `check --write` (2.x 정식 플래그 — 구 `--apply`는 2.x에서 제거되어
#     100% 실패했음, 2026-06-10 수정). --unsafe 수정은 미적용 (안전 수정만, 의도적 결정).
#   - 대상 파일이 프로젝트 루트의 src/ 아래일 때만 동작. step_archive/, .claude/, node_modules/ 제외.
#   - 활성 워크플로에서만 실행된다(run-hook.mjs의 lsp-autofix 게이트).
#   - 프로젝트 node_modules에 설치된 biome·stylelint만 `npx --no-install`로 실행한다.
#     로컬 설치가 없으면 내려받지 않고 "skipped" 로그만 남긴다(npx 캐시의 패키지도 쓰지 않음).

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
$logFile = Join-Path $PSScriptRoot "lsp-autofix.log"
function Write-LspLog($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try { Add-Content -LiteralPath $logFile -Value "[$ts] $msg" -Encoding UTF8 } catch {}
}

# stdin
$inputJson = $null
try {
    $stdinStream = [System.IO.StringReader]::new($harnessRaw)
    $raw = $harnessRaw
    $stdinStream.Close()
    if ($raw) { $inputJson = $raw | ConvertFrom-Json }
} catch {
    Write-LspLog "stdin parse FAILED (fail-open): $_"
    exit 0
}
if ($null -eq $inputJson) { exit 0 }

# 대상 파일
$filePath = $null
try {
    if ($inputJson.tool_input.file_path) { $filePath = $inputJson.tool_input.file_path }
    elseif ($inputJson.tool_input.path)  { $filePath = $inputJson.tool_input.path }
} catch {}
if (-not $filePath) { exit 0 }

# 확장자 필터
$ext = [System.IO.Path]::GetExtension($filePath).ToLower()
$jsExts  = @('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs')
$cssExts = @('.css', '.scss')
if (($jsExts -notcontains $ext) -and ($cssExts -notcontains $ext)) { exit 0 }

# 경로 정규화 (2026-06-10 posttool:F3 fix: 슬래시 경로 입력 시 백슬래시 전용 필터가
# 전부 미스되어 src/ 파일이 조용히 스킵되던 결함 — 구분자 통일 후 필터)
$filePath = $filePath -replace '/', '\'

$projectRoot = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } elseif ($harnessEvent.cwd) { [string]$harnessEvent.cwd } else { [System.IO.Directory]::GetCurrentDirectory() }

# 경로 필터: projectRoot 기준 상대 경로가 src\ 로 시작하는 파일만 대상 (프로젝트 밖 파일 제외).
# 상대 경로 입력은 projectRoot 기준으로 해석한다.
try {
    $rootFull = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\') + '\'
    $fileFull = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, $filePath))
} catch { exit 0 }
if (-not $fileFull.StartsWith($rootFull + 'src\', [System.StringComparison]::OrdinalIgnoreCase)) { exit 0 }
$relativePath = $fileFull.Substring($rootFull.Length)
if (('\' + $relativePath) -match '\\(node_modules|\.git|step_archive|\.claude)\\') { exit 0 }

# Biome 자동수정 (JS/TS) — 프로젝트에 설치된 @biomejs/biome가 있을 때만
if ($jsExts -contains $ext) {
    $biomePkg = Join-Path $projectRoot 'node_modules\@biomejs\biome\package.json'
    if (-not (Test-Path -LiteralPath $biomePkg -PathType Leaf)) {
        Write-LspLog "biome skipped (no local @biomejs/biome): $filePath"
    } else {
        try {
            try {
                Push-Location -LiteralPath $projectRoot
                $biomeOut = (& cmd /c "npx --no-install @biomejs/biome check --write ""$filePath"" 2>&1") -join "`n"
            } finally { Pop-Location }
            if ($LASTEXITCODE -eq 0) {
                Write-LspLog "biome OK: $filePath"
            } else {
                Write-LspLog "biome diagnostics (non-fatal): $filePath"
                # 출력 처음 5줄만 stderr로
                $head = ($biomeOut -split "`n" | Select-Object -First 5) -join "`n"
                [Console]::Error.WriteLine("[LSP-AUTOFIX] biome: $filePath")
                [Console]::Error.WriteLine($head)
            }
        } catch {
            Write-LspLog "biome FAILED: $_"
        }
    }
}

# Stylelint 자동수정 (CSS) — 프로젝트에 설치된 stylelint가 있을 때만
if ($cssExts -contains $ext) {
    $stylelintPkg = Join-Path $projectRoot 'node_modules\stylelint\package.json'
    if (-not (Test-Path -LiteralPath $stylelintPkg -PathType Leaf)) {
        Write-LspLog "stylelint skipped (no local stylelint): $filePath"
    } else {
        try {
            try {
                Push-Location -LiteralPath $projectRoot
                $slOut = (& cmd /c "npx --no-install stylelint --fix ""$filePath"" 2>&1") -join "`n"
            } finally { Pop-Location }
            if ($LASTEXITCODE -eq 0) {
                Write-LspLog "stylelint OK: $filePath"
            } else {
                Write-LspLog "stylelint diagnostics (non-fatal): $filePath"
                $slHead = ($slOut -split "`n" | Select-Object -First 5) -join "`n"
                [Console]::Error.WriteLine("[LSP-AUTOFIX] stylelint: $filePath")
                [Console]::Error.WriteLine($slHead)
            }
        } catch {
            Write-LspLog "stylelint FAILED: $_"
        }
    }
}

exit 0
