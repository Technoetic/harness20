#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each budget (milliseconds) must stay below the same hook's timeout in hooks/hooks.json.
// On 2026-09-25 the host timeout did not end auto-approve runs that stayed alive 15 and 32 minutes.
const budgets = {"step-progress-loader":28000,"webapp-trigger":9000,"step-obedience-guard":4500,"destructive-guard":4500,"auto-approve":2500,"permission-request-guard":4500,"mx-tag-validator":9000,"lsp-autofix":28000,"step-progress-writer":28000,"spec-generator":14000,"trust5-validator":58000,"step-auto-continue":9000};
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
  let run;
  try {
    const { shouldRunHook } = await import('./lib/harness-activity.mjs');
    run = shouldRunHook(name, raw.toString('utf8'));
  } catch {
    run = name === 'destructive-guard' || name === 'permission-request-guard';
  }
  if (!run) {
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
