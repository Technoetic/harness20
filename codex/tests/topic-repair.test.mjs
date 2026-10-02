import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { link, mkdir, readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pathsFor } from "../scripts/lib/paths.mjs";
import { readReceipts, writeReceiptExclusive } from "../scripts/lib/receipts.mjs";
import { readState, writeStateAtomic } from "../scripts/lib/state-store.mjs";
import { prepareTopicContract } from "../scripts/lib/topic.mjs";
import * as workflow from "../scripts/lib/workflow.mjs";
import { runCli } from "./helpers/run-cli.mjs";
import { makeWorkspace } from "./helpers/workspace.mjs";

const baseTime = "2020-01-01T00:00:00.000Z";
const laterTime = "2020-01-01T00:01:00.000Z";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const original = "마틴 파울러 리팩터링을 배우는 게임\r\n외부 CDN 없이 한글로 만든다.\r\n";

async function repair(root, now = laterTime) {
  assert.equal(typeof workflow.repairTopicWorkflow, "function", "manager must expose bounded topic repair");
  return workflow.repairTopicWorkflow({ workspaceRoot: root, now });
}

// Deliberately reconstruct a pre-fix input only inside a disposable test workspace.
async function legacyFixture(request = original) {
  const root = await makeWorkspace();
  const state = await workflow.initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic: request, now: baseTime });
  const topicPath = join(root, state.topic_path);
  await writeFile(topicPath, request);
  const legacy = { ...state, topic_sha256: digest(request) };
  await writeStateAtomic(root, legacy);
  return { root, topicPath, state: legacy, paths: pathsFor(root), request };
}

function backupPath(fixture) {
  return join(fixture.paths.backupsDir, `topic-${fixture.state.topic_sha256}.md`);
}

async function unchangedAfterRejection(fixture, expected) {
  const stateBefore = await readFile(fixture.paths.statePath);
  const topicBefore = await readFile(fixture.topicPath);
  const eventsBefore = await readFile(fixture.paths.eventsPath);
  await assert.rejects(() => repair(fixture.root), error => error.code === expected);
  assert.deepEqual(await readFile(fixture.paths.statePath), stateBefore);
  assert.deepEqual(await readFile(fixture.topicPath), topicBefore);
  assert.deepEqual(await readFile(fixture.paths.eventsPath), eventsBefore);
}

test("legacy failed Step 1 repair preserves the original and history, clears stale scheduling, and stays at Step 1", async () => {
  const fixture = await legacyFixture();
  const started = await workflow.beginStep({ workspaceRoot: fixture.root, step: 1, marker: fixture.state.continuation, now: baseTime });
  await workflow.failStep({ workspaceRoot: fixture.root, step: 1, attemptId: started.attempt.id, reason: "topic fields missing", evidence: [], now: baseTime });
  const shown = await workflow.showWorkflow({ workspaceRoot: fixture.root });
  assert.equal(shown.topic_repair_eligible, true);
  assert.equal(Object.hasOwn(shown, "current_attempt"), false, "eligibility must not expose raw attempts");
  const history = await readFile(fixture.paths.eventsPath);
  const reportPath = join(fixture.root, "step_archive", "step001_preflight.md");
  await writeFile(reportPath, "original failure report\n");

  const result = await repair(fixture.root);
  assert.equal(result.repaired, true);
  assert.equal(result.backup_path, backupPath(fixture));
  assert.deepEqual(await readFile(result.backup_path), Buffer.from(original));
  const repaired = await readFile(fixture.topicPath, "utf8");
  assert.equal(repaired, prepareTopicContract(original));
  assert.equal(result.state.topic_sha256, digest(repaired));
  assert.equal(result.state.status, "paused");
  assert.equal(result.state.current_step, 1);
  assert.deepEqual(result.state.completed_steps, []);
  assert.equal(result.state.current_attempt, null);
  assert.equal(result.state.continuation, null);
  assert.equal(result.state.stop_delivery, null);
  assert.equal(result.state.owner, null);
  assert.equal(result.state.consecutive_failures, 1, "failure history must not be reset by input repair");
  assert.deepEqual(await readReceipts(fixture.root), []);
  assert.equal(await readFile(reportPath, "utf8"), "original failure report\n");
  const events = await readFile(fixture.paths.eventsPath);
  assert.deepEqual(events.subarray(0, history.length), history);
  assert.match(events.subarray(history.length).toString(), /"kind":"topic_repaired"/);
  assert.ok(!events.includes(Buffer.from("마틴 파울러")), "topic text must stay out of telemetry");
  assert.deepEqual(await readState(fixture.root), result.state);
});

