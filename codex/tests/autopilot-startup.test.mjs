import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { handleStop } from "../hooks/stop.mjs";
import { handleUserPromptSubmit } from "../hooks/user-prompt-submit.mjs";
import {
  beginStep, completeStep, failStep, initWorkflow, pauseWorkflow, showWorkflow
} from "../scripts/lib/workflow.mjs";
import { readState } from "../scripts/lib/state-store.mjs";
import { readReceipts } from "../scripts/lib/receipts.mjs";
import { hashFile, makePluginFixture, makeWorkspace } from "./helpers/workspace.mjs";
import { prepareSchedulerMilestone } from "./helpers/completion-quality.mjs";

// These are real scheduler/hook operations with isolated acceptance fixtures.
// This does not claim that an actual product or live host completed 50 steps.
test("one short request supports all 50 verified handoffs without another human request", async () => {
  const workspaceRoot = await makeWorkspace();
  const pluginRoot = await makePluginFixture();
  let tick = Date.parse("2026-09-11T00:00:00.000Z");
  const now = () => new Date(tick++).toISOString();
  const request = "Replace Inline Code with Function Call을 체험하는 게임";
  let state = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot, topic: request, now: now() });
  const topic = await readFile(join(workspaceRoot, "step_archive/TOPIC/TOPIC.md"), "utf8");
  for (const field of ["topic", "audience", "interactive", "real_world_apps", "constraints", "decisions"]) {
    assert.match(topic, new RegExp(`^## ${field}\\s*$`, "m"));
  }
  assert.ok(topic.includes(request));

  let handoffs = 0;
  for (let step = 1; step <= 50; step++) {
    assert.equal(state.current_step, step);
    const begun = await beginStep({ workspaceRoot, step, marker: state.continuation, now: now() });
    await prepareSchedulerMilestone(workspaceRoot, step);
    state = await completeStep({
      workspaceRoot, pluginRoot, step, attemptId: begun.attempt.id, now: now(),
      summary: `Isolated scheduler fixture step ${step}`,
      evidence: [{ acceptance_id: "state-transition", kind: "check", ok: true, detail: "Isolated transition fixture verified" }]
    });
    const stop = await handleStop({ turn_id: `autopilot-${step}`, stop_hook_active: step > 1 }, {
      workspaceRoot, eventNow: now()
    });
    if (step === 50) {
      assert.deepEqual(stop, {});
      break;
    }
    assert.equal(stop.decision, "block");
    assert.equal(stop.reason, `[HARNESS50_CONTINUE ${JSON.stringify(state.continuation)}]`);
    assert.deepEqual(await handleUserPromptSubmit({ prompt: stop.reason }, {
      workspaceRoot, eventNow: now()
    }), {});
    state = await readState(workspaceRoot);
    assert.equal(state.status, "running");
    assert.equal(state.stop_delivery.accepted, true);
    handoffs++;
  }

  const status = await showWorkflow({ workspaceRoot });
  assert.equal(handoffs, 49);
  assert.equal(status.status, "completed");
  assert.equal(status.current_step, null);
  assert.equal(status.completed_count, 50);
  assert.equal(status.continuation_available, false);
  assert.equal((await readReceipts(workspaceRoot)).length, 50);
  assert.equal(await readFile(join(workspaceRoot, "step_archive/TOPIC/TOPIC.md"), "utf8"), topic);
});

// These isolated acceptance fixtures characterize the existing manager API.
// They do not invoke host hooks or claim that a real product completed 50 steps.
test("one Korean request completes 50 fixture steps directly from manager responses without hooks", async () => {
  const workspaceRoot = await makeWorkspace();
  const pluginRoot = await makePluginFixture();
  let tick = Date.parse("2026-09-11T01:00:00.000Z");
  const now = () => new Date(tick++).toISOString();
  const request = "마틴 파울러의 Replace Inline Code with Function Call을 추상화한 흥미로운 게임을 만들어줘";
  let response = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot, topic: request, now: now() });
  const topicPath = join(workspaceRoot, "step_archive/TOPIC/TOPIC.md");
  const topic = await readFile(topicPath, "utf8");
  const topicHash = await hashFile(topicPath);
  assert.ok(topic.includes(request));
  assert.equal(response.topic_sha256, topicHash);

  for (let completedCount = 0; completedCount < 50; completedCount++) {
    assert.equal(response.status, "running");
    assert.equal(response.current_step, completedCount + 1);
    assert.equal(response.completed_steps.length, completedCount);
    assert.equal(response.continuation.step, response.current_step);
    assert.equal(response.topic_sha256, topicHash);
    const step = response.current_step;
    const begun = await beginStep({
      workspaceRoot, step, marker: response.continuation, now: now()
    });
    assert.equal(begun.attempt.step, step);
    await prepareSchedulerMilestone(workspaceRoot, step);
    response = await completeStep({
      workspaceRoot, pluginRoot, step, attemptId: begun.attempt.id, now: now(),
      summary: `Isolated direct-continuation fixture step ${step}`,
      evidence: [{
        acceptance_id: "state-transition", kind: "check", ok: true,
        detail: "Isolated manager transition fixture verified"
      }]
    });
  }

  assert.equal(response.status, "completed");
  assert.equal(response.current_step, null);
  assert.equal(response.continuation, null);
  assert.equal(response.completed_steps.length, 50);
  assert.equal(response.topic_sha256, topicHash);
  const status = await showWorkflow({ workspaceRoot });
  assert.equal(status.status, "completed");
  assert.equal(status.continuation_available, false);
  assert.deepEqual(status.completions, { imported: 0, codex_verified: 50, total: 50 });
  const receipts = await readReceipts(workspaceRoot);
  assert.equal(receipts.length, 50);
  assert.deepEqual(receipts.map(receipt => receipt.step), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.ok(receipts.every(receipt => receipt.provenance === "codex-verified"));
  assert.equal(await readFile(topicPath, "utf8"), topic);
  assert.equal(await hashFile(topicPath), topicHash);
});

