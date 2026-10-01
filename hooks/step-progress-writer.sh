#!/usr/bin/env bash
# Windows guard: skip on git-bash / MSYS / Cygwin (ps1 counterpart runs there)
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
# step-progress-writer.sh — Stop hook (macOS/Linux)
# Run boundary (mirrors step-progress-writer.ps1): when progress.json has run_started_at (written
# by the /webapp bootstrap and by harness-pause.mjs reset), only transcript entries from that
# moment on count. Without it (runs started by 2.9.0 and earlier) the whole transcript counts.
set -u
RAW="$(cat || true)"
EVENT_CWD=""
if command -v python3 >/dev/null 2>&1; then
  EVENT_CWD="$(printf '%s' "$RAW" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("cwd", "") if isinstance(d,dict) else "")' 2>/dev/null || true)"
fi
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${EVENT_CWD:-$PWD}}"

STEP_ARCHIVE="$PROJECT_ROOT/step_archive"
ARCHIVED_DIR="$STEP_ARCHIVE/archived"
PROGRESS_FILE="$STEP_ARCHIVE/progress.json"
LOG_FILE="$(dirname "${BASH_SOURCE[0]}")/step-progress-writer.log"
LOCK_FILE="$STEP_ARCHIVE/.writer.lock"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG_FILE" 2>/dev/null || true; }

# Codex coexistence (mirrors step-progress-writer.ps1): the Codex state manager owns completion.
# Leave progress.json untouched and never create the lock file.
if [ -e "$STEP_ARCHIVE/.harness50-codex/state.json" ]; then
  log "Codex workflow state present -> exit 0 (progress.json left unchanged)"
  exit 0
fi
[ -f "$PROGRESS_FILE" ] || exit 0
command -v python3 >/dev/null 2>&1 || { log "python3 missing"; exit 0; }

H50_WRITER_INSPECTOR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/quality-gate.mjs"
if command -v cygpath >/dev/null 2>&1; then H50_WRITER_INSPECTOR="$(cygpath -m "$H50_WRITER_INSPECTOR")"; fi
export RAW PROGRESS_FILE ARCHIVED_DIR H50_WRITER_INSPECTOR