test("complete inputs and repeated repair calls are byte-preserving no-ops", async () => {
  const fixture = await legacyFixture(prepareTopicContract(original));
  const stateBefore = await readFile(fixture.paths.statePath);
  const eventsBefore = await readFile(fixture.paths.eventsPath);
  const result = await repair(fixture.root);
  assert.deepEqual(result, { repaired: false, state: fixture.state });
  assert.deepEqual(await readFile(fixture.paths.statePath), stateBefore);
  assert.deepEqual(await readFile(fixture.paths.eventsPath), eventsBefore);
  assert.equal(existsSync(fixture.paths.backupsDir), false);

  const legacy = await legacyFixture();
  const first = await repair(legacy.root);
  const after = await readFile(legacy.paths.eventsPath);
  const second = await repair(legacy.root);
  assert.deepEqual(second, { repaired: false, state: first.state });
  assert.deepEqual(await readFile(legacy.paths.eventsPath), after);
  assert.deepEqual(await readdir(legacy.paths.backupsDir), [ `topic-${legacy.state.topic_sha256}.md` ]);
});

test("repair rejects a changed pinned source without mutation", async () => {
  const fixture = await legacyFixture();
  await writeFile(fixture.topicPath, "replacement request");
  await unchangedAfterRejection(fixture, "TOPIC_SOURCE_CHANGED");
  assert.equal(existsSync(fixture.paths.backupsDir), false);
});

test("repair rejects active, imported, advanced and completed workflows", async t => {
  for (const kind of ["active", "imported", "advanced", "completed"]) {
    await t.test(kind, async () => {
      const fixture = await legacyFixture();
      if (kind === "active") {
        await workflow.beginStep({ workspaceRoot: fixture.root, step: 1, marker: fixture.state.continuation, now: baseTime });
      } else {
        const state = { ...fixture.state, continuation: null, stop_delivery: null };
        if (kind === "imported") state.imported_from = { kind: "claude-progress", source_sha256: "a".repeat(64), imported_at: baseTime, prefix_length: 0, warnings: [] };
        if (kind === "advanced") Object.assign(state, { current_step: 2, completed_steps: [1] });
        if (kind === "completed") Object.assign(state, { status: "completed", current_step: null, completed_steps: Array.from({ length: 50 }, (_, i) => i + 1), completed_at: baseTime });
        await writeStateAtomic(fixture.root, state);
      }
      assert.equal((await workflow.showWorkflow({ workspaceRoot: fixture.root })).topic_repair_eligible, false);
      await unchangedAfterRejection(fixture, kind === "active" ? "ATTEMPT_ACTIVE" : "TOPIC_REPAIR_STATE");
    });
  }
});

test("receipt-first completion blocks repair even before its state commit", async () => {
  const fixture = await legacyFixture();
  await writeReceiptExclusive(fixture.root, {
    schema_version: 1, workflow_id: fixture.state.workflow_id, step: 1, attempt_id: "durable-attempt",
    provenance: "codex-verified", completed_at: baseTime, summary: "durable completion",
    evidence: [{ acceptance_id: "state-transition", kind: "check", ok: true, detail: "completed" }]
  });
  const receiptsBefore = await readReceipts(fixture.root);
  assert.equal((await workflow.showWorkflow({ workspaceRoot: fixture.root })).topic_repair_eligible, false);
  await unchangedAfterRejection(fixture, "TOPIC_REPAIR_RECEIPTS");
  assert.deepEqual(await readReceipts(fixture.root), receiptsBefore);
});

test("a redirected receipt entry cannot be mistaken for zero durable completions", async () => {
  const fixture = await legacyFixture();
  const outside = await makeWorkspace();
  await mkdir(fixture.paths.receiptsDir, { recursive: true });
  await symlink(outside, join(fixture.paths.receiptsDir, "step001.json"), process.platform === "win32" ? "junction" : "dir");
  await unchangedAfterRejection(fixture, "TOPIC_REPAIR_RECEIPTS");
});

async function interruptPublication(fixture, destination, { afterLink = false } = {}) {
  const script = `
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";
    const rename = fs.rename;
    const link = fs.link;
    fs.link = async (source, target) => {
      const result = await link(source, target);
      if (${afterLink} && target === ${JSON.stringify(destination)}) process.exit(91);
      return result;
    };
    fs.rename = async (source, target) => {
      if (!${afterLink} && target === ${JSON.stringify(destination)}) process.exit(91);
      return rename(source, target);
    };
    syncBuiltinESMExports();
    const { repairTopicWorkflow } = await import(${JSON.stringify(new URL("../scripts/lib/workflow.mjs", import.meta.url).href)});
    await repairTopicWorkflow({ workspaceRoot: ${JSON.stringify(fixture.root)}, now: ${JSON.stringify(baseTime)} });
  `;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("publication interruption timed out")); }, 5000);
    child.stderr.on("data", data => { stderr += data; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); resolve({ code, stderr }); });
  });
  assert.equal(result.code, 91, result.stderr);
}

