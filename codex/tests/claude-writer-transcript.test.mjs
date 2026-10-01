// The progress writer also finds completion reports in the session transcript (transcript_path), not
// only in last_assistant_message. It streams the transcript and parses only the lines that can change
// the steps it finds: 완료 (its second syllable as 료 or as the JSON escape \ub8cc, either hex case)
// and code fences, whose state runs across text blocks. The steps found are the same as when every
// line was parsed. The 2.11.0 writer parsed every line and kept every assistant text; a 4.6 MiB
// transcript then took 29 s in Windows PowerShell 5.1, past the writer's 28 s budget in
// run-hook.mjs, and the completions of a long session were never recorded.
//
// T1-T4, T6 and T8-T10 run the writer script directly with the native variant (PowerShell on
// Windows, bash elsewhere; the .sh through Git Bash with H50_TEST_BASH=1). T5 and T7 dispatch it
// through run-hook.mjs as the host does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_NAMES, installPlugin, runClaudeHook, runDispatcher, tempRoot, testEachName } from './helpers/claude-hooks.mjs';

const BOM = String.fromCharCode(0xfeff);
const MIB = 1024 * 1024;
const pad = step => String(step).padStart(3, '0');
// What lets a line through the writer's filter: the second syllable of 완료 in any spelling, or a
// code fence.
const FILTER_TOKEN = /료|\\u[bB]8[cC][cC]|```|~~~/;

// A 50-step run with step 1 done and the cursor on step 2, step bodies 1..9 and an installed plugin
// copy. The transcript lives outside the project in a folder with the project's name, so its path
// has the same brackets and Korean characters.
function setup(t, name, state = {}) {
  const base = tempRoot(t, 'h50-transcript-');
  const plugin = installPlugin(base);
  const project = join(base, name);
  const archive = join(project, 'step_archive');
  mkdirSync(join(archive, 'archived'), { recursive: true });
  for (let step = 1; step <= 9; step += 1) writeFileSync(join(archive, 'archived', `step${pad(step)}.md`), `# Step ${step}\n## Task\n`);
  const progressFile = join(archive, 'progress.json');
  writeFileSync(progressFile, JSON.stringify({
    last_updated: '', total_steps: 50, current_step: 2, completed_steps: [1], failed_steps: [],
    metrics: { total_sessions: 1 }, session_history: [], ...state
  }));
  const sessions = join(base, 'sessions', name);
  mkdirSync(sessions, { recursive: true });
  return {
    base, plugin, project,
    transcript: join(sessions, 'session.jsonl'),
    read: () => JSON.parse(readFileSync(progressFile, 'utf8').replace(BOM, ''))
  };
}

// A Stop event without last_assistant_message: the transcript is the only source of a report.
const stopEvent = f => ({ hook_event_name: 'Stop', session_id: 'transcript', stop_hook_active: false, cwd: f.project, transcript_path: f.transcript });

// One assistant entry as Claude Code writes it (envelope, text blocks, ISO UTC timestamp), without
// its line terminator. An array gives one text block per item. JSON.stringify keeps 완료 as text.
function assistantEntry(text, { index = 0, timestamp = '2026-10-01T09:00:00.000Z' } = {}) {
  return JSON.stringify({
    parentUuid: index > 0 ? `uuid-${index - 1}` : null, isSidechain: false, userType: 'external', cwd: '/work/project',
    sessionId: 'transcript', version: '2.1.0', gitBranch: 'main',
    message: {
      id: `msg_${index}`, type: 'message', role: 'assistant', model: 'claude-fixture',
      content: [text].flat().map(part => ({ type: 'text', text: part })),
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 4, cache_read_input_tokens: 48000 + index, output_tokens: 180, service_tier: 'standard' }
    },
    requestId: `req_${index}`, type: 'assistant', uuid: `uuid-${index}`, timestamp
  });
}

// The same entry with 완료 written as a JSON escape, as an ASCII-only serializer stores it. The line
// must decode to the same entry and hold no literal 완료, or the test would not reach the escape.
function escapedEntry(text, escape, options) {
  const plain = assistantEntry(text, options);
  const line = plain.replace('완료', escape);
  assert.ok(!line.includes('완료'), line);
  assert.deepEqual(JSON.parse(line), JSON.parse(plain));
  return line;
}