test("direct fixture retries use fail response markers and stop after three failures without resume", async () => {
  const workspaceRoot = await makeWorkspace();
  let tick = Date.parse("2026-09-11T02:00:00.000Z");
  const now = () => new Date(tick++).toISOString();
  let response = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot, topic: "Isolated bounded retry fixture", now: now() });
  let oldMarker;
  const attemptIds = new Set();

  for (let failureCount = 1; failureCount <= 3; failureCount++) {
    assert.equal(response.status, "running");
    assert.equal(response.current_step, 1);
    assert.equal(response.consecutive_failures, failureCount - 1);
    const step = response.current_step;
    oldMarker = response.continuation;
    assert.equal(oldMarker.step, step);
    const begun = await beginStep({ workspaceRoot, step, marker: response.continuation, now: now() });
    assert.equal(begun.state.consecutive_failures, failureCount - 1);
    assert.equal(begun.attempt.step, step);
    assert.equal(attemptIds.has(begun.attempt.id), false);
    attemptIds.add(begun.attempt.id);
    response = await failStep({
      workspaceRoot, step, attemptId: begun.attempt.id, now: now(),
      reason: "Isolated fixture acceptance did not pass",
      evidence: [{
        acceptance_id: "state-transition", kind: "check", ok: false,
        detail: "Isolated retry fixture failure"
      }]
    });
    assert.equal(response.current_step, 1);
    assert.deepEqual(response.completed_steps, []);
    assert.equal(response.consecutive_failures, failureCount);
    if (failureCount < 3) {
      assert.equal(response.status, "running");
      assert.equal(response.continuation.step, step);
      assert.notEqual(response.continuation.nonce, oldMarker.nonce);
    }
  }

  assert.equal(response.status, "blocked");
  assert.equal(response.blocked_reason, "THREE_CONSECUTIVE_FAILURES");
  assert.equal(response.continuation, null);
  await assert.rejects(
    () => beginStep({ workspaceRoot, step: response.current_step, marker: oldMarker, now: now() }),
    error => error.code === "WORKFLOW_STATE"
  );
  assert.deepEqual(await readState(workspaceRoot), response);
  assert.deepEqual(await readReceipts(workspaceRoot), []);
});

test("pause prevents a pending direct fixture marker from starting the next step", async () => {
  const workspaceRoot = await makeWorkspace();
  const pluginRoot = await makePluginFixture();
  let tick = Date.parse("2026-09-11T03:00:00.000Z");
  const now = () => new Date(tick++).toISOString();
  let response = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot, topic: "Isolated direct pause fixture", now: now() });
  const begun = await beginStep({
    workspaceRoot, step: response.current_step, marker: response.continuation, now: now()
  });
  response = await completeStep({
    workspaceRoot, pluginRoot, step: begun.attempt.step, attemptId: begun.attempt.id, now: now(),
    summary: "Isolated fixture completion before pause",
    evidence: [{
      acceptance_id: "state-transition", kind: "check", ok: true,
      detail: "Isolated manager transition fixture verified"
    }]
  });
  assert.equal(response.current_step, 2);
  const pendingMarker = response.continuation;
  const paused = await pauseWorkflow({ workspaceRoot, reason: "Fixture user pause", now: now() });
  assert.equal(paused.status, "paused");
  assert.equal(paused.current_step, 2);
  assert.equal(paused.continuation, null);
  await assert.rejects(
    () => beginStep({ workspaceRoot, step: response.current_step, marker: pendingMarker, now: now() }),
    error => error.code === "WORKFLOW_STATE"
  );
  assert.deepEqual(await readState(workspaceRoot), paused);
  const status = await showWorkflow({ workspaceRoot });
  assert.equal(status.status, "paused");
  assert.equal(status.completed_count, 1);
  assert.equal(status.continuation_available, false);
});
