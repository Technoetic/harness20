import { resolveWorkflowProfile, getWorkflowProfile, LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';
// Pure rules of the Claude named pause (harness-rules 2-1). scripts/harness-pause.mjs is the only
// writer of paused and pause_* in step_archive/progress.json. The hooks cannot import this module
// directly, so they carry copies of isPaused, PAUSE_REASONS, NAMED_PAUSE and
// PAUSED_TEMPLATE; codex/tests/claude-named-pause.test.mjs keeps the copies equal to this file.
export const MODEL_PAUSE_REASONS = Object.freeze(['permission-denied', 'required-tool-failed', 'required-input-missing']);
export const PAUSE_REASONS = Object.freeze([...MODEL_PAUSE_REASONS, 'user-request']);
export const NOTE_MAX = 200;
export const HISTORY_MAX = 20;
// Written by applyPause, removed by applyResume.
export const PAUSE_KEYS = Object.freeze(['pause_reason', 'paused_step', 'paused_at', 'pause_note', 'pause_evidence']);
// paused_at as written by applyPause (Date#toISOString). Hooks print it only when it matches.
export const PAUSED_AT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/;

// The sentence the Stop hook and the SessionStart loader add to every continue instruction. Same
// string (not the same source bytes) as $namedPause in the .ps1 hooks and NAMED in the .sh hooks.
// The note is single-quoted, so $(...), backticks and $VAR in it stay text in bash and PowerShell.
export const NAMED_PAUSE = 'Early stop only as a named pause (permission-denied | required-tool-failed | required-input-missing; harness-rules 2-1): save evidence under step_archive/, run node "<plugin-root>/scripts/harness-pause.mjs" pause --workspace "<project-root>" --reason <code> --evidence <step_archive/file> --note \'<user action, no quotes>\', then end the turn with the pause report.';
// The one line the loader and the prompt guard print for a paused run. Free text (pause_note,
// pause_evidence) is never printed; the placeholders take validated values only.
export const PAUSED_TEMPLATE = '[HARNESS] PAUSED at step{STEP}/{TOTAL} (reason={REASON}{SINCE}). Automatic continuation is off: do not run steps. Tell the user why (pause_note in step_archive/progress.json) and handle their message. Resume only when the user explicitly asks: /harness-resume.';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Canonical judgement, shared with approval-policy, quality-gate and harness-activity
// classifyProgress: a paused key whose value is anything but boolean false, or status "paused".
export function isPaused(progress) {
  return plain(progress) && ((Object.hasOwn(progress, 'paused') && progress.paused !== false) || progress.status === 'paused');
}

// A progress.json the pause CLI may change: a known profile with its exact total, and
// completed_steps a distinct array of in-range integers.
export function validateProgress(progress) {
  try {
    const profile = resolveWorkflowProfile(progress);
    return Array.isArray(progress.completed_steps) && progress.completed_steps.every(step => Number.isInteger(step) && step >= 1 && step <= profile.stepCount) && new Set(progress.completed_steps).size === progress.completed_steps.length;
  } catch { return false; }
}

// First step of 1..total_steps that is not completed, or 0 when every step is.
export function firstUnfinished(progress) {
  const done = new Set(progress.completed_steps);
  for (let step = 1; step <= progress.total_steps; step += 1) if (!done.has(step)) return step;
  return 0;
}

export const reasonCode = value => (PAUSE_REASONS.includes(value) ? value : 'unknown');
// Where the run stopped: max(paused_step, first unfinished step) when paused_step is an integer
// inside 1..total_steps, else the first unfinished step. The pause is recorded mid-turn, before the
// Stop writer records the completion lines of that turn, so a stored paused_step can lag behind.
export function pausedStep(progress) {
  const step = progress.paused_step;
  const first = firstUnfinished(progress);
  return Number.isInteger(step) && step >= 1 && step <= progress.total_steps ? Math.max(step, first) : first;
}
const pausedAt = progress => (typeof progress.paused_at === 'string' && PAUSED_AT.test(progress.paused_at) ? progress.paused_at : null);

// The PAUSED line the hooks print for this progress (reference implementation for the tests).
export function pausedLine(progress) {
  const since = pausedAt(progress);
  return PAUSED_TEMPLATE
    .replace('{STEP}', () => String(pausedStep(progress)).padStart(3, '0'))
    .replace('{TOTAL}', () => String(progress.total_steps))
    .replace('{REASON}', () => reasonCode(progress.pause_reason))
    .replace('{SINCE}', () => (since ? `, since ${since}` : ''));
}

// Marks the run paused. Other keys are kept; an already paused run is left unchanged.
export function applyPause(progress, { reason, note, evidence = null, now = new Date() }) {
  if (isPaused(progress)) return { changed: false, next: progress };
  return {
    changed: true,
    next: {
      ...progress,
      paused: true,
      pause_reason: reason,
      paused_step: firstUnfinished(progress),
      paused_at: now.toISOString(),
      pause_note: note,
      pause_evidence: evidence ?? null
    }
  };
}

// Clears the pause, keeps the last HISTORY_MAX pauses in pause_history, and turns a legacy
// status "paused" back into "running". A run that is not paused is left unchanged.
export function applyResume(progress, { now = new Date() } = {}) {
  if (!isPaused(progress)) return { changed: false, next: progress, resumedFrom: null };
  const resumedFrom = {
    reason: reasonCode(progress.pause_reason),
    step: pausedStep(progress) || null,
    paused_at: pausedAt(progress),
    resumed_at: now.toISOString(),
    evidence: typeof progress.pause_evidence === 'string' ? progress.pause_evidence : null
  };
  const history = Array.isArray(progress.pause_history) ? progress.pause_history : [];
  const next = { ...progress, paused: false, pause_history: [...history, resumedFrom].slice(-HISTORY_MAX) };
  for (const key of PAUSE_KEYS) delete next[key];
  if (next.status === 'paused') next.status = 'running';
  return { changed: true, next, resumedFrom };
}

// What `reset` writes: the /webapp bootstrap template with no completed step, a new run boundary
// (run_started_at, UTC) and a user-request pause, so the Stop hooks neither continue the old topic
// nor count its completion lines again. '/webapp <topic>' then starts a new topic (no completed
// step) and '/harness-resume' runs the kept topic from step 1.
export const RESET_TOTAL = 50;
export const RESET_NOTE = '리셋 후 대기 — /webapp <주제>로 새 실행, /harness-resume으로 현재 주제를 1단계부터';
export function resetProgress({ now = new Date(), workflowProfile = LEGACY_WORKFLOW_PROFILE } = {}) {
  const fresh = {
    current_step: 1,
    completed_steps: [],
    skipped_steps: [],
    failed_steps: [],
    ...(workflowProfile === LEGACY_WORKFLOW_PROFILE ? {} : { schema_version: 2, workflow_profile: workflowProfile }),
    total_steps: getWorkflowProfile(workflowProfile).stepCount,
    metrics: { total_duration_minutes: 0, total_sessions: 0, steps_per_session_avg: 0 },
    session_history: [],
    run_started_at: now.toISOString()
  };
  return applyPause(fresh, { reason: 'user-request', note: RESET_NOTE, now }).next;
}

// Position and pause state of a validated progress.json.
export function summary(progress) {
  const paused = isPaused(progress);
  const done = new Set(progress.completed_steps.filter(step => step >= 1 && step <= progress.total_steps));
  return {
    paused,
    reason: paused ? reasonCode(progress.pause_reason) : null,
    paused_step: paused ? pausedStep(progress) || null : null,
    next_step: firstUnfinished(progress) || null,
    completed: done.size,
    total: progress.total_steps
  };
}

// What `status` adds: the recorded time, note and evidence path of the current pause.
export function pauseDetails(progress) {
  const paused = isPaused(progress);
  const note = progress.pause_note;
  return {
    paused_at: paused ? pausedAt(progress) : null,
    note: paused && typeof note === 'string' && note.length <= NOTE_MAX && !/[\x00-\x1f\x7f\u2028\u2029]/.test(note) ? note : null,
    evidence: paused && typeof progress.pause_evidence === 'string' ? progress.pause_evidence : null
  };
}