const jsonl = (lines, eol = '\n') => lines.map(line => `${line}${eol}`).join('');

// The writer always rewrites progress.json (last_updated) once it holds its lock.
const written = progress => progress.last_updated !== '';

// The PowerShell writer skips its write when another test file holds the machine-wide
// Global\step-progress-writer-mutex for 5 s. The scan is idempotent, so rerun it (bounded) until
// done() holds. Returns the progress read after the last run.
function writeUntil(f, run, done) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    run();
    if (done(f.read())) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt);
  }
  return f.read();
}

// The writer script itself, without the dispatcher and its activity gate.
function runWriter(f) {
  const result = runClaudeHook(f.plugin, 'step-progress-writer', stopEvent(f), { cwd: f.base });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.trim(), '');
}

testEachName('T1 a completion reported only in a transcript entry is recorded', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    assistantEntry('요구 사항을 먼저 읽겠습니다.', { index: 1 }),
    // A user entry that quotes a report is no report, although its line passes the filter.
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Step 003/50 완료' }, timestamp: '2026-10-01T09:00:00.000Z' }),
    assistantEntry('Step 002/50 완료', { index: 2 }),
    assistantEntry('다음 단계를 준비합니다.', { index: 3 })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2]);
  assert.equal(after.current_step, 3);
});

testEachName('T2 a completion whose 완료 is a JSON escape in either hex case is recorded', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    assistantEntry('요구 사항을 먼저 읽겠습니다.', { index: 1 }),
    escapedEntry('Step 002/50 완료', '\\uc644\\ub8cc', { index: 2 }),
    escapedEntry('Step 003/50 완료', '\\uC644\\uB8CC', { index: 3 })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2, 3]);
  assert.equal(after.current_step, 4);
});

testEachName('T3 a transcript with CRLF line endings is read', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    assistantEntry('요구 사항을 먼저 읽겠습니다.', { index: 1 }),
    assistantEntry('Step 002/50 완료', { index: 2 }),
    assistantEntry('테스트를 실행합니다.', { index: 3 }),
    // The last line, CRLF-terminated as well.
    assistantEntry('Step 003/50 완료', { index: 4 })
  ], '\r\n'));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2, 3]);
  assert.equal(after.current_step, 4);
});

testEachName('T4 run_started_at still bounds the transcript: a report before it is ignored, one after it is recorded', (t, name) => {
  const runStartedAt = '2026-10-01T09:00:00.000Z';
  const f = setup(t, name, { run_started_at: runStartedAt });
  writeFileSync(f.transcript, jsonl([
    // The earlier run of this workspace, in the same session. Both lines pass the filter.
    assistantEntry('Step 003/50 완료', { index: 1, timestamp: '2026-10-01T08:30:00Z' }),
    escapedEntry('Step 004/50 완료', '\\uc644\\ub8cc', { index: 2, timestamp: '2026-10-01T08:59:59.999Z' }),
    // This run.
    assistantEntry('Step 002/50 완료', { index: 3, timestamp: '2026-10-01T09:00:00.001Z' })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2]);
  assert.equal(after.current_step, 3);
  assert.equal(after.run_started_at, runStartedAt);
});

testEachName('T6 a transcript that another process holds open for appending is still read', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([assistantEntry('Step 002/50 완료', { index: 1 })]));
  // The host may still hold the transcript open for appending when Stop runs. A read that did not
  // share write access failed on Windows, and the error hid the report.
  const appender = openSync(f.transcript, 'a');
  try {
    const after = writeUntil(f, () => runWriter(f), written);
    assert.deepEqual(after.completed_steps, [1, 2]);
    assert.equal(after.current_step, 3);
  } finally {
    closeSync(appender);
  }
});

// T8-T9: a code fence (``` or ~~~) turns the fence state on or off, and the state runs across text
// blocks: a report inside a fence is a quoted example, not a completion. A text block without 완료
// can still open or close a fence, so its line must pass the filter.
testEachName('T8 a fence closed in a text block without 완료 does not hide the next report', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    assistantEntry(['Step 002/50 완료', '확인 명령은 다음과 같습니다.\n```bash'], { index: 1 }),
    assistantEntry(['npm test\n```', 'The checks passed.'], { index: 2 }),
    assistantEntry('Step 003/50 완료', { index: 3 })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2, 3]);
  assert.equal(after.current_step, 4);
});

