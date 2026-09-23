#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runQualityGate, inspectQualityReport } from './lib/quality.mjs';
import { physicalWorkspace, readSafe, writeSafe } from './lib/quality-files.mjs';
import { inspectBrowserOutput } from './lib/final-output.mjs';
import { inspectFinalRegression } from './lib/final-regression.mjs';

async function inspectFinalOutput(workspaceRoot) {
  const [quality, browser, regression] = await Promise.all([
    inspectQualityReport(workspaceRoot), inspectBrowserOutput(workspaceRoot), inspectFinalRegression(workspaceRoot)
  ]);
  const passed = quality.verdict === 'PASS' && browser.verdict === 'PASS' && regression.verdict === 'PASS';
  return { verdict: passed ? 'PASS' : 'INCOMPLETE', quality, browser, regression,
    ...(passed ? {} : { error: `Final evidence incomplete: quality=${quality.verdict}, browser=${browser.verdict}, regression=${regression.verdict}. ${quality.error ?? ''} ${browser.error ?? ''} ${regression.error ?? ''}`.trim() }) };
}

async function main() {
  const args = process.argv.slice(2);
  const hook = args.includes('--hook');
  const inspectFinal = args.includes('--inspect-final');
  const inspect = hook || inspectFinal || args.includes('--inspect');
  let event = {};
  if (hook) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 1024 * 1024) throw new Error('Hook event exceeds size limit');
    }
    try { event = JSON.parse(input || '{}'); } catch { return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
  }
  const workspaceOption = args.indexOf('--workspace');
  const workspaceRoot = workspaceOption >= 0 ? args[workspaceOption + 1] : process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  if (!workspaceRoot) throw new Error('--workspace requires a directory');
  let round;
  if (hook) {
    // Codex coexistence: step_archive/.harness50-codex/state.json means the Codex state manager
    // owns completion here, so a stale Claude progress.json next to it never drives this Stop gate.
    if (existsSync(join(workspaceRoot, 'step_archive', '.harness50-codex', 'state.json'))) return;
    let progress;
    try { progress = JSON.parse((await readSafe(await physicalWorkspace(workspaceRoot), 'step_archive/progress.json')).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { return; }
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return;
    if ('paused' in progress && progress.paused !== false) return;
    if ('status' in progress && !['active', 'running', 'in_progress'].includes(progress.status)) return;
    if ('total_steps' in progress && progress.total_steps !== 50) return;
    const done = progress.completed_steps;
    if (!Array.isArray(done) || done.length > 50 || done.some((n, i) => n !== i + 1) || done.length < 38) return;
    // The final writer retains step 50; accept the exhausted cursor 51 as well.
    if (!Number.isInteger(progress.current_step) ||
        (done.length < 50 ? progress.current_step !== done.length + 1 : ![50, 51].includes(progress.current_step))) return;
    round = done.length >= 49 ? 'r3' : done.length >= 44 ? 'r2' : 'r1';
  }
  const final = inspectFinal || round === 'r3';
  const report = final ? await inspectFinalOutput(workspaceRoot)
    : inspect ? await inspectQualityReport(workspaceRoot) : await runQualityGate(workspaceRoot);
  if (hook) {
    const root = await physicalWorkspace(workspaceRoot);
    const md = `# TRUST5 measured quality - ${round}\n\nVerdict: ${report.verdict}\n\nChecks: test, lint, typecheck, security; measured coverage >= 85%.${final ? ' Current HTML, schema-v3 browser routing evidence for both API scenarios, and all six final regression matrices are also required.' : ''}\nNo directory-presence scores or partial credit.\n\n${report.error ?? 'All required evidence passed inspection.'}\n\nEvidence: quality-gate.json${final ? ', browser-output.json, Step50 immutable QA report' : ''}. This is local evidence, not a signed attestation.\n`;
    await writeSafe(root, `step_archive/outputs/trust5_${round}.md`, md);
    if (report.verdict !== 'PASS' && event.stop_hook_active !== true) {
      console.log(JSON.stringify({ decision: 'block', reason: 'Harness50 quality evidence is missing, failed or stale. Configure harness50.quality.json and explicitly run node "<plugin-root>/scripts/quality-gate.mjs" --workspace "<project-root>". ' + (final ? 'Also run the browser verifier for every declared route in both API scenarios, then snapshot, rerun and record all six Step50 regression matrices on the final HTML as described in docs/QA-REPORTS.md. ' : '') + 'Read docs/QUALITY.md. Repair failed checks before claiming this milestone complete.' }));
    }
    return;
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
}

main().catch(error => { console.error(`Harness50 quality: ${error.message}`); process.exitCode = 1; });
