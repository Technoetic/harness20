// Refused completions (2.12.0). The progress writer records a new step 38 (r1) or 44 (r2) only
// with current measured quality, which it inspects and never runs, and keeps every completion it
// refuses in step_archive/progress-refusals.json. step-auto-continue names the lowest refused step
// that is still open in a short note at the very end of its block reason.
//
// Hooks run in the native variant (PowerShell on Windows, bash elsewhere). With H50_TEST_BASH=1 on
// Windows the .ps1 and .sh variants both run and must give the same results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { makeWorkspace } from './helpers/workspace.mjs';
import { prepareQuality } from './helpers/completion-quality.mjs';
import { PROJECT_NAMES, bashOnWindows, installPlugin, nativeVariant, runClaudeHook } from './helpers/claude-hooks.mjs';
import { inspectQualityReport } from '../../scripts/lib/quality.mjs';

const VARIANTS = bashOnWindows ? ['ps1', 'sh'] : [nativeVariant];
// run_started_at of every fixture run; the writer copies it into the refusal file.
const RUN = '2026-10-01T00:00:00.000Z';
// The end of the block reason before a refusal sentence is appended.
const TAIL = { ps1: '(User direct requests still take priority.)', sh: 'User direct requests take priority.' };
const pad = step => String(step).padStart(3, '0');
const steps = length => Array.from({ length }, (_, i) => i + 1);

const entry = (step, gate, { status = '', verdict = 'INCOMPLETE', detail = '' } = {}) => ({ step, gate, status, verdict, detail });
const file = refusals => ({ schema_version: 1, run_started_at: RUN, refusals });
const sentence = {
  qa: (step, status, verdict) => `Step ${pad(step)} was reported complete but not recorded: QA evidence status=${status} verdict=${verdict}. Inspect, snapshot, rerun and record its QA report (docs/QA-REPORTS.md) before reporting it again.`,
  quality: (step, verdict, detail) => `Step ${pad(step)} was reported complete but not recorded: measured quality verdict=${verdict}${detail ? ` (${detail})` : ''}. Run node "<plugin-root>/scripts/quality-gate.mjs" --workspace "<project-root>" and repair failed checks (docs/QUALITY.md) before reporting it again.`
};

// A 50-step run with steps 1..recorded recorded and the body of the next step, next to an installed
// copy of the plugin's hooks/ and scripts/.
async function setup(variant, { recorded, name = 'project', progress = {} }) {
  const base = await makeWorkspace();
  const project = join(base, name);
  const archive = join(project, 'step_archive');
  mkdirSync(archive, { recursive: true });
  const current = Math.min(recorded + 1, 50);
  writeFileSync(join(archive, `step${pad(current)}.md`), '# Step\n');
  const progressFile = join(archive, 'progress.json');
  writeFileSync(progressFile, JSON.stringify({ total_steps: 50, current_step: current, completed_steps: steps(recorded),
    last_updated: '', run_started_at: RUN, ...progress }));
  const plugin = installPlugin(base, ['hooks', 'scripts']);
  const refusalFile = join(archive, 'progress-refusals.json');
  // The writer skips a Stop, logging it next to itself, when another process holds the machine-wide
  // Global\step-progress-writer-mutex (or the project's flock) for 5 s. Such a run is repeated
  // (bounded), so the refusal file always reflects the run being checked.
  const log = join(plugin, 'hooks', 'step-progress-writer.log');
  const logged = () => existsSync(log) ? readFileSync(log, 'utf8') : '';
  const hook = (hookName, event) => {
    for (let attempt = 1; ; attempt += 1) {
      const before = logged().length;
      const result = runClaudeHook(plugin, hookName, { hook_event_name: 'Stop', cwd: project, ...event }, { variant, cwd: base });
      assert.equal(result.status, 0, `${hookName}.${variant}: ${result.stderr}`);
      assert.equal(result.stderr.trim(), '', `${hookName}.${variant}`);
      if (hookName !== 'step-progress-writer' || attempt === 4 || !/mutex acquire FAILED|flock timeout/.test(logged().slice(before))) {
        return result.stdout.trim();
      }
    }
  };
  return {
    base, plugin, project, archive, refusalFile, hook,
    progress: () => JSON.parse(readFileSync(progressFile, 'utf8')),
    refusals: () => existsSync(refusalFile) ? JSON.parse(readFileSync(refusalFile, 'utf8')) : null,
    // An object is written as JSON, a string as it is.
    refuse: value => writeFileSync(refusalFile, typeof value === 'string' ? value : JSON.stringify(value))
  };
}

