# html-bundler.ps1 — src/ 구조를 단일 dist/index.html로 번들링 (file:// 호환)
#
# 역할 (step037/038 계약):
#   - src/index.html 을 베이스로
#   - src/**/*.css → <style> 인라인 (첫 </head> 앞, 원격 @import는 맨 앞으로, 로컬 @import는 제거)
#   - src/**/*.js  → <script> 인라인 (마지막 </body> 앞, import/export 문 제거)
#   - 로컬 <link href="...css">, <script src="...js"> 참조 태그 제거
#   - 결과: dist/index.html (단일 파일)
#
# 사용: powershell -ExecutionPolicy Bypass -File <경로>/html-bundler.ps1 [-ProjectRoot <경로>]
# 산출물이 이 하네스의 유일한 "단일 HTML" 생성 메커니즘이다. 수동 인라인 대신 본 스크립트를 쓴다.

param(
  [string]$ProjectRoot = ""
)
$ErrorActionPreference = "Stop"
# PowerShell 5.1 writes stdout in the console code page (cp949 on Korean Windows), so the summary
# line reached the caller garbled. Emit UTF-8 like the other hooks.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

if (-not $ProjectRoot) {
  $ProjectRoot = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { [System.IO.Directory]::GetCurrentDirectory() }
}
$srcDir  = Join-Path $ProjectRoot "src"
$distDir = Join-Path $ProjectRoot "dist"
$indexSrc = Join-Path $srcDir "index.html"

if (-not (Test-Path -LiteralPath $indexSrc)) {
  Write-Error "html-bundler: src/index.html 이 없습니다 ($indexSrc). Step 37 산출물을 먼저 생성하세요."
  exit 1
}

$html = Get-Content -LiteralPath $indexSrc -Raw -Encoding UTF8

# 1) 로컬 참조 태그 제거 (외부 http(s) 링크는 보존)
$html = [regex]::Replace($html, '(?i)<link\b[^>]*\bhref\s*=\s*["''](?!https?:|//)[^"'']*\.css[^>]*>', '')
$html = [regex]::Replace($html, '(?i)<script\b[^>]*\bsrc\s*=\s*["''](?!https?:|//)[^"'']*\.js[^>]*>\s*</script\s*>', '')

# 2) CSS 수집 → <style> 인라인
#    @import 줄은 본문에서 지운다. 로컬 파일은 어차피 모두 인라인되고, 원격(http(s):, //) @import는
#    처음 나온 순서로 한 번씩 <style> 맨 앞에 둔다(@import는 다른 규칙보다 앞에 있어야 읽힌다).
#    html-bundler.sh와 같은 정규식이다.
$importLine = '(?im)^[ \t]*@import\s+[^;\r\n]+;[ \t]*\r?\n?'
$remoteImports = New-Object System.Collections.Generic.List[string]
$cssParts = @()
if (Test-Path -LiteralPath $srcDir) {
  Get-ChildItem -LiteralPath $srcDir -Recurse -File -Filter '*.css' | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($srcDir.Length).TrimStart('\','/')
    $css = [string](Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8)
    foreach ($importMatch in [regex]::Matches($css, $importLine)) {
      $line = $importMatch.Value.Trim()
      if ($line -match '(?i)https?:|//' -and -not $remoteImports.Contains($line)) { $remoteImports.Add($line) }
    }
    $cssParts += "/* $rel */`n" + [regex]::Replace($css, $importLine, '')
  }
}
$styleBlock = ""
if ($cssParts.Count -gt 0) {
  $importHead = if ($remoteImports.Count -gt 0) { ($remoteImports -join "`n") + "`n" } else { "" }
  $styleBlock = "<style>`n" + $importHead + ($cssParts -join "`n`n") + "`n</style>`n"
}