testEachName('T9 a report quoted inside a fence that a text block without 완료 opened is not recorded', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    assistantEntry('The report line looks like this:\n~~~', { index: 1 }),
    assistantEntry('Step 002/50 완료\n~~~', { index: 2 }),
    assistantEntry('The checks come next.', { index: 3 })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1]);
  assert.equal(after.current_step, 2);
});

testEachName('T10 a completion whose 완료 is half escaped is recorded', (t, name) => {
  const f = setup(t, name);
  writeFileSync(f.transcript, jsonl([
    escapedEntry('Step 002/50 완료', '\\uc644료', { index: 1 }),
    escapedEntry('Step 003/50 완료', '완\\uB8CC', { index: 2 })
  ]));
  const after = writeUntil(f, () => runWriter(f), written);
  assert.deepEqual(after.completed_steps, [1, 2, 3]);
  assert.equal(after.current_step, 4);
});

// T7: lines that pass the filter but hold no report. Every filler entry mentions 완료 inside a
// sentence, in twenty text blocks, so each line is parsed and every block is kept; the texts must be
// joined once (repeated concatenation grew with the square of the 20,000 blocks).
test('T7 thousands of text blocks that mention 완료 are joined within the writer budget', { timeout: 300000 }, t => {
  const f = setup(t, PROJECT_NAMES[0]);
  const BLOCK = '모듈 하나의 검증을 완료하고 다음 모듈로 넘어갑니다. ';
  const lines = [];
  for (let index = 0; index < 1000; index += 1) {
    lines.push(assistantEntry(Array(20).fill(BLOCK), {
      index, timestamp: new Date(Date.UTC(2026, 9, 1, 8, 0, 0) + index * 1000).toISOString()
    }));
  }
  writeFileSync(f.transcript, jsonl([...lines, assistantEntry('Step 002/50 완료', { index: lines.length })]));
  const after = writeUntil(f, () => {
    const result = runDispatcher(f.plugin, 'step-progress-writer', stopEvent(f), {
      cwd: f.base, env: { CLAUDE_PROJECT_DIR: f.project }, timeoutMs: 120000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  }, written);
  assert.deepEqual(after.completed_steps, [1, 2]);
  assert.equal(after.current_step, 3);
});

// Filler for T5: assistant entries of about 2 KiB, each an answer in ten text blocks (a message may
// hold any number), with Korean text but no 완료 in any spelling. The 2.11.0 writer parsed every line
// and joined every text block into one string; on this input it took about a minute in Windows
// PowerShell 5.1 (measured 2026-10-01), past its 28 s budget.
const NOTE = '변경된 파일을 확인하고 다음 모듈을 읽습니다. The build log shows no new warnings, so the remaining modules come next. ';
const fillerEntry = index => assistantEntry(Array(10).fill(NOTE), {
  index, timestamp: new Date(Date.UTC(2026, 9, 1, 8, 0, 0) + index * 1000).toISOString()
});

test('T5 a 6 MiB transcript dispatched through run-hook.mjs is read within the writer budget', { timeout: 300000 }, t => {
  const f = setup(t, PROJECT_NAMES[0]);
  const lines = [];
  for (let index = 0, bytes = 0; bytes < 6 * MIB; index += 1) {
    lines.push(fillerEntry(index));
    bytes += Buffer.byteLength(lines.at(-1)) + 1;
  }
  const filler = jsonl(lines);
  assert.doesNotMatch(filler, FILTER_TOKEN, 'the filler must not pass the line filter');
  writeFileSync(f.transcript, filler + jsonl([assistantEntry('Step 002/50 완료', { index: lines.length })]));
  assert.ok(statSync(f.transcript).size > 6 * MIB);
  // run-hook.mjs stops the writer at its 28 s budget with exit 1 and a line on stderr, so exit 0
  // with an empty stderr means the writer finished inside the budget.
  const after = writeUntil(f, () => {
    const result = runDispatcher(f.plugin, 'step-progress-writer', stopEvent(f), {
      cwd: f.base, env: { CLAUDE_PROJECT_DIR: f.project }, timeoutMs: 120000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  }, written);
  assert.deepEqual(after.completed_steps, [1, 2]);
  assert.equal(after.current_step, 3);
});
