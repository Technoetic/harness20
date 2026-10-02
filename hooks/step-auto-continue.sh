#!/usr/bin/env bash
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) exit 0 ;; esac
command -v python3 >/dev/null 2>&1 || exit 0
export RAW_STDIN="$(cat || true)"
export H50_PROFILE_HELPER="$(dirname "${BASH_SOURCE[0]}")/lib/workflow-profile.mjs"
if command -v cygpath >/dev/null 2>&1; then H50_PROFILE_HELPER="$(cygpath -m "$H50_PROFILE_HELPER")"; export H50_PROFILE_HELPER; fi
python3 - <<'PY_STOP'
import json, os, re, subprocess
# The only early stop (harness-rules 2-1). Same string as $namedPause in step-auto-continue.ps1
# (Python triple quotes keep the inner single quotes).
NAMED='''Early stop only as a named pause (permission-denied | required-tool-failed | required-input-missing; harness-rules 2-1): save evidence under step_archive/, run node "<plugin-root>/scripts/harness-pause.mjs" pause --workspace "<project-root>" --reason <code> --evidence <step_archive/file> --note '<user action, no quotes>', then end the turn with the pause report.'''
try:
    event=json.loads(os.environ.get('RAW_STDIN') or '{}')
    root=os.environ.get('CLAUDE_PROJECT_DIR') or event.get('cwd') or os.getcwd()
    archive=os.path.join(root,'step_archive')
    # Codex coexistence (mirrors step-auto-continue.ps1): the Codex state manager owns
    # continuation when its state exists. Exit before any read or write.
    if os.path.exists(os.path.join(archive,'.harness50-codex','state.json')): raise SystemExit(0)
    resolved=subprocess.run(['node',os.environ['H50_PROFILE_HELPER'],'resolve',root],capture_output=True,text=True)
    if resolved.returncode: raise SystemExit(0)
    profile=json.loads(resolved.stdout)
    with open(os.path.join(archive,'progress.json'),encoding='utf-8-sig') as f: p=json.load(f)
    # Named pause, same judgement as scripts/lib/pause-state.mjs isPaused: nothing is printed.
    if ('paused' in p and p['paused'] is not False) or p.get('status')=='paused': raise SystemExit(0)
    total=int(p['total_steps'])
    if not 1<=total<=999: raise SystemExit(0)
    done=sorted(set(p.get('completed_steps') or []))
    current=next((n for n in range(1,total+1) if n not in done),0)
    if not current: raise SystemExit(0)
    session=re.sub('[^a-zA-Z0-9-]','',str(event.get('session_id') or ''))
    state=os.path.join(archive,'step-auto-continue'+('.'+session if session else '')+'.state')
    signature='completed='+str(len(done))+';current='+str(current)
    stall=0
    try:
        with open(state,encoding='utf-8-sig') as f: previous=f.read().strip()
        old,count=previous.rsplit('|stall=',1)
        if event.get('stop_hook_active') is True and old==signature: stall=int(count)+1
    except (OSError,ValueError): pass
    tmp=state+'.tmp.'+str(os.getpid())
    with open(tmp,'w',encoding='utf-8') as f: f.write(signature+'|stall='+str(min(stall,3)))
    os.replace(tmp,state)
    if stall>=3: raise SystemExit(0)
    step=f'step{current:03d}.md'
    relative=profile['step_body']
    if not relative: raise SystemExit(0)
    # A completion the writer refused (step_archive/progress-refusals.json): name the lowest one still
    # open, so the model knows why the step it reported is asked for again. Mirrors the .ps1.
    note=''
    try:
        with open(os.path.join(archive,'progress-refusals.json'),encoding='utf-8-sig') as f: data=json.load(f)
        def token(v):
            v=str(v or '')
            return v if re.fullmatch('[A-Za-z][A-Za-z_-]{0,19}',v) else 'unknown'
        # A file left by an earlier run of this workspace (another run_started_at) is ignored.
        same_run=isinstance(data,dict) and data.get('run_started_at')==p.get('run_started_at')
        open_ones=sorted((r for r in (data.get('refusals') or []) if same_run and isinstance(r,dict) and type(r.get('step')) is int and 1<=r['step']<=total and r['step'] not in done),key=lambda r:r['step'])
        if open_ones:
            r=open_ones[0]
            detail=re.sub('[\x00-\x1f]',' ',str(r.get('detail') or '')).strip()
            if len(detail)>160: detail=detail[:157]+'...'
            because=f' ({detail})' if detail else ''
            n=f"{r['step']:03d}"
            note={
                'qa':f"Step {n} was reported complete but not recorded: QA evidence status={token(r.get('status'))} verdict={token(r.get('verdict'))}. Inspect, snapshot, rerun and record its QA report (docs/QA-REPORTS.md) before reporting it again.",
                'quality':f"Step {n} was reported complete but not recorded: measured quality verdict={token(r.get('verdict'))}{because}. Run node \"<plugin-root>/scripts/quality-gate.mjs\" --workspace \"<project-root>\" and repair failed checks (docs/QUALITY.md) before reporting it again.",
                'final':f"Step {n} was reported complete but not recorded: final evidence verdict={token(r.get('verdict'))}{because}. Complete the final quality, browser routing and regression evidence (docs/QA-REPORTS.md) before reporting it again.",
            }.get(r.get('gate'),'')
    except (OSError,ValueError,AttributeError,TypeError): note=''
    print(json.dumps({'decision':'block','reason':f'[HARNESS] {len(done)}/{total} done. Read and execute {relative}, report completion, then continue. {NAMED} User direct requests take priority.'+(' '+note if note else '')}))
except (OSError,ValueError,KeyError,TypeError): pass
PY_STOP
exit 0