const report = (f, step) => f.hook('step-progress-writer', { last_assistant_message: `Step ${pad(step)}/50 완료` });

// The block reason step-auto-continue prints, or '' when it prints nothing.
function stop(f) {
  const output = f.hook('step-auto-continue', { session_id: 'refusals', stop_hook_active: false });
  if (output === '') return '';
  const { decision, reason } = JSON.parse(output);
  assert.equal(decision, 'block');
  return reason;
}

for (const variant of VARIANTS) {
  for (const step of [38, 44]) {
    test(`${variant}: a new Step ${step} is recorded only with current measured quality, inspected and never run`, async () => {
      const f = await setup(variant, { recorded: step - 1, name: PROJECT_NAMES[0] });
      // Configured checks leave a trace when they run; the writer may only inspect.
      const runs = join(f.archive, 'command-runs.txt');
      const checks = Object.fromEntries(['test', 'lint', 'typecheck', 'security'].map(check => [check,
        { command: [process.execPath, '-e', "require('node:fs').appendFileSync('step_archive/command-runs.txt','run\\n')"] }]));
      writeFileSync(join(f.project, 'harness50.quality.json'), JSON.stringify({ schema_version: 1, checks,
        coverage: { path: 'coverage/coverage-summary.json', minimum: 85 } }));
      // Not recorded, and one quality refusal whose detail is the inspector's error with the
      // project path shown as <project-root>.
      const refused = async () => {
        const progress = f.progress();
        assert.equal(progress.completed_steps.includes(step), false);
        assert.equal(progress.current_step, step);
        const data = f.refusals();
        assert.ok(data, 'no refusal file');
        const { refusals: [refusal, ...others], ...rest } = data;
        assert.deepEqual(rest, { schema_version: 1, run_started_at: RUN });
        assert.deepEqual(others, []);
        const { detail, ...fields } = refusal;
        assert.deepEqual(fields, { step, gate: 'quality', status: '', verdict: 'INCOMPLETE' });
        const inspected = await inspectQualityReport(f.project);
        assert.equal(inspected.verdict, 'INCOMPLETE');
        assert.equal(detail, inspected.error.replaceAll(f.project, '<project-root>'));
        for (const form of [f.project, f.project.replaceAll('\\', '/')]) {
          assert.equal(detail.toLowerCase().includes(form.toLowerCase()), false, detail);
        }
        return detail;
      };

      // No measured report: the inspector names the missing outputs directory by path.
      report(f, step);
      const missing = await refused();
      assert.match(missing, /<project-root>/);
      assert.equal(existsSync(runs), false, 'the writer ran the configured checks');
      // The next block reason ends with this refusal.
      assert.ok(stop(f).endsWith(` ${sentence.quality(step, 'INCOMPLETE', missing)}`));

      // A passing report made stale by a source change.
      await prepareQuality(f.project);
      writeFileSync(join(f.project, 'app.js'), 'changed source');
      report(f, step);
      assert.match(await refused(), /stale/);

      // A current passing report: recorded as measured, and the refusal file is removed.
      await prepareQuality(f.project);
      const measured = readFileSync(join(f.archive, 'outputs', 'quality-gate.json'));
      report(f, step);
      const progress = f.progress();
      assert.equal(progress.completed_steps.includes(step), true);
      assert.equal(progress.current_step, step + 1);
      assert.equal(f.refusals(), null);
      assert.deepEqual(readFileSync(join(f.archive, 'outputs', 'quality-gate.json')), measured, 'the writer reran the quality gate');
      assert.equal(existsSync(runs), false);
    });
  }

  test(`${variant}: an already recorded Step 38 stays recorded without quality evidence`, async () => {
    const f = await setup(variant, { recorded: 38 });
    writeFileSync(join(f.archive, 'step038.md'), '# Step\n');
    // A refusal left by an earlier Stop goes away once nothing is refused.
    f.refuse(file([entry(38, 'quality')]));
    report(f, 38);
    const progress = f.progress();
    assert.deepEqual(progress.completed_steps, steps(38));
    assert.equal(progress.current_step, 39);
    assert.equal(f.refusals(), null);
    assert.equal(existsSync(join(f.archive, 'outputs', 'quality-gate.json')), false);
  });

  test(`${variant}: a paused run with nothing to record leaves the refusal file as it is`, async () => {
    const f = await setup(variant, { recorded: 37, progress: { paused: true, pause_reason: 'user-request' } });
    const kept = JSON.stringify(file([entry(38, 'quality', { detail: 'kept' })]));
    f.refuse(kept);
    f.hook('step-progress-writer', { last_assistant_message: 'Paused before step 038.' });
    assert.equal(readFileSync(f.refusalFile, 'utf8'), kept);
  });

  test(`${variant}: Stop appends the QA refusal sentence at the very end of its reason`, async () => {
    const f = await setup(variant, { recorded: 38 });
    const base = stop(f);
    assert.ok(base.endsWith(TAIL[variant]), base);
    f.refuse(file([entry(39, 'qa', { status: 'stale' })]));
    assert.equal(stop(f), `${base} Step 039 was reported complete but not recorded: QA evidence status=stale verdict=INCOMPLETE. Inspect, snapshot, rerun and record its QA report (docs/QA-REPORTS.md) before reporting it again.`);
  });

  test(`${variant}: Stop appends the quality refusal sentence with its detail at the very end of its reason`, async () => {
    const f = await setup(variant, { recorded: 37 });
    const base = stop(f);
    assert.ok(base.endsWith(TAIL[variant]), base);
    f.refuse(file([entry(38, 'quality', { detail: 'Quality report is stale: source fingerprint changed' })]));
    assert.equal(stop(f), `${base} Step 038 was reported complete but not recorded: measured quality verdict=INCOMPLETE (Quality report is stale: source fingerprint changed). Run node "<plugin-root>/scripts/quality-gate.mjs" --workspace "<project-root>" and repair failed checks (docs/QUALITY.md) before reporting it again.`);
    // Without a detail there is no parenthesis.
    f.refuse(file([entry(38, 'quality', { verdict: 'unavailable' })]));
    assert.equal(stop(f), `${base} Step 038 was reported complete but not recorded: measured quality verdict=unavailable. Run node "<plugin-root>/scripts/quality-gate.mjs" --workspace "<project-root>" and repair failed checks (docs/QUALITY.md) before reporting it again.`);
  });

  test(`${variant}: Stop appends the final refusal sentence with its detail at the very end of its reason`, async () => {
    const f = await setup(variant, { recorded: 49 });
    const base = stop(f);
    assert.ok(base.endsWith(TAIL[variant]), base);
    f.refuse(file([entry(50, 'final', { detail: 'Final evidence incomplete: quality=PASS, browser=FAIL, regression=INCOMPLETE.' })]));
    assert.equal(stop(f), `${base} Step 050 was reported complete but not recorded: final evidence verdict=INCOMPLETE (Final evidence incomplete: quality=PASS, browser=FAIL, regression=INCOMPLETE.). Complete the final quality, browser routing and regression evidence (docs/QA-REPORTS.md) before reporting it again.`);
    f.refuse(file([entry(50, 'final', { verdict: 'unavailable' })]));
    assert.equal(stop(f), `${base} Step 050 was reported complete but not recorded: final evidence verdict=unavailable. Complete the final quality, browser routing and regression evidence (docs/QA-REPORTS.md) before reporting it again.`);
  });

  test(`${variant}: Stop drops refused steps recorded since and names the lowest open one`, async () => {
    const f = await setup(variant, { recorded: 39 });
    const base = stop(f);
    // File order is not step order, and step 39 was recorded after it was refused.
    f.refuse(file([entry(50, 'final'), entry(39, 'qa', { status: 'stale' }), entry(44, 'quality'), entry(40, 'qa', { status: 'missing' })]));
    assert.equal(stop(f), `${base} ${sentence.qa(40, 'missing', 'INCOMPLETE')}`);
    f.refuse(file([entry(39, 'qa', { status: 'stale' }), entry(38, 'quality')]));
    assert.equal(stop(f), base);
  });

  test(`${variant}: Stop ignores a refusal file left by another run`, async () => {
    const f = await setup(variant, { recorded: 38 });
    const base = stop(f);
    const refusals = [entry(39, 'qa', { status: 'missing' })];
    for (const other of [{ run_started_at: '2026-09-30T00:00:00.000Z' }, { run_started_at: null }, {}]) {
      f.refuse({ schema_version: 1, ...other, refusals });
      assert.equal(stop(f), base, JSON.stringify(other));
    }
    // Runs started by 2.9.0 and earlier have no run_started_at, and the writer records null.
    const legacy = await setup(variant, { recorded: 38, progress: { run_started_at: undefined } });
    const legacyBase = stop(legacy);
    legacy.refuse({ schema_version: 1, run_started_at: null, refusals });
    assert.equal(stop(legacy), `${legacyBase} ${sentence.qa(39, 'missing', 'INCOMPLETE')}`);
  });

  test(`${variant}: a malformed refusal file leaves the reason unchanged and stderr empty`, async () => {
    const f = await setup(variant, { recorded: 38 });
    const base = stop(f);
    const valid = entry(39, 'qa', { status: 'missing' });
    for (const content of [
      JSON.stringify(file([valid])).slice(0, -3),
      '',
      JSON.stringify({ ...file([]), refusals: 'broken' }),
      JSON.stringify(file([null, 7, 'x', { ...valid, step: '39' }, { ...valid, step: true }, { ...valid, step: 0 }, { ...valid, step: 51 }])),
      JSON.stringify(file([{ ...valid, gate: 'other' }]))
    ]) {
      f.refuse(content);
      // stop() also requires exit 0 and an empty stderr.
      assert.equal(stop(f), base, content);
    }
  });

  test(`${variant}: a paused run stays silent with a refusal file`, async () => {
    const f = await setup(variant, { recorded: 38, progress: { paused: true, pause_reason: 'required-tool-failed', paused_step: 39 } });
    f.refuse(file([entry(39, 'qa', { status: 'missing' })]));
    assert.equal(stop(f), '');
  });

  test(`${variant}: Stop shows a status or verdict that is not a plain token as unknown`, async () => {
    const f = await setup(variant, { recorded: 37 });
    const base = stop(f);
    for (const [fields, status, verdict] of [
      [{ status: '1stale', verdict: 'PASS FAIL' }, 'unknown', 'unknown'],
      [{ status: 's'.repeat(21), verdict: 'V'.repeat(20) }, 'unknown', 'V'.repeat(20)],
      [{ status: 'stale-or_old', verdict: 'IN"COMPLETE' }, 'stale-or_old', 'unknown'],
      [{ status: undefined, verdict: 7 }, 'unknown', 'unknown']
    ]) {
      f.refuse(file([{ ...entry(39, 'qa'), ...fields }]));
      assert.equal(stop(f), `${base} ${sentence.qa(39, status, verdict)}`, JSON.stringify(fields));
    }
    f.refuse(file([entry(38, 'quality', { verdict: '<b>PASS</b>', detail: 'x' })]));
    assert.equal(stop(f), `${base} ${sentence.quality(38, 'unknown', 'x')}`);
  });

  test(`${variant}: a paused run does not count a completion refused before as new work`, async () => {
    const f = await setup(variant, { recorded: 37, progress: { paused: true, pause_reason: 'user-request' } });
    f.refuse(file([entry(38, 'quality')]));
    const progressFile = join(f.archive, 'progress.json');
    const before = readFileSync(progressFile);
    // The refused report is still in the transcript; the paused writer must stay idle anyway.
    report(f, 38);
    assert.deepEqual(readFileSync(progressFile), before);
    assert.equal(existsSync(`${progressFile}.bak`), false);
    assert.deepEqual(f.refusals(), file([entry(38, 'quality')]));
  });

  test(`${variant}: an inspector that prints nothing is recorded as unavailable`, async () => {
    const f = await setup(variant, { recorded: 38 });
    // qa-report.mjs failing before it prints anything; both variants keep their defaults.
    writeFileSync(join(f.plugin, 'scripts', 'qa-report.mjs'), 'process.exitCode = 2;\n');
    report(f, 39);
    assert.deepEqual(f.refusals().refusals, [entry(39, 'qa', { status: 'unavailable', verdict: '' })]);
  });

  test(`${variant}: a Stop that cannot take the writer lock drops an older refusal`, { skip: variant !== 'ps1' }, async () => {
    const f = await setup(variant, { recorded: 38 });
    f.refuse(file([entry(39, 'qa', { status: 'missing' })]));
    const ready = join(f.base, 'holder.ready');
    // Another writer holds the machine-wide lock for longer than the writer's 5 s wait.
    const holder = spawn('powershell.exe', ['-NoProfile', '-Command',
      `$m = New-Object System.Threading.Mutex($false, 'Global\\step-progress-writer-mutex'); [void]$m.WaitOne(); Set-Content -LiteralPath '${ready}' -Value ok; Start-Sleep -Seconds 15; $m.ReleaseMutex()`],
      { stdio: 'ignore', windowsHide: true });
    try {
      for (let waited = 0; !existsSync(ready) && waited < 60000; waited += 200) await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(existsSync(ready), 'the lock holder did not start');
      const progressFile = join(f.archive, 'progress.json');
      const before = readFileSync(progressFile);
      // One run only: the shared helper repeats a run that met a held lock.
      const result = runClaudeHook(f.plugin, 'step-progress-writer',
        { hook_event_name: 'Stop', cwd: f.project, last_assistant_message: 'Step 039/50 완료' }, { variant, cwd: f.base });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr.trim(), '');
      // Nothing was inspected, so the old refusal is gone and the progress is untouched.
      assert.equal(f.refusals(), null);
      assert.deepEqual(readFileSync(progressFile), before);
    } finally {
      holder.kill();
    }
  });

  test(`${variant}: a Stop that cannot read progress.json drops an older refusal`, async () => {
    const f = await setup(variant, { recorded: 38 });
    const progressFile = join(f.archive, 'progress.json');
    const valid = JSON.parse(readFileSync(progressFile, 'utf8'));
    // Neither broken JSON nor a rejected profile reaches evidence inspection. Both drop stale
    // refusal hints without changing the invalid progress bytes.
    for (const damaged of ['{"total_steps": 50,', JSON.stringify({ ...valid, workflow_profile: 'unknown-profile' })]) {
      f.refuse(file([entry(39, 'qa', { status: 'missing' })]));
      writeFileSync(progressFile, damaged);
      report(f, 39);
      assert.equal(f.refusals(), null);
      assert.equal(readFileSync(progressFile, 'utf8'), damaged);
    }
  });

  test(`${variant}: Stop shows a token that ends with a line break as unknown`, async () => {
    const f = await setup(variant, { recorded: 38 });
    const base = stop(f);
    // In .NET a trailing '$' also matches before a final line break; the check must not let one in.
    f.refuse(file([{ ...entry(39, 'qa'), status: 'stale\n', verdict: 'INCOMPLETE\r\n' }]));
    assert.equal(stop(f), `${base} ${sentence.qa(39, 'unknown', 'unknown')}`);
  });

  test(`${variant}: a refusal detail shows a project root with repeated spaces as <project-root>`, async () => {
    const f = await setup(variant, { recorded: 37, name: 'my  project' });
    report(f, 38);
    const { refusals: [refusal] } = f.refusals();
    assert.match(refusal.detail, /<project-root>/);
    assert.equal(refusal.detail.includes('my project'), false, refusal.detail);
    assert.equal(refusal.detail.toLowerCase().includes(f.project.toLowerCase()), false, refusal.detail);
  });

  test(`${variant}: a refusal detail shows a project reached through a linked folder as <project-root>`, async () => {
    const f = await setup(variant, { recorded: 37, name: 'real-project' });
    // A junction on Windows (no privilege needed), a symbolic link elsewhere, on the folder that holds
    // the project (quality-gate.mjs refuses a workspace that is itself a link). It reports the
    // physical path, which differs from the path the hook was given.
    const holder = dirname(f.project);
    const linkedHolder = `${holder}-link`;
    symlinkSync(holder, linkedHolder, 'junction');
    try {
      const linked = join(linkedHolder, basename(f.project));
      f.hook('step-progress-writer', { cwd: linked, last_assistant_message: 'Step 038/50 완료' });
      const { refusals: [refusal] } = f.refusals();
      assert.match(refusal.detail, /<project-root>/);
      for (const form of [f.project, linked, f.project.replaceAll('\\', '/'), linked.replaceAll('\\', '/')]) {
        assert.equal(refusal.detail.toLowerCase().includes(form.toLowerCase()), false, refusal.detail);
      }
    } finally {
      unlinkSync(linkedHolder);
    }
  });

  test(`${variant}: Stop flattens control characters in the detail and cuts it after 160 characters`, async () => {
    const f = await setup(variant, { recorded: 37 });
    const base = stop(f);
    const long = Array.from({ length: 300 }, (_, i) => 'abcdefghij'[i % 10]).join('');
    for (const [detail, shown] of [
      ['\tStale report:\nsource\r\nchanged\u0001\u001f ', 'Stale report: source  changed'],
      ['\n\t ', ''],
      [long, `${long.slice(0, 157)}...`],
      [long.slice(0, 161), `${long.slice(0, 157)}...`],
      [long.slice(0, 160), long.slice(0, 160)]
    ]) {
      f.refuse(file([entry(38, 'quality', { detail })]));
      assert.equal(stop(f), `${base} ${sentence.quality(38, 'INCOMPLETE', shown)}`, JSON.stringify(detail));
    }
  });
}