test("repair retries after exclusive backup link publication before temporary-link removal", async () => {
  const fixture = await legacyFixture();
  await interruptPublication(fixture, backupPath(fixture), { afterLink: true });
  const pending = await readdir(fixture.paths.backupsDir);
  assert.equal(pending.length, 2, "the published backup and its interrupted temporary link must both exist");
  assert.deepEqual(await readFile(backupPath(fixture)), Buffer.from(original));
  assert.equal(await readFile(fixture.topicPath, "utf8"), original);
  assert.equal((await readState(fixture.root)).topic_sha256, fixture.state.topic_sha256);

  const result = await repair(fixture.root);
  assert.equal(result.repaired, true);
  assert.equal(result.state.status, "paused");
  assert.equal(result.state.topic_sha256, digest(await readFile(fixture.topicPath)));
  assert.deepEqual(await readFile(backupPath(fixture)), Buffer.from(original));
  assert.deepEqual(await readdir(fixture.paths.backupsDir), [`topic-${fixture.state.topic_sha256}.md`]);
});

test("interrupted backup recovery rejects an extra external hard link and changed source bytes", async t => {
  for (const tamper of ["extra link", "changed bytes"]) {
    await t.test(tamper, async () => {
      const fixture = await legacyFixture();
      await interruptPublication(fixture, backupPath(fixture), { afterLink: true });
      if (tamper === "extra link") {
        const outside = await makeWorkspace();
        await link(backupPath(fixture), join(outside, "external.md"));
      } else {
        await writeFile(backupPath(fixture), "changed original");
      }
      const pending = await readdir(fixture.paths.backupsDir);
      await unchangedAfterRejection(fixture, tamper === "extra link" ? "WORKSPACE_PATH_UNSAFE" : "TOPIC_SOURCE_CHANGED");
      assert.deepEqual(await readdir(fixture.paths.backupsDir), pending, "untrusted aliases must never be removed");
    });
  }
});

test("repair retries after a process stops between backup, topic and state publication", async t => {
  for (const boundary of ["topic", "state"]) {
    await t.test(boundary, async () => {
      const fixture = await legacyFixture();
      await interruptPublication(fixture, boundary === "topic" ? fixture.topicPath : fixture.paths.statePath);
      assert.deepEqual(await readFile(backupPath(fixture)), Buffer.from(original));
      assert.equal((await readState(fixture.root)).topic_sha256, fixture.state.topic_sha256);
      assert.equal(await readFile(fixture.topicPath, "utf8"), boundary === "topic" ? original : prepareTopicContract(original));
      const result = await repair(fixture.root);
      assert.equal(result.repaired, true);
      assert.equal(result.state.status, "paused");
      assert.equal(result.state.topic_sha256, digest(await readFile(fixture.topicPath)));
      assert.deepEqual(await readReceipts(fixture.root), []);
    });
  }
});

test("recovery refuses a tampered backup or a third topic after interrupted publication", async t => {
  for (const tamper of ["backup", "topic"]) {
    await t.test(tamper, async () => {
      const fixture = await legacyFixture();
      await interruptPublication(fixture, fixture.paths.statePath);
      await writeFile(tamper === "backup" ? backupPath(fixture) : fixture.topicPath, "tampered");
      await unchangedAfterRejection(fixture, "TOPIC_SOURCE_CHANGED");
    });
  }
});

test("repair refuses hard-linked target and backup files, and redirected backup directories", async t => {
  for (const kind of ["topic hard link", "backup hard link", "backup directory link"]) {
    await t.test(kind, async () => {
      const fixture = await legacyFixture();
      const outside = await makeWorkspace();
      const alias = join(outside, "original.md");
      await writeFile(alias, original);
      if (kind === "topic hard link") {
        await unlink(fixture.topicPath);
        await link(alias, fixture.topicPath);
      } else if (kind === "backup hard link") {
        await mkdir(fixture.paths.backupsDir);
        await link(alias, backupPath(fixture));
      } else {
        await symlink(outside, fixture.paths.backupsDir, process.platform === "win32" ? "junction" : "dir");
      }
      await unchangedAfterRejection(fixture, "WORKSPACE_PATH_UNSAFE");
      assert.equal(await readFile(alias, "utf8"), original);
    });
  }
});

test("CLI repair-topic uses only the pinned original and rejects replacement input", async () => {
  const fixture = await legacyFixture();
  const forbidden = await runCli(["repair-topic", "--workspace", fixture.root, "--input", "-"], { input: { topic: "replacement" } });
  assert.notEqual(forbidden.code, 0);
  assert.equal(JSON.parse(forbidden.stderr).error.code, "FLAG_INVALID_FOR_COMMAND");
  assert.equal(await readFile(fixture.topicPath, "utf8"), original);
  const result = await runCli(["repair-topic", "--workspace", fixture.root]);
  assert.equal(result.code, 0, result.stderr);
  const repaired = JSON.parse(result.stdout);
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.state.status, "paused");
  assert.equal(await readFile(repaired.backup_path, "utf8"), original);
  assert.deepEqual(await readState(fixture.root), repaired.state);
});
