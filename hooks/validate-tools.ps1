# validate-tools.ps1 - on-demand wrapper for step003~014 환경 검증
# 사용: powershell -File hooks/validate-tools.ps1 -Tool <playwright|aside|axe|biome|stylelint|c8|jscpd>
#   playwright / aside : 브라우저 검증 백엔드 (둘 중 하나면 충분 — docs/BROWSER-TOOLS.md)
#   axe                : axe-core (도구 중립), 없으면 @axe-core/playwright로 폴백
param([Parameter(Mandatory=$true)][string]$Tool)
$ErrorActionPreference = "Continue"

$projectRoot = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { Get-Location }
$stepArchive = Join-Path $projectRoot "step_archive"
$outDir = Join-Path $stepArchive "research-scripts"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# Step 3 locks the project's browser backend in step_archive/outputs/browser-backend.json.
# Missing-tool hints then name only that backend (docs/BROWSER-TOOLS.md, "Backend lock (Step 3)").
# The same node one-liner as validate-tools.sh prints the locked backend or nothing.
$lockFile = "step_archive/outputs/browser-backend.json"
function Get-LockedBrowserBackend {
  $js = "try{const j=JSON.parse(require('fs').readFileSync('step_archive/outputs/browser-backend.json','utf8'));if(j&&j.schema_version===1&&(j.selected==='playwright'||j.selected==='aside'))process.stdout.write(j.selected)}catch(e){}"
  Push-Location $projectRoot
  try { $locked = ((& node -e $js 2>$null) -join '').Trim() } catch { $locked = '' }
  Pop-Location
  return $locked
}

switch ($Tool.ToLower()) {
  'playwright' {
    # Resolve the installed package (plugin browser-verifier/ first, then the project) instead of
    # `npx playwright`, which would install the package from the registry when it is missing.
    $browserVerifier = Join-Path (Split-Path -Parent $PSScriptRoot) "browser-verifier"
    $js = "const p=require.resolve('playwright/package.json',{paths:process.argv.slice(1)});console.log(require(p).version+' ('+require('path').dirname(p)+')')"
    Push-Location $projectRoot
    $out = (& cmd /c "node -e ""$js"" ""$browserVerifier"" ""$projectRoot"" 2>&1") -join "`n"
    Pop-Location
    if ($LASTEXITCODE -eq 0) { Write-Host "playwright: $out"; exit 0 }
    $locked = Get-LockedBrowserBackend
    if ($locked -eq 'aside') { Write-Host "playwright: missing (not needed: this project is locked to the aside backend by $lockFile; keep it and do not install Playwright or Chromium)" }
    elseif ($locked -eq 'playwright') { Write-Host "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium; this project is locked to the playwright backend by $lockFile)" }
    else { Write-Host "playwright: missing (cd browser-verifier && npm ci && npx playwright install chromium, or use the aside backend)" }
    exit 1
  }
  'aside' {
    Push-Location $projectRoot
    $out = (& cmd /c "aside --version 2>&1") -join "`n"
    $asideExit = $LASTEXITCODE
    Pop-Location
    Write-Host "aside: $out"
    if ($asideExit -eq 0) { exit 0 }
    $locked = Get-LockedBrowserBackend
    if ($locked -eq 'playwright') { Write-Host "aside: not needed: this project is locked to the playwright backend by $lockFile; keep it and do not install the Aside CLI" }
    elseif ($locked -eq 'aside') { Write-Host "aside: this project is locked to the aside backend by $lockFile; start the Aside app and check aside --version in this shell; do not install Playwright or Chromium" }
    exit 1
  }
  'axe' {
    Push-Location $projectRoot
    $out = (& cmd /c "node -e ""require.resolve('axe-core')"" 2>&1") -join "`n"
    $found = ($LASTEXITCODE -eq 0)
    $label = 'axe-core'
    if (-not $found) {
      $out = (& cmd /c "node -e ""require.resolve('@axe-core/playwright')"" 2>&1") -join "`n"
      $found = ($LASTEXITCODE -eq 0)
      $label = '@axe-core/playwright'
    }
    Pop-Location
    if ($found) { Write-Host "axe-core: OK ($label)"; exit 0 } else { Write-Host "axe-core: FAIL $out"; exit 1 }
  }
  'biome' {
    Push-Location $projectRoot
    $out = (& cmd /c "npx biome --version 2>&1") -join "`n"
    Pop-Location
    Write-Host "biome: $out"
    if ($LASTEXITCODE -eq 0) { exit 0 } else { exit 1 }
  }
  'stylelint' {
    Push-Location $projectRoot
    $out = (& cmd /c "npx stylelint --version 2>&1") -join "`n"
    Pop-Location
    Write-Host "stylelint: $out"
    if ($LASTEXITCODE -eq 0) { exit 0 } else { exit 1 }
  }
  'c8' {
    Push-Location $projectRoot
    $out = (& cmd /c "npx c8 --version 2>&1") -join "`n"
    Pop-Location
    Write-Host "c8: $out"
    if ($LASTEXITCODE -eq 0) { exit 0 } else { exit 1 }
  }
  'jscpd' {
    Push-Location $projectRoot
    $out = (& cmd /c "npx jscpd --version 2>&1") -join "`n"
    Pop-Location
    Write-Host "jscpd: $out"
    if ($LASTEXITCODE -eq 0) { exit 0 } else { exit 1 }
  }
  default {
    Write-Host "Unknown tool: $Tool (use playwright|aside|axe|biome|stylelint|c8|jscpd)"
    exit 1
  }
}
