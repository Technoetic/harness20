import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  beginStep,
  completeStep,
  failStep,
  initWorkflow,
  resumeWorkflow,
  showWorkflow
} from "../scripts/lib/workflow.mjs";
import { makePluginFixture, makeWorkspace } from "./helpers/workspace.mjs";

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL("../scripts/harness-state.mjs", import.meta.url));
const fixedTime = "2026-09-11T00:00:00.000Z";

test("resume refreshes an unused continuation without pause and rejects every stale marker", async () => {
  const root = await makeWorkspace();
  const repeatedId = () => "repeated-resume-id";
  const initial = await initWorkflow({ workflowProfile: "legacy-50-v1",
    workspaceRoot: root,
    topic: "Keep the same game workflow",
    now: fixedTime,
    idFactory: repeatedId
  });
  const first = await resumeWorkflow({
    workspaceRoot: root,
    now: fixedTime,
    idFactory: repeatedId
  });
  const second = await resumeWorkflow({
    workspaceRoot: root,
    now: fixedTime,
    idFactory: repeatedId
  });

  assert.equal(second.status, "running");
  assert.equal(second.current_step, 1);
  assert.equal(second.owner, null);
  assert.notEqual(first.continuation.nonce, initial.continuation.nonce);
  assert.notEqual(second.continuation.nonce, first.continuation.nonce);
  for (const stale of [initial.continuation, first.continuation]) {
    await assert.rejects(beginStep({
      workspaceRoot: root,
      step: 1,
      marker: stale,
      now: fixedTime,
      idFactory: repeatedId
    }), error => error.code === "CONTINUATION_REPLAY");
  }
  const started = await beginStep({
    workspaceRoot: root,
    step: 1,
    marker: second.continuation,
    now: fixedTime,
    idFactory: repeatedId
  });
  assert.equal(started.attempt.step, 1);
});

test("CLI resume after completion keeps progress and topic and opens the next step", async () => {
  const root = await makeWorkspace();
  const pluginRoot = await makePluginFixture();
  const initial = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic: "Game topic stays immutable" });
  const topicPath = join(root, initial.topic_path);
  const topicBefore = await readFile(topicPath);
  const first = await beginStep({ workspaceRoot: root, step: 1, marker: initial.continuation });
  const completed = await completeStep({
    workspaceRoot: root,
    pluginRoot,
    step: 1,
    attemptId: first.attempt.id,
    summary: "Finish the first isolated fixture step",
    evidence: [{ acceptance_id: "state-transition", kind: "check", detail: "Fixture check passed", ok: true }]
  });

  const output = await execFileAsync(process.execPath, [cli, "resume", "--workspace", root], {
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(output.stderr, "");
  const resumed = JSON.parse(output.stdout);
  assert.equal(resumed.workflow_id, initial.workflow_id);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.current_step, 2);
  assert.deepEqual(resumed.completed_steps, [1]);
  assert.equal(resumed.topic_sha256, initial.topic_sha256);
  assert.deepEqual(await readFile(topicPath), topicBefore);
  assert.notEqual(resumed.continuation.nonce, completed.continuation.nonce);
  assert.notEqual(resumed.stop_delivery.generation_id, completed.stop_delivery.generation_id);
  assert.equal(resumed.stop_delivery.accepted, false);
  assert.equal(resumed.stop_delivery.requested_turn_id, null);
  await assert.rejects(beginStep({ workspaceRoot: root, step: 2, marker: completed.continuation }),
    error => error.code === "CONTINUATION_REPLAY");
  const started = await beginStep({ workspaceRoot: root, step: 2, marker: resumed.continuation });
  assert.equal(started.attempt.step, 2);
  const shown = await showWorkflow({ workspaceRoot: root });
  assert.equal(shown.completions.codex_verified, 1);
  assert.equal(shown.current_step, 2);
  assert.deepEqual(shown.diagnostics, []);
});

test("resume replaces a pending failure retry without losing the same step", async () => {
  const root = await makeWorkspace();
  const initial = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic: "Retry the current game step" });
  const first = await beginStep({ workspaceRoot: root, step: 1, marker: initial.continuation });
  const failed = await failStep({
    workspaceRoot: root,
    step: 1,
    attemptId: first.attempt.id,
    reason: "Fixture verifier failed",
    evidence: []
  });
  assert.equal(failed.consecutive_failures, 1);
  const resumed = await resumeWorkflow({ workspaceRoot: root, sessionId: "retry-session" });
  assert.equal(resumed.current_step, 1);
  assert.deepEqual(resumed.completed_steps, []);
  assert.equal(resumed.current_attempt, null);
  assert.equal(resumed.consecutive_failures, 0);
  assert.equal(resumed.owner.session_id, "retry-session");
  await assert.rejects(beginStep({
    workspaceRoot: root, step: 1, sessionId: "retry-session", marker: failed.continuation
  }), error => error.code === "CONTINUATION_REPLAY");
  const started = await beginStep({
    workspaceRoot: root, step: 1, sessionId: "retry-session", marker: resumed.continuation
  });
  assert.notEqual(started.attempt.id, first.attempt.id);
});
