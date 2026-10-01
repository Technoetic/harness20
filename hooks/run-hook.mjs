#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each budget (milliseconds) must stay below the same hook's timeout in hooks/hooks.json. The parts
// of a sequence are not registered there; the sequence's budget covers both parts plus the time a
// stopped part's process tree takes to end.
// On 2026-09-25 the host timeout did not end auto-approve runs that stayed alive 15 and 32 minutes.
const budgets = {"step-progress-loader":28000,"webapp-trigger":9000,"step-obedience-guard":4500,"destructive-guard":4500,"auto-approve":2500,"permission-request-guard":4500,"mx-tag-validator":9000,"lsp-autofix":28000,"step-progress-writer":28000,"spec-generator":14000,"trust5-validator":58000,"step-auto-continue":9000,"stop-advance":39500};
// 'stop-advance' runs step-progress-writer and then step-auto-continue as one Stop entry. As two
// entries of one Stop group the host started them in parallel, and auto-continue often read
// progress.json before the writer had recorded the step just reported, so it asked for that step
// again (9 of 12 measured Stops on Windows, 2026-10-01). Each part keeps its own budget and
// activity gate; the writer's stdout is dropped (the .sh prints plain lines that would break the
// block JSON), and a writer that runs out of time still lets step-auto-continue answer. Kept as a
// one-line JSON literal like budgets, so tests can read it from this file.
const sequences = {"stop-advance":["step-progress-writer","step-auto-continue"]};
const args = process.argv.slice(2);
if (args.length !== 1 || !Object.hasOwn(budgets, args[0])) {
  console.error('Harness50: expected one registered hook name');
  process.exitCode = 64;
} else {
  const name = args[0];
  const windows = process.platform === 'win32';
  const script = join(dirname(fileURLToPath(import.meta.url)), name + (windows ? '.ps1' : '.sh'));
  let child = null;
  let timedOut = false;
  // Armed before the hook starts, so the budget also covers any work done before spawn.
  const watchdog = setTimeout(() => {
    timedOut = true;
    console.error(`Harness50: ${name} did not finish within ${budgets[name] / 1000} s and was stopped without a decision.`);
    if (!child) process.exit(1);
    // A node started by PowerShell is outside Node's job object and inherits the hook's output
    // handles, so end the whole tree while PowerShell is still its root.
    if (windows) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 2000 });
    child.kill('SIGKILL');
    setTimeout(() => process.exit(1), 1000).unref();
  }, budgets[name]);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (child) child.kill(signal);
      else process.exit(128 + constants.signals[signal]);
    });
  }
  // The whole event is read before the activity gate, still under the watchdog: a caller that
  // never closes stdin is stopped by the budget above.
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  // hooks/lib/harness-activity.mjs decides whether the project's run phase starts this hook.
  // Without that module only the two guards start (fail toward guarding); every other hook fails closed.
  let shouldRunHook = null;
  try {
    ({ shouldRunHook } = await import('./lib/harness-activity.mjs'));
  } catch {}
  const gate = hook => {
    try {
      if (shouldRunHook) return shouldRunHook(hook, raw.toString('utf8'));
    } catch {}
    return hook === 'destructive-guard' || hook === 'permission-request-guard';
  };
  // One part of a sequence, with its own budget. Resolves with its exit code, or null when the
  // budget ran out (the tree is stopped and a line goes to stderr, as for a single hook).
  const runPart = (part, stdout) => new Promise(resolve => {
    const partScript = join(dirname(fileURLToPath(import.meta.url)), part + (windows ? '.ps1' : '.sh'));
    let settled = false;
    const finish = value => { if (!settled) { settled = true; child = null; resolve(value); } };
    const started = spawn(windows ? 'powershell.exe' : 'bash', windows
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', partScript]
      : [partScript], {
      stdio: ['pipe', stdout, 'inherit'], shell: false, windowsHide: true,
      env: { ...process.env, HARNESS50_NODE: process.execPath }
    });
    child = started;
    const timer = setTimeout(() => {
      console.error(`Harness50: ${part} did not finish within ${budgets[part] / 1000} s and was stopped without a decision.`);
      if (windows) spawnSync('taskkill.exe', ['/PID', String(started.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 2000 });
      started.kill('SIGKILL');
      finish(null);
    }, budgets[part]);
    if (stdout === 'pipe') started.stdout.resume();
    started.once('error', error => {
      clearTimeout(timer);
      console.error(`Harness50: could not start registered hook (${error.code || 'spawn error'})`);
      finish(1);
    });
    started.once('close', (code, signal) => {
      clearTimeout(timer);
      finish(code ?? (signal ? 128 + (constants.signals[signal] || 1) : 1));
    });
    started.stdin.on('error', () => {});
    started.stdin.end(raw);
  });
  if (Object.hasOwn(sequences, name)) {
    const [writer, next] = sequences[name];
    // The writer may move the run on (a recorded step, a repaired cursor), so step-auto-continue
    // answers only when its gate passes both before and after the writer: a drifted run stays
    // silent as before (the writer alone puts the cursor back), and a run the writer just finished
    // gets no stale 'Next'.
    const nextBefore = gate(next);
    if (gate(writer)) await runPart(writer, 'pipe');
    const code = nextBefore && gate(next) ? await runPart(next, 'inherit') : 0;
    clearTimeout(watchdog);
    process.exitCode = timedOut ? 1 : code ?? 1;
  } else if (!gate(name)) {
    // No shell, no output, no files. The watchdog is cleared so no late timeout line appears.
    clearTimeout(watchdog);
    process.exitCode = 0;
  } else {
    child = spawn(windows ? 'powershell.exe' : 'bash', windows
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]
      : [script], {
      stdio: ['pipe', 'inherit', 'inherit'], shell: false, windowsHide: true,
      // destructive-guard, permission-request-guard and auto-approve run their hooks/lib modules
      // with this node first, so a node missing from PATH cannot switch them off.
      env: { ...process.env, HARNESS50_NODE: process.execPath }
    });
    child.once('error', error => {
      clearTimeout(watchdog);
      console.error(`Harness50: could not start registered hook (${error.code || 'spawn error'})`);
      process.exitCode = 1;
    });
    child.once('close', (code, signal) => {
      clearTimeout(watchdog);
      process.exitCode = timedOut ? 1 : code ?? (signal ? 128 + (constants.signals[signal] || 1) : 1);
    });
    // A hook may exit without reading its input; the broken pipe is not an error.
    child.stdin.on('error', () => {});
    child.stdin.end(raw);
  }
}
