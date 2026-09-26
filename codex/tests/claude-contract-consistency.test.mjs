// The files the model reads (generated SPECs, the harness-rules constitution, the slash commands,
// the README and the hook output) must agree with the code that enforces them. The static checks
// run on every OS in well under a second; the dynamic ones run the native hook variant, and one
// variant-parity check runs both variants where Windows has Git Bash and python.
//
// Why a separate RETIRED rule: codex/scripts/validate-steps.mjs STALE_STEP only catches a number
// written after "step" (step104). It misses "49/69/104", "step049 / 069 / 104" and
// '"step": 104', it only runs on the Codex step files, and its MODEL/TOOL rules do not apply to
// Claude files. Step bodies are scanned by S1 for retired numbers; their failure contract lives in
// claude-step-contract.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PROJECT_NAMES, gitBash, installPlugin, repo, runClaudeHook, tempRoot, testEachName, windows } from './helpers/claude-hooks.mjs';

// Step numbers of the retired 107-step layout (69, 81, 84, 104, 107), as standalone tokens.
const RETIRED = /(?<![\w.#\\-])(?:0?69|0?81|0?84|104|107)(?![\w%.])/;

// scripts/quality-gate.mjs is the single source of the milestones; S2 rebuilds this line from it.
const milestoneLine = (r1, r2, r3) =>
  `- 품질 마일스톤(scripts/quality-gate.mjs): 완료 ${r1}단계 → trust5_r1, 완료 ${r2}단계 → trust5_r2, ` +
  `완료 ${r3}단계 이후(최종 Step 050) → trust5_r3. Stop 훅(trust5-validator)이 step_archive/outputs/trust5_rN.md에 ` +
  'Verdict(PASS/FAIL/INCOMPLETE)를 기록하고, PASS가 아니면 복구를 요구한다.';
const MILESTONE_LINE = '- 품질 마일스톤(scripts/quality-gate.mjs): 완료 38단계 → trust5_r1, 완료 44단계 → trust5_r2, 완료 49단계 이후(최종 Step 050) → trust5_r3. Stop 훅(trust5-validator)이 step_archive/outputs/trust5_rN.md에 Verdict(PASS/FAIL/INCOMPLETE)를 기록하고, PASS가 아니면 복구를 요구한다.';
const RESULT_PATH_RULE = '본문 절차가 지정한 경로 (머리말 Sync 줄과 다르면 본문 절차를 따른다)';

const text = file => readFileSync(join(repo, file), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

// Repository-relative paths below dir whose file name matches, sorted.
function listFiles(dir, name, { recursive = false } = {}) {
  const found = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (recursive && entry.name !== 'node_modules') walk(full);
      } else if (entry.isFile() && name.test(entry.name)) {
        found.push(relative(repo, full).replaceAll('\\', '/'));
      }
    }
  };
  if (existsSync(join(repo, dir))) walk(join(repo, dir));
  return found.sort();
}

