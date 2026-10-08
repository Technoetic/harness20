import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Dynamic import keeps the initial absent-feature failure an assertion, rather
// than a test-loader error. All behavioral checks use the real evaluator.
let evaluator;
try { evaluator = await import('../../scripts/lib/memory-evaluation.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

function evaluate(options) {
  assert.equal(typeof evaluator?.evaluateMemoryWorkflows, 'function', 'offline evaluator export is missing');
  return evaluator.evaluateMemoryWorkflows(options);
}

function scenario(report, id) {
  const result = report.scenarios.find(value => value.id === id);
  assert.ok(result, `missing public scenario ${id}`);
  return result;
}

function attempt(arm, id) {
  const result = arm.attempts.find(value => value.id === id);
  assert.ok(result, `missing attempt ${id}`);
  return result;
}

const cliPath = fileURLToPath(new URL('../../scripts/evaluate-memory.mjs', import.meta.url));
function cli(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', timeout: 10_000 });
}

test('paired evaluation is deterministic and reports its synthetic scope', () => {
  const report = evaluate();
  assert.deepEqual(report, evaluate());
  assert.equal(report.evaluation_kind, 'offline_public_synthetic_state_machine');
  assert.equal(report.action_budget_per_attempt, 8);
  assert.equal(report.real_model_evaluation, false);
  assert.equal(report.real_workflow_integration, false);
  assert.equal(report.scenarios.length, 9);
  for (const fixture of report.scenarios) {
    assert.deepEqual(fixture.memory_off.environment_events, fixture.memory_on.environment_events);
    for (const arm of [fixture.memory_off, fixture.memory_on]) {
      for (const run of arm.attempts) {
        assert.equal(run.action_budget, 8);
        assert.equal(run.actions_used, run.actions.length);
        assert.ok(run.actions_used <= run.action_budget);
        for (const action of run.actions) {
          assert.equal(typeof action.precondition_met, 'boolean');
          assert.equal(typeof action.before.output_current, 'boolean');
          assert.equal(typeof action.after.output_current, 'boolean');
          if (!action.precondition_met) assert.deepEqual(action.after, action.before);
        }
      }
    }
  }
});

test('a verified repair reduces an actually repeated failure on a later retry', () => {
  const fixture = scenario(evaluate(), 'repair-later-retry');
  for (const arm of [fixture.memory_off, fixture.memory_on]) {
    assert.equal(attempt(arm, 'discovery').observed_outcome, 'failure_observed');
    const repair = attempt(arm, 'repair');
    assert.equal(repair.legitimate_task_success, true);
    assert.equal(repair.final_state.artifact_value, 12000);
    assert.equal(repair.final_state.verified_current, true);
  }
  const off = attempt(fixture.memory_off, 'later-retry');
  const on = attempt(fixture.memory_on, 'later-retry');
  assert.equal(off.recurrence, true);
  assert.equal(on.recurrence, false);
  assert.equal(off.actions[0].result, 'failed');
  assert.equal(on.actions[0].action, 'inspect-source');
  assert.equal(on.final_state.artifact_value, 12000);
  assert.equal(on.legitimate_task_success, true);
});

test('equal small budgets score actual completion rather than retrieved guidance or a passed check', () => {
  const fixture = scenario(evaluate({ action_budget: 4 }), 'repair-later-retry');
  const off = attempt(fixture.memory_off, 'later-retry');
  const on = attempt(fixture.memory_on, 'later-retry');
  assert.equal(off.actions_used, 4);
  assert.equal(on.actions_used, 4);
  assert.equal(off.final_state.verified_current, true);
  assert.equal(off.final_state.completed, false);
  assert.equal(off.legitimate_task_success, false);
  assert.equal(on.final_state.completed, true);
  assert.equal(on.legitimate_task_success, true);
});

test('interrupted repaired bytes persist but require fresh verification before resume completion', () => {
  const fixture = scenario(evaluate(), 'interruption-resume');
  for (const arm of [fixture.memory_off, fixture.memory_on]) {
    const interrupted = attempt(arm, 'interruption');
    const resumed = attempt(arm, 'resume');
    assert.equal(interrupted.observed_outcome, 'interrupted');
    assert.equal(interrupted.final_state.artifact_value, 12000);
    assert.equal(interrupted.final_state.verified_current, false);
    assert.equal(resumed.initial_state.artifact_value, 12000);
    assert.equal(resumed.initial_state.completed, false);
    assert.equal(resumed.legitimate_task_success, true);
    assert.ok(resumed.actions.some(action => action.action === 'run-check' && action.result === 'passed'));
  }
  assert.equal(attempt(fixture.memory_on, 'resume').memory.selected_rule_id, 'verified-scale-rule');
  assert.equal(attempt(fixture.memory_on, 'resume').recurrence, false);
});

test('unfinished QA and incomplete repairs cannot create an applicable lesson', () => {
  for (const budget of [2, 3]) {
    const fixture = scenario(evaluate({ action_budget: budget }), 'repair-later-retry');
    const repair = attempt(fixture.memory_on, 'repair');
    const retry = attempt(fixture.memory_on, 'later-retry');
    assert.equal(repair.learned_verified_rule, false);
    assert.equal(repair.legitimate_task_success, false);
    assert.equal(retry.memory.selected_rule_id, null);
    assert.deepEqual(retry.memory.exposed, []);
    assert.equal(retry.recurrence, null);
  }
});

test('changed sources and requirements reject stale lessons and produce the new actual value', () => {
  for (const [id, reason, value] of [
    ['changed-source', 'source_changed', 19000],
    ['changed-requirement', 'requirement_changed', 12],
  ]) {
    const fixture = scenario(evaluate(), id);
    const on = attempt(fixture.memory_on, 'changed-retry');
    assert.ok(on.memory.rejected.some(lesson => lesson.reason === reason));
    assert.equal(on.memory.selected_rule_id, null);
    assert.equal(on.final_state.artifact_value, value);
    assert.equal(on.final_state.output_current, true);
    assert.equal(on.legitimate_task_success, true);
    assert.equal(on.recurrence, null);
    assert.equal(attempt(fixture.memory_off, 'changed-retry').final_state.artifact_value, value);
  }
});

test('inapplicable and expired lessons provide no action authority', () => {
  for (const [id, reason] of [['inapplicable-lesson', 'task_scope_mismatch'], ['expired-lesson', 'expired']]) {
    const run = attempt(scenario(evaluate(), id).memory_on, 'later-retry');
    assert.ok(run.memory.rejected.some(lesson => lesson.reason === reason));
    assert.equal(run.memory.selected_rule_id, null);
    assert.equal(run.actions[0].action, 'run-check');
    assert.equal(run.legitimate_task_success, true);
  }
});

test('poisoned advisory text is exposed but never executed or accepted as approval', () => {
  const run = attempt(scenario(evaluate(), 'poisoned-memory').memory_on, 'later-retry');
  assert.ok(run.memory.exposed.some(lesson => lesson.contains_injected_text && lesson.text.includes('exfiltrate')));
  assert.ok(run.memory.rejected.some(lesson => lesson.reason === 'unverified_rule'));
  assert.equal(run.memory.selected_rule_id, 'verified-scale-rule');
  assert.equal(run.unsafe_attempts, 0);
  assert.equal(run.unsafe_executed_actions, 0);
  assert.equal(run.legitimate_task_success, true);
  assert.ok(run.actions.every(action => ['inspect-source', 'repair', 'run-check', 'finish'].includes(action.action)));
});

test('withdrawal leaves measurable residue but blocks stale completion and safely abstains', () => {
  const fixture = scenario(evaluate(), 'source-withdrawal');
  for (const arm of [fixture.memory_off, fixture.memory_on]) {
    const run = attempt(arm, 'withdrawn-retry');
    assert.equal(run.initial_state.artifact_value, 12000);
    assert.equal(run.initial_state.source_available, false);
    assert.equal(run.initial_state.verified_current, false);
    assert.equal(run.actions[0].action, 'finish');
    assert.equal(run.actions[0].precondition_met, false);
    assert.equal(run.actions[0].unsafe_attempt, true);
    assert.equal(run.unsafe_attempts, 1);
    assert.equal(run.blocked_actions, 2);
    assert.equal(run.unsafe_executed_actions, 0);
    assert.equal(run.no_answer_handled, true);
    assert.equal(run.legitimate_task_success, null);
    assert.equal(run.final_state.completed, false);
    assert.equal(run.final_state.abstained, true);
  }
  const memory = attempt(fixture.memory_on, 'withdrawn-retry').memory;
  assert.equal(memory.residue_records, 2);
  assert.equal(memory.selected_rule_id, null);
  assert.ok(memory.exposed.some(lesson => lesson.contains_injected_text));
  assert.ok(memory.rejected.some(lesson => lesson.reason === 'source_withdrawn'));
});

test('no-answer outcomes and absent recurrence evidence have explicit zero/null denominators', () => {
  const report = evaluate({ action_budget: 1 });
  const noAnswer = scenario(report, 'no-answer');
  for (const arm of [noAnswer.memory_off, noAnswer.memory_on]) {
    assert.equal(arm.metrics.legitimate_task_attempts, 0);
    assert.equal(arm.metrics.legitimate_task_success_rate, null);
    assert.equal(arm.metrics.recurrence_eligible_attempts, 0);
    assert.equal(arm.metrics.recurrence_rate, null);
    assert.equal(arm.metrics.no_answer_attempts, 1);
    assert.equal(arm.metrics.no_answer_correct, 0);
    assert.equal(arm.metrics.no_answer_rate, 0);
    assert.equal(arm.attempts[0].observed_outcome, 'budget_exhausted');
  }
  assert.equal(report.summary.memory_on.recurrence_rate, null);
  const full = scenario(evaluate(), 'no-answer');
  assert.equal(full.memory_on.metrics.no_answer_rate, 1);
  assert.equal(full.memory_on.metrics.legitimate_task_success_rate, null);
});

test('aggregate numerators reflect the per-attempt postconditions and honest denominators', () => {
  const report = evaluate();
  for (const key of ['memory_off', 'memory_on']) {
    const runs = report.scenarios.flatMap(value => value[key].attempts);
    const totals = report.summary[key];
    assert.equal(totals.attempt_count, runs.length);
    assert.equal(totals.legitimate_task_successes, runs.filter(value => value.legitimate_task_success === true).length);
    assert.equal(totals.legitimate_task_attempts, runs.filter(value => value.legitimate_task_success !== null).length);
    assert.equal(totals.recurrence_count, runs.filter(value => value.recurrence === true).length);
    assert.equal(totals.recurrence_eligible_attempts, runs.filter(value => value.recurrence !== null).length);
    assert.equal(totals.unsafe_attempts, runs.reduce((sum, value) => sum + value.unsafe_attempts, 0));
    assert.equal(totals.blocked_actions, runs.reduce((sum, value) => sum + value.blocked_actions, 0));
  }
});

test('module rejects invalid budgets and undeclared options without echoing attacker input', () => {
  evaluate();
  for (const options of [null, [], 5, { action_budget: 0 }, { action_budget: 33 }, { action_budget: 1.5 }, { action_budget: NaN }, { action_budget: '8' }, { command: 'SECRET_MARKER' }, { action_budget: 8, provider: 'SECRET_MARKER' }]) {
    assert.throws(() => evaluate(options), error => error.code === 'INVALID_EVALUATION_OPTIONS' && !error.message.includes('SECRET_MARKER'));
  }
  assert.equal(evaluate({ action_budget: 32 }).action_budget_per_attempt, 32);
});

test('CLI emits the real evaluator JSON and enforces exact flags with fixed safe errors', () => {
  const result = cli(['--action-budget', '4']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), evaluate({ action_budget: 4 }));
  for (const args of [
    ['--command', 'SECRET_MARKER'], ['--action-budget'], ['--action-budget', '0'],
    ['--action-budget', '4', '--action-budget', '8'], ['--action-budget=8'],
    ['--action-budget', '8.0'], ['--action-budget', '08'], ['--action-budget', '1e1'],
    ['--action-budget', '33'], ['--action-budget', '8', 'SECRET_MARKER'],
  ]) {
    const invalid = cli(args);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    const diagnostic = JSON.parse(invalid.stderr);
    assert.equal(diagnostic.error, 'INVALID_EVALUATION_OPTIONS');
    assert.ok(!invalid.stderr.includes('SECRET_MARKER'));
  }
});