# 3) JS 수집 → import/export 문 제거 후 <script> 인라인
#    줄이 아니라 문 단위로 지운다: 여러 줄 import { … } from, 세미콜론 없는 문, 따로 선 export default
#    줄도 깨진 코드를 남기지 않는다. import()와 import.meta는 문이 아니라서 그대로 둔다.
#    html-bundler.sh와 같은 정규식 네 개다.
function Strip-Module([string]$js) {
  # ① import … from '…' 와 import '…'
  $js = [regex]::Replace($js, '(?m)^[ \t]*import[ \t]*(?:[\w$*{}\s,]+?[ \t]*from[ \t]*)?(["''])[^"''\r\n]*\1[ \t]*;?[ \t]*\r?\n?', '')
  # ② export { … } [from '…'] 와 export * [as ns] from '…'
  $js = [regex]::Replace($js, '(?m)^[ \t]*export[ \t]*(?:\{[^}]*\}|\*(?:[ \t]+as[ \t]+[\w$]+)?)[ \t]*(?:from[ \t]*(["''])[^"''\r\n]*\1)?[ \t]*;?[ \t]*\r?\n?', '')
  # ③ export default → 뒤의 식이나 선언만 남긴다 (다음 줄에 있어도)
  $js = [regex]::Replace($js, '(?m)^([ \t]*)export[ \t]+default[ \t\r\n]+', '$1')
  # ④ export function/class/const/let/var → 선언만 남긴다
  $js = [regex]::Replace($js, '(?m)^([ \t]*)export[ \t]+(?=(?:async[ \t]+)?function|class|const|let|var)', '$1')
  return $js
}
$jsParts = @()
if (Test-Path -LiteralPath $srcDir) {
  Get-ChildItem -LiteralPath $srcDir -Recurse -File | Where-Object { $_.Extension -in '.js','.mjs' } | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($srcDir.Length).TrimStart('\','/')
    $jsParts += "// $rel`n" + (Strip-Module (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8))
  }
}
$scriptBlock = ""
if ($jsParts.Count -gt 0) {
  $scriptBlock = "<script>`n" + ($jsParts -join "`n`n") + "`n</script>`n"
}

# 4) 주입: 첫 </head> 앞에 style, 마지막 </body> 앞에 script (html-bundler.sh와 같은 규칙).
#    찾은 위치에 문자열로 끼워 넣으므로 코드 안의 $&·$1·$$가 치환 기호로 읽히지 않는다.
#    앞쪽 </body>는 <template>이나 스크립트 문자열 안의 글자일 수 있어 문서를 닫는 마지막 것을 쓴다.
#    태그가 없으면 style은 맨 앞에, script는 맨 뒤에 붙인다.
if ($styleBlock) {
  $headTag = [regex]::Match($html, '(?i)</head\s*>')
  if ($headTag.Success) { $html = $html.Substring(0, $headTag.Index) + $styleBlock + $html.Substring($headTag.Index) }
  else { $html = $styleBlock + $html }
}
if ($scriptBlock) {
  $bodyTags = [regex]::Matches($html, '(?i)</body\s*>')
  if ($bodyTags.Count -gt 0) { $at = $bodyTags[$bodyTags.Count - 1].Index; $html = $html.Substring(0, $at) + $scriptBlock + $html.Substring($at) }
  else { $html = $html + $scriptBlock }
}

# 5) dist/index.html 저장 (UTF-8 no BOM, LF)
if (-not (Test-Path -LiteralPath $distDir)) { New-Item -ItemType Directory -Path $distDir -Force | Out-Null }
$distIndex = Join-Path $distDir "index.html"
$html = $html -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($distIndex, $html, (New-Object System.Text.UTF8Encoding($false)))

$size = (Get-Item -LiteralPath $distIndex).Length
Write-Output "html-bundler: dist/index.html 생성 완료 ($size bytes, css=$($cssParts.Count) js=$($jsParts.Count))"
if ($size -lt 1) { Write-Error "html-bundler: 결과물이 비어 있습니다"; exit 1 }
exit 0