// Lines that start with # or // after trimming are comments (historic mentions stay allowed).
// This also skips Markdown headings inside heredocs and here-strings; D2 covers generated SPECs.
const isComment = line => /^\s*(?:#|\/\/)/.test(line);

function retiredHits(files, { skipComments }) {
  const hits = [];
  for (const file of files) {
    text(file).split('\n').forEach((line, index) => {
      if (skipComments && isComment(line)) return;
      if (RETIRED.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

// The ACCEPTANCE section of a generated SPEC, up to the next ## heading.
function acceptance(spec) {
  const match = /^## ACCEPTANCE[^\n]*\n([\s\S]*?)(?=^## )/m.exec(spec.replace(/\r\n/g, '\n'));
  assert.ok(match, `no ACCEPTANCE section in:\n${spec}`);
  return match[1];
}

// ---------------------------------------------------------------------------------------------
// Static checks

test('S0 the RETIRED rule matches retired step numbers and nothing else', () => {
  for (const sample of ['평가 라운드(49/69/104)', 'step049 / 069 / 104', 'step001~107', '"step": 104', 'r2 = @{ step = 69;']) {
    assert.match(sample, RETIRED, sample);
  }
  for (const sample of ['1048576', '#69a', '0.84', '84%', '⁩', '\\u2069', 'step049', 'Step 050/50 완료']) {
    assert.doesNotMatch(sample, RETIRED, sample);
  }
});

test('S1 no retired step number in the skills, commands, agents, step bodies or non-comment hook and script lines', () => {
  const claudeSteps = listFiles('assets/steps', /^step\d{3}\.md$/);
  const codexSteps = listFiles('codex/assets/steps', /^step\d{3}\.md$/);
  assert.equal(claudeSteps.length, 50, 'assets/steps body count');
  assert.equal(codexSteps.length, 50, 'codex/assets/steps body count');
  const documents = [
    ...listFiles('skills', /^SKILL\.md$/, { recursive: true }),
    ...listFiles('commands', /\.md$/),
    ...listFiles('agents', /\.md$/),
    ...listFiles('codex/skills', /^SKILL\.md$/, { recursive: true }),
    ...claudeSteps,
    ...codexSteps
  ];
  const code = [
    ...listFiles('hooks', /\.(?:ps1|sh)$/),
    ...listFiles('hooks/lib', /\.mjs$/),
    ...listFiles('scripts', /\.mjs$/, { recursive: true }),
    ...listFiles('codex/hooks', /\.mjs$/, { recursive: true })
  ];
  // A scan that finds no files would pass for the wrong reason.
  assert.ok(documents.includes('skills/harness-rules/SKILL.md') && documents.includes('commands/harness-reset.md'), documents.join(', '));
  assert.ok(code.includes('hooks/spec-generator.ps1') && code.includes('hooks/spec-generator.sh') && code.includes('scripts/quality-gate.mjs'), code.join(', '));
  const hits = [...retiredHits(documents, { skipComments: false }), ...retiredHits(code, { skipComments: true })];
  assert.deepEqual(hits, [], `retired step numbers:\n${hits.join('\n')}`);
});

test('S2 the SPEC milestone line matches the quality-gate thresholds and names the body result path', () => {
  const gate = text('scripts/quality-gate.mjs');
  const first = /done\.length < (\d+)\) return;/.exec(gate);
  const later = /done\.length >= (\d+) \? 'r3' : done\.length >= (\d+) \? 'r2'/.exec(gate);
  assert.ok(first && later, 'milestone thresholds not found in scripts/quality-gate.mjs');
  const [r1, r2, r3] = [first[1], later[2], later[1]].map(Number);
  assert.deepEqual([r1, r2, r3], [38, 44, 49]);
  assert.equal(milestoneLine(r1, r2, r3), MILESTONE_LINE);
  for (const file of ['hooks/spec-generator.sh', 'hooks/spec-generator.ps1']) {
    const source = text(file);
    assert.ok(source.includes(MILESTONE_LINE), `${file} lacks the milestone line`);
    assert.ok(source.includes(RESULT_PATH_RULE), `${file} lacks the result path rule`);
    assert.doesNotMatch(source, /step_archive\/step(?:\{num\}|\$\{stepNum\})_\*\.md/, file);
  }
});

test('S3 the dead eval_rounds and trust5_results fields are gone from templates, migrations and the writer', () => {
  for (const file of [
    'hooks/webapp-trigger.sh', 'hooks/webapp-trigger.ps1',
    'hooks/step-progress-loader.sh', 'hooks/step-progress-loader.ps1',
    'hooks/step-progress-writer.sh', 'hooks/step-progress-writer.ps1',
    'commands/harness-reset.md'
  ]) {
    assert.doesNotMatch(text(file), /eval_rounds|trust5_results/, file);
  }
  assert.ok(!text('hooks/step-progress-writer.ps1').includes('총점'), 'writer.ps1 still parses a 50-point total');
});

test('S4 /harness-status reports Verdict lines, never scores, and the README drops the score table', () => {
  const status = text('commands/harness-status.md');
  assert.match(status, /Verdict:/);
  assert.match(status, /PASS[^\n]*FAIL[^\n]*INCOMPLETE/);
  assert.doesNotMatch(status, /\b[A-Z]{2}\/50\b|점\s*만점/);
  assert.ok(text('scripts/quality-gate.mjs').includes('Verdict: ${report.verdict}'), 'quality-gate.mjs no longer writes Verdict:');
  assert.doesNotMatch(text('README.md'), /50점 만점|\[VIOLATION DETECTED\]/);
});

test('S5 every backticked [TAG] quoted in the rules, commands and README exists in a hook', () => {
  const sources = [
    ...listFiles('hooks', /\.(?:ps1|sh)$/),
    ...listFiles('hooks/lib', /\.mjs$/)
  ].map(text).join('\n');
  const quoted = [];
  for (const file of ['skills/harness-rules/SKILL.md', ...listFiles('commands', /\.md$/), 'README.md']) {
    for (const [, tag] of text(file).matchAll(/`(\[[A-Z][A-Z0-9 _-]+\])/g)) quoted.push([file, tag]);
  }
  assert.ok(quoted.length > 0, 'no quoted tag found; the scan would pass for the wrong reason');
  const missing = quoted.filter(([, tag]) => !sources.includes(tag)).map(([file, tag]) => `${file}: ${tag}`);
  assert.deepEqual(missing, []);
});

test('S6 both prompt guards put user direct requests first, and the rules cover step001~050', () => {
  for (const file of ['hooks/step-obedience-guard.ps1', 'hooks/step-obedience-guard.sh']) {
    const source = text(file);
    assert.ok(source.includes('User direct requests still take priority.'), file);
    assert.doesNotMatch(source, /takes precedence over user requests|queued item to address AFTER/i, file);
  }
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text('skills/harness-rules/SKILL.md'));
  assert.ok(frontmatter, 'harness-rules has no frontmatter');
  assert.match(frontmatter[1], /step001~050/);
});

// ---------------------------------------------------------------------------------------------
// Dynamic checks (native variant: PowerShell on Windows, bash elsewhere)

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const pad = step => String(step).padStart(3, '0');
const readJson = file => JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));

function setup(t, prefix) {
  const base = tempRoot(t, prefix);
  return { base, plugin: installPlugin(base) };
}

function project(base, name) {
  const root = join(base, name);
  const archive = join(root, 'step_archive');
  mkdirSync(join(archive, 'archived'), { recursive: true });
  return { root, archive, progressFile: join(archive, 'progress.json') };
}

function writeStepBody(archive, step) {
  writeFileSync(join(archive, 'archived', `step${pad(step)}.md`), '# 제목\n\n## 실행 내용\n본문\n');
}

// Steps 38, 44 and 50 have bodies; 1..49 are complete and step 50 is current.
function specFixture(base, name) {
  const p = project(base, name);
  for (const step of [38, 44, 50]) writeStepBody(p.archive, step);
  writeFileSync(p.progressFile, JSON.stringify({ total_steps: 50, current_step: 50, completed_steps: range(1, 49), failed_steps: [] }));
  return p;
}

const stopEvent = (root, extra = {}) => ({ hook_event_name: 'Stop', session_id: 'contract', stop_hook_active: false, cwd: root, ...extra });

testEachName('D1 webapp-trigger bootstraps /webapp without eval_rounds or trust5_results', (t, name) => {
  const { base, plugin } = setup(t, 'h50-contract-trigger-');
  const root = join(base, name);
  mkdirSync(root);
  const result = runClaudeHook(plugin, 'webapp-trigger', { hook_event_name: 'UserPromptSubmit', prompt: '/webapp fractions', cwd: root }, { cwd: base });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /WEBAPP TUTORIAL TRIGGER DETECTED/);
  assert.doesNotMatch(result.stdout, RETIRED);
  assert.ok(existsSync(join(root, 'step_archive', 'TOPIC', 'TOPIC.md')), 'TOPIC.md was not written');
  const progress = readJson(join(root, 'step_archive', 'progress.json'));
  assert.equal(progress.current_step, 1);
  assert.equal(progress.total_steps, 50);
  assert.equal(Object.hasOwn(progress, 'eval_rounds'), false);
  assert.equal(Object.hasOwn(progress, 'trust5_results'), false);
});

testEachName('D2 spec-generator writes the measured milestones and the body result path into ACCEPTANCE', (t, name) => {
  const { base, plugin } = setup(t, 'h50-contract-spec-');
  const p = specFixture(base, name);
  const result = runClaudeHook(plugin, 'spec-generator', stopEvent(p.root), { cwd: base });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  for (const step of [38, 44, 50]) {
    const file = join(p.archive, 'specs', `SPEC-${pad(step)}.md`);
    assert.ok(existsSync(file), `SPEC-${pad(step)}.md was not written`);
    const section = acceptance(readFileSync(file, 'utf8'));
    assert.ok(section.includes(MILESTONE_LINE), section);
    assert.ok(section.includes('본문 절차가 지정한 경로'), section);
    assert.doesNotMatch(section, RETIRED);
    assert.doesNotMatch(section, /step_archive\/step\d{3}_\*\.md/);
  }
});

testEachName('D3 step-progress-writer records a completion without adding or changing trust5 fields', (t, name) => {
  const { base, plugin } = setup(t, 'h50-contract-writer-');
  const legacy = {
    trust5_results: { r1: null, r2: null, r3: null },
    eval_rounds: {
      r1: { step: 49, result: null, score: null },
      r2: { step: 69, result: null, score: null },
      r3: { step: 104, result: null, score: null }
    }
  };
  const fixtures = { fresh: project(base, name), legacy: project(base, `${name} legacy`) };
  for (const [kind, p] of Object.entries(fixtures)) {
    writeStepBody(p.archive, 38);
    mkdirSync(join(p.archive, 'outputs'));
    writeFileSync(join(p.archive, 'outputs', 'trust5_r1.md'), '# TRUST5 measured quality - r1\n\nVerdict: PASS\n');
    writeFileSync(p.progressFile, JSON.stringify({
      last_updated: '', total_steps: 50, current_step: 38, completed_steps: range(1, 37), failed_steps: [],
      metrics: { total_sessions: 1 }, session_history: [], ...(kind === 'legacy' ? legacy : {})
    }));
  }
  for (const [kind, p] of Object.entries(fixtures)) {
    // The PowerShell writer shares the machine-wide Global\step-progress-writer-mutex with other
    // test files and silently skips its write when it cannot take it within 5 s. The completion
    // scan is idempotent, so rerun it (bounded) until step 38 lands; only then do the trust5
    // assertions below mean anything.
    let progress;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = runClaudeHook(plugin, 'step-progress-writer', stopEvent(p.root, { last_assistant_message: 'Step 038/50 완료' }), { cwd: base });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      progress = readJson(p.progressFile);
      if (progress.completed_steps?.includes(38)) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 * attempt);
    }
    assert.deepEqual(progress.completed_steps, range(1, 38), kind);
    if (kind === 'fresh') {
      assert.equal(Object.hasOwn(progress, 'trust5_results'), false);
      assert.equal(Object.hasOwn(progress, 'eval_rounds'), false);
    } else {
      // Existing fields are left exactly as they were: no migration, no parsing.
      assert.deepEqual(progress.trust5_results, legacy.trust5_results);
      assert.deepEqual(progress.eval_rounds, legacy.eval_rounds);
    }
  }
});

// Both variants on one host. PowerShell runs natively; the .sh variant runs through Git Bash
// pretending to be Linux, which takes about 40 s per call, so this is the only .sh call here. The
// prompt guards are compared statically in S6 instead of by another emulated run.
const python = windows && gitBash && spawnSync('python', ['--version'], { encoding: 'utf8' }).status === 0;
test('D4 spec-generator .ps1 and .sh write the same ACCEPTANCE bullets', {
  skip: python ? false : 'needs Windows with Git Bash and python',
  timeout: 300000
}, t => {
  const bullets = variant => {
    const { base, plugin } = setup(t, `h50-contract-parity-${variant}-`);
    const p = specFixture(base, PROJECT_NAMES[1]);
    const result = runClaudeHook(plugin, 'spec-generator', stopEvent(p.root), { variant, cwd: base });
    assert.equal(result.status, 0, result.stderr);
    const file = join(p.archive, 'specs', 'SPEC-038.md');
    assert.ok(existsSync(file), `${variant}: SPEC-038.md was not written`);
    return acceptance(readFileSync(file, 'utf8')).split('\n').filter(line => line.startsWith('- '));
  };
  const ps1 = bullets('ps1');
  assert.equal(ps1.length, 3, ps1.join('\n'));
  assert.deepEqual(bullets('sh'), ps1);
});
