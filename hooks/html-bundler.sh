#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# html-bundler.sh — src/ 구조를 단일 dist/index.html로 번들링 (file:// 호환)
#
# 역할 (step037/038 계약):
#   src/index.html 베이스 + src/**/*.css → <style> 인라인(첫 </head> 앞, 원격 @import는 맨 앞으로, 로컬 @import는 제거)
#   + src/**/*.js → <script> 인라인(마지막 </body> 앞, import/export 문 제거)
#   로컬 <link href>, <script src> 참조 제거. 결과: dist/index.html 단일 파일.
#
# 사용: bash <경로>/html-bundler.sh [PROJECT_ROOT]
set -eu

PROJECT_ROOT="${1:-${CLAUDE_PROJECT_DIR:-$PWD}}"
SRC_DIR="$PROJECT_ROOT/src"
DIST_DIR="$PROJECT_ROOT/dist"
INDEX_SRC="$SRC_DIR/index.html"

if [ ! -f "$INDEX_SRC" ]; then
  echo "html-bundler: src/index.html 이 없습니다 ($INDEX_SRC). Step 37 산출물을 먼저 생성하세요." 1>&2
  exit 1
fi
command -v python3 >/dev/null 2>&1 || { echo "html-bundler: python3 필요" 1>&2; exit 1; }

mkdir -p "$DIST_DIR"
export SRC_DIR DIST_DIR INDEX_SRC
python3 - <<'PY'
import os, re, glob

src = os.environ["SRC_DIR"]
dist = os.environ["DIST_DIR"]
index_src = os.environ["INDEX_SRC"]

with open(index_src, encoding="utf-8") as f:
    html = f.read()

# 1) 로컬 참조 태그 제거 (외부 http(s)는 보존)
html = re.sub(r'(?i)<link\b[^>]*\bhref\s*=\s*["\'](?!https?:|//)[^"\']*\.css[^>]*>', '', html)
html = re.sub(r'(?i)<script\b[^>]*\bsrc\s*=\s*["\'](?!https?:|//)[^"\']*\.js[^>]*>\s*</script\s*>', '', html)

# src/ 아래 일반 파일만 모은다. 프로젝트 경로의 [ ]가 glob 문자 클래스로 읽히지 않게
# escape하고, 이름만 .js/.css인 디렉터리(예: vendor.js/)는 건너뛴다 (ps1의 -LiteralPath -File과 동일).
def src_files(pattern):
    return [p for p in glob.glob(os.path.join(glob.escape(src), "**", pattern), recursive=True) if os.path.isfile(p)]

# 2) CSS 수집 → <style>
#    @import 줄은 본문에서 지운다. 로컬 파일은 어차피 모두 인라인되고, 원격(http(s):, //) @import는
#    처음 나온 순서로 한 번씩 <style> 맨 앞에 둔다(@import는 다른 규칙보다 앞에 있어야 읽힌다).
#    html-bundler.ps1과 같은 정규식이다.
IMPORT_LINE = re.compile(r'^[ \t]*@import\s+[^;\r\n]+;[ \t]*\r?\n?', re.I | re.M)
REMOTE = re.compile(r'https?:|//', re.I)
css_files = sorted(src_files("*.css"))
css_parts = []
remote_imports = []
for p in css_files:
    rel = os.path.relpath(p, src)
    with open(p, encoding="utf-8") as f:
        css = f.read()
    for m in IMPORT_LINE.finditer(css):
        line = m.group(0).strip()
        if REMOTE.search(line) and line not in remote_imports:
            remote_imports.append(line)
    css_parts.append("/* %s */\n%s" % (rel, IMPORT_LINE.sub('', css)))
import_head = ("\n".join(remote_imports) + "\n") if remote_imports else ""
style_block = ("<style>\n" + import_head + "\n\n".join(css_parts) + "\n</style>\n") if css_parts else ""

# 3) JS 수집 → import/export 문 제거 → <script>
#    줄이 아니라 문 단위로 지운다: 여러 줄 import { … } from, 세미콜론 없는 문, 따로 선 export default
#    줄도 깨진 코드를 남기지 않는다. import()와 import.meta는 문이 아니라서 그대로 둔다.
#    html-bundler.ps1과 같은 정규식 네 개다.
IMPORT_STMT = re.compile(r'''^[ \t]*import[ \t]*(?:[\w$*{}\s,]+?[ \t]*from[ \t]*)?(["'])[^"'\r\n]*\1[ \t]*;?[ \t]*\r?\n?''', re.M)
EXPORT_LIST = re.compile(r'''^[ \t]*export[ \t]*(?:\{[^}]*\}|\*(?:[ \t]+as[ \t]+[\w$]+)?)[ \t]*(?:from[ \t]*(["'])[^"'\r\n]*\1)?[ \t]*;?[ \t]*\r?\n?''', re.M)
EXPORT_DEFAULT = re.compile(r'^([ \t]*)export[ \t]+default[ \t\r\n]+', re.M)
EXPORT_DECLARATION = re.compile(r'^([ \t]*)export[ \t]+(?=(?:async[ \t]+)?function|class|const|let|var)', re.M)

def strip_module(js):
    js = IMPORT_STMT.sub('', js)                 # ① import … from '…' 와 import '…'
    js = EXPORT_LIST.sub('', js)                 # ② export { … } [from '…'] 와 export * [as ns] from '…'
    js = EXPORT_DEFAULT.sub(r'\1', js)           # ③ export default → 뒤의 식이나 선언만 (다음 줄에 있어도)
    js = EXPORT_DECLARATION.sub(r'\1', js)       # ④ export function/class/const/let/var → 선언만
    return js

js_files = sorted(src_files("*.js") + src_files("*.mjs"))
js_parts = []
for p in js_files:
    rel = os.path.relpath(p, src)
    with open(p, encoding="utf-8") as f:
        js_parts.append("// %s\n%s" % (rel, strip_module(f.read())))
script_block = ("<script>\n" + "\n\n".join(js_parts) + "\n</script>\n") if js_parts else ""

# 4) 주입: 첫 </head> 앞에 style, 마지막 </body> 앞에 script (html-bundler.ps1과 같은 규칙).
#    찾은 위치에 문자열로 끼워 넣으므로 코드 안의 \d·\1이나 Windows 상대 경로의 \가 re 이스케이프로
#    읽히지 않는다. 앞쪽 </body>는 <template>이나 스크립트 문자열 안의 글자일 수 있어 문서를 닫는
#    마지막 것을 쓴다. 태그가 없으면 style은 맨 앞에, script는 맨 뒤에 붙인다.
if style_block:
    head = re.search(r'(?i)</head\s*>', html)
    html = html[:head.start()] + style_block + html[head.start():] if head else style_block + html
if script_block:
    bodies = list(re.finditer(r'(?i)</body\s*>', html))
    html = html[:bodies[-1].start()] + script_block + html[bodies[-1].start():] if bodies else html + script_block

# 5) 저장 (UTF-8, LF)
html = html.replace("\r\n", "\n")
out_path = os.path.join(dist, "index.html")
with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
size = os.path.getsize(out_path)
print("html-bundler: dist/index.html 생성 완료 (%d bytes, css=%d js=%d)" % (size, len(css_parts), len(js_parts)))
raise SystemExit(0 if size > 0 else 1)
PY
exit $?