# writer_py probe: prints "idle" for a paused run with no new completion line and an aligned cursor
# (current_step on the first unfinished step), else "work"; reads only. writer_py write: records the
# completions, puts a drifted cursor back and rewrites progress.json.
writer_py() {
python3 - "$1" <<'PY'
import json, os, re, sys, datetime, tempfile, shutil, subprocess
mode=sys.argv[1] if len(sys.argv)>1 else "write"
raw=os.environ.get("RAW","")
p_path=os.environ["PROGRESS_FILE"]
a_dir=os.environ["ARCHIVED_DIR"]

try:
    with open(p_path,encoding="utf-8") as f: progress=json.load(f)
except Exception: raise SystemExit(0)

# Named pause (harness-rules 2-1): hooks/lib/harness-activity.mjs starts this hook for a paused run
# so that the completion lines of the turn that paused are recorded; the pause fields are kept as
# they are. A drifted cursor is put back as well (below). With no new line to record and the cursor
# on the first unfinished step nothing changes (probe below): no lock file, no log line, no rewrite.
# Same judgement as scripts/lib/pause-state.mjs isPaused.
p=progress
paused=isinstance(p,dict) and (('paused' in p and p['paused'] is not False) or p.get('status')=='paused')
if mode=="probe" and not paused:
    print("work")
    raise SystemExit(0)

# UTC instant of an ISO 8601 timestamp: date, 'T', time, any number of fraction digits (cut to
# microseconds) and 'Z' or a +hh:mm/-hh:mm offset; anything else is None. Instants are compared as
# times, never as text: '01:02:03Z' and '01:02:03.000Z' are equal (mirrors Get-UtcTicks in the .ps1).
ISO=re.compile(r'([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})')
def utc_instant(value):
    if not isinstance(value,str): return None
    m=ISO.fullmatch(value)
    if not m: return None
    try:
        fraction=((m.group(7) or "")+"000000")[:6]
        instant=datetime.datetime(int(m.group(1)),int(m.group(2)),int(m.group(3)),int(m.group(4)),int(m.group(5)),int(m.group(6)),int(fraction),tzinfo=datetime.timezone.utc)
        zone=m.group(8)
        if zone!="Z":
            # Offsets beyond +-14:00 are no instant (the .NET DateTimeOffset range).
            if int(zone[4:6])>59 or int(zone[1:3])*60+int(zone[4:6])>14*60: return None
            shift=datetime.timedelta(hours=int(zone[1:3]),minutes=int(zone[4:6]))
            instant=instant-shift if zone[0]=="+" else instant+shift
        return instant
    except (ValueError,OverflowError):
        return None

# Run boundary. Entries before run_started_at belong to an earlier run of this workspace (the topic
# before a /webapp bootstrap or /harness-reset in the same session). An entry without a parsable
# timestamp still counts: Claude Code stamps every transcript entry, so only a foreign or damaged
# line lacks one, and dropping it could lose a real completion (the step would run again, and in a
# new session the record is gone), while counting it is what every writer did before the boundary
# existed. A missing or unparsable run_started_at (runs started by 2.9.0 and earlier) sets no
# boundary: the whole transcript counts.
boundary=utc_instant(progress.get("run_started_at")) if isinstance(progress,dict) else None

# last_assistant_message is the final message of the turn that is stopping, written after any
# run_started_at recorded before or during that turn (webapp-trigger at UserPromptSubmit,
# harness-pause.mjs reset inside the turn), so it has no time and always counts.
texts=[]
j=None
try: j=json.loads(raw) if raw else None
except Exception: j=None
if j:
    if j.get("last_assistant_message"):
        texts.append(j["last_assistant_message"])
    tp=j.get("transcript_path")
    if tp and os.path.exists(tp):
        try:
            with open(tp,encoding="utf-8") as f:
                for ln in f:
                    ln=ln.strip()
                    # Only a line with 완료 (as text or as the JSON escape \uc644\ub8cc) can hold a
                    # completion report; the rest is skipped before json.loads. Mirrors the .ps1,
                    # where parsing every line of a long transcript ran past the hook budget.
                    if not ln or ("완료" not in ln and "\\uc644\\ub8cc" not in ln.lower()): continue
                    try:
                        e=json.loads(ln)
                        if e.get("type")=="assistant":
                            at=utc_instant(e.get("timestamp"))
                            if boundary is not None and at is not None and at<boundary: continue
                            content=(e.get("message") or {}).get("content") or []
                            for b in content:
                                if b.get("type")=="text" and b.get("text"):
                                    texts.append(b["text"])
                    except Exception: pass
        except Exception: pass

# Joined once, like the .ps1 (repeated += copies the text again for every block).
response="\n"+"\n".join(texts)

total=int(progress.get("total_steps",50))
found=set()
# .ps1 파리티 (H3 수정): 줄 단위 스캔 + 코드펜스/인용/예시 가드.
# 모델이 문서 예시 문자열("Step 042/107 완료")을 코드블록·인용·예시로 본문에
# 인용했을 때의 위양성 완료 처리를 차단한다. ``` 펜스 안, 인용(>), 백틱 포함,
# "예:"/"예시" 표기 줄은 완료 신호로 인정하지 않는다.
in_fence=False
patA=re.compile(r'^\s*[✅→\-\*\s]*Step\s+(\d{1,3})\s*/\s*(\d{1,3})\s*완료', re.I)
patB=re.compile(r'^\s*[✅→\-\*\s]*Step\s+(\d{1,3})\s+완료', re.I)
for line in response.split("\n"):
    if re.match(r'^\s*(```|~~~)', line):
        in_fence=not in_fence
        continue
    if in_fence:
        continue
    if '`' in line or re.match(r'^\s*>', line) or re.search(r'예\s*[:)]', line) or '예시' in line:
        continue
    mA=patA.match(line)
    if mA:
        n=int(mA.group(1)); tot=int(mA.group(2))
        if 1<=n<=total and tot==total: found.add(n)
        continue
    mB=patB.match(line)
    if mB:
        n=int(mB.group(1))
        if 1<=n<=total: found.add(n)

valid={n for n in found if (os.path.isfile(os.path.join(a_dir,f"step{n:03d}.md")) or os.path.isfile(os.path.join(os.path.dirname(a_dir),f"step{n:03d}.md")))}
existing=set(int(x) for x in (progress.get("completed_steps") or []))
first=next((n for n in range(1,total+1) if n not in existing),None)
cursor=progress.get("current_step")
aligned=first is None or (type(cursor) is int and cursor==first)

if mode=="probe":
    # Steps the refusal file of this run already holds were inspected and refused before; a paused
    # run does not count them as new work (mirrors Get-RefusedSteps in the .ps1).
    refused_before=set()
    try:
        with open(os.path.join(os.path.dirname(p_path),"progress-refusals.json"),encoding="utf-8-sig") as f: old=json.load(f)
        if isinstance(old,dict) and old.get("run_started_at")==progress.get("run_started_at"):
            refused_before={r["step"] for r in (old.get("refusals") or []) if isinstance(r,dict) and type(r.get("step")) is int}
    except (OSError,ValueError,TypeError,AttributeError): pass
    print("work" if (valid - existing - refused_before) or not aligned else "idle")
    raise SystemExit(0)

# Reported completions this Stop refuses, kept in step_archive/progress-refusals.json for
# step-auto-continue to name in its block reason (mirrors Add-Refusal in the .ps1).
refusals=[]
def refuse(step, gate, status, verdict, detail):
    # Inspector errors can name files by absolute path; the reason uses the same placeholder as the
    # other hook messages. The logical and physical roots are replaced longest first (/tmp is a
    # suffix of /private/tmp on macOS) and before whitespace is collapsed.
    text=str(detail or "")
    root=os.path.dirname(os.path.dirname(p_path))
    for form in sorted({root, os.path.realpath(root)}, key=len, reverse=True):
        if form: text=text.replace(form,"<project-root>")
    text=" ".join(text.split())
    if len(text)>160: text=text[:157]+"..."
    refusals.append({"step":step,"gate":gate,"status":str(status or ""),"verdict":str(verdict or ""),"detail":text})

workspace=os.path.dirname(os.path.dirname(p_path))
# Every inspection shares one deadline that ends well inside the writer's 28 s budget in
# run-hook.mjs, so a slow inspector is cut here instead of outliving a stopped writer.
import time
deadline=time.monotonic()+20
def remaining():
    return max(1.0, deadline-time.monotonic())
if total == 50:
    # The r1 (step 38) and r2 (step 44) milestones need current measured quality, as on Codex
    # (codex/scripts/lib/acceptance.mjs); the trust5 Stop block cannot enforce them during
    # continuous runs (stop_hook_active). Inspection only, with a deadline.
    for step in sorted((valid - existing) & {38, 44}):
        quality_passed = False
        verdict, detail = "unavailable", ""
        try:
            inspected = subprocess.run(
                ["node", os.environ["H50_WRITER_INSPECTOR"], "--inspect", "--workspace", workspace],
                capture_output=True, text=True, encoding="utf-8", timeout=remaining())
            result = json.loads(inspected.stdout)
            verdict, detail = str(result.get("verdict") or ""), str(result.get("error") or "")
            quality_passed = inspected.returncode == 0 and result.get("verdict") == "PASS"
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
        if not quality_passed:
            valid.discard(step)
            refuse(step, "quality", "", verdict, detail)
            print(f"Step {step} remains incomplete: measured quality evidence missing, failed, or stale.")
    qa_inspector = os.path.join(os.path.dirname(os.environ["H50_WRITER_INSPECTOR"]), "qa-report.mjs")
    for step in sorted((valid - existing) & {39, 40, 43, 46, 47, 48}):
        qa_passed = False
        status, verdict = "unavailable", ""
        try:
            # inspect prints its result for every outcome; exit 0 means current and PASS.
            inspected = subprocess.run(
                ["node", qa_inspector, "inspect", "--workspace", workspace, "--step", str(step)],
                capture_output=True, text=True, encoding="utf-8", timeout=remaining())
            result = json.loads(inspected.stdout)
            status, verdict = str(result.get("status") or ""), str(result.get("verdict") or "")
            qa_passed = inspected.returncode == 0 and result.get("status") == "current" and result.get("verdict") == "PASS"
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
        if not qa_passed:
            valid.discard(step)
            refuse(step, "qa", status, verdict, "")
            print(f"Step {step} remains incomplete: QA evidence missing, failed, or stale.")
if total == 50 and 50 in valid and 50 not in existing:
    # Inspection only, with a deadline; no browser installation or project commands.
    final_passed = False
    verdict, detail = "unavailable", ""
    try:
        inspected = subprocess.run(
            ["node", os.environ["H50_WRITER_INSPECTOR"], "--inspect-final", "--workspace", workspace],
            capture_output=True, text=True, encoding="utf-8", timeout=remaining())
        result = json.loads(inspected.stdout)
        verdict, detail = str(result.get("verdict") or ""), str(result.get("error") or "")
        final_passed = inspected.returncode == 0 and result.get("verdict") == "PASS"
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    if not final_passed:
        valid.discard(50)
        refuse(50, "final", "", verdict, detail)
        print("Step 50 remains incomplete: final quality/browser routing evidence missing, failed, or stale.")

# Replaced or removed on every write, through a temp file and rename (mirrors the .ps1).
refusal_path=os.path.join(os.path.dirname(p_path),"progress-refusals.json")
try:
    if refusals:
        refusal_tmp=refusal_path+f".tmp.{os.getpid()}"
        with open(refusal_tmp,"w",encoding="utf-8") as f:
            # run_started_at ties the refusals to this run (see step-progress-writer.ps1).
            json.dump({"schema_version":1,"run_started_at":progress.get("run_started_at"),"refusals":refusals},f,ensure_ascii=False,separators=(",",":"))
        os.replace(refusal_tmp,refusal_path)
    elif os.path.exists(refusal_path):
        os.remove(refusal_path)
except OSError:
    pass
new_ones=sorted(valid - existing)
if new_ones:
    all_done=sorted(existing | valid)
    progress["completed_steps"]=all_done
    progress["current_step"]=next((n for n in range(1,total+1) if n not in all_done),total)
    print(f"newly completed: {new_ones}, total {len(all_done)}/{total}")
elif not aligned:
    # Cursor drift (harness-activity 'drift'): nothing new to record, but current_step is not the
    # first unfinished step, for example after a hand edit of progress.json. Put it back so the run
    # reads as active again; a paused run keeps its pause fields. A finished run keeps its cursor.
    # Mirrors step-progress-writer.ps1.
    progress["current_step"]=first
    print(f"current_step {cursor} -> {first} (cursor drift)")

progress["last_updated"]=datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

tmp=p_path+f".tmp.{os.getpid()}"
with open(tmp,"w",encoding="utf-8") as f:
    json.dump(progress,f,ensure_ascii=False,indent=2)
os.replace(tmp,p_path)
PY
}

# A paused run with nothing new to record: leave without a log line, a lock file or a write.
[ "$(writer_py probe 2>/dev/null | tr -d '\r')" = "idle" ] && exit 0
log "invoked"

# advisory file lock (best effort)
exec 9>"$LOCK_FILE" 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
  # Nothing is inspected on this Stop, so an older refusal must not be repeated as current.
  flock -w 5 9 || { log "flock timeout"; rm -f "$STEP_ARCHIVE/progress-refusals.json"; exit 0; }
fi

writer_py write
exit 0
