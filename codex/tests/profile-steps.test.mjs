import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIndex, validateRepositoryParity } from "../scripts/validate-steps.mjs";
import { getWorkflowProfile, originalStepNumber, profileStepNumber } from "../../scripts/lib/workflow-profiles.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const profile = "research-free-36-v1";
const target = `codex/assets/profiles/${profile}/steps`;
const source = `assets/profiles/${profile}/steps`;

test("declared completion markers name their containing step and selected total exactly once", async () => {
  const index = await loadIndex(root, profile);
  const legacy = await loadIndex(root);
  for (const entry of index.steps) {
    const original = legacy.steps[originalStepNumber(profile, entry.number) - 1];
    for (const host of ["source", "target"]) {
      const previous = await readFile(join(root, original[host]), "utf8");
      const current = await readFile(join(root, entry[host]), "utf8");
      const pattern = /\bStep\s*(\d+)\/(\d+)\s+완료/g;
      const before = [...previous.matchAll(pattern)];
      const after = [...current.matchAll(pattern)];
      assert.equal(after.length, before.length, `${entry[host]} must retain each declared completion marker`);
      for (const match of after) {
        assert.deepEqual([Number(match[1]), Number(match[2])], [entry.number, index.total_steps],
          `${entry[host]} completion marker must identify this step, not a different valid coordinate`);
      }
    }
  }
});

test("browser backend grouping points to the retained E2E and final gates", async () => {
  const body = await readFile(join(root, source, "step003.md"), "utf8");
  const group = /브라우저 검증\(Step\s*([\d·]+) 포함\)/.exec(body);
  assert.ok(group, "backend lock instructions must explicitly cover both later browser gates");
  assert.deepEqual(group[1].split("·").map(Number),
    [profileStepNumber(profile, 45), getWorkflowProfile(profile).milestones.final]);
});

test("source advancement and QA inspection coordinates retain their workflow roles", async () => {
  const index = await loadIndex(root, profile);
  for (const entry of index.steps) {
    const body = await readFile(join(root, entry.source), "utf8");
    for (const match of body.matchAll(/자동으로 (step\d{3})\.md를 읽고 수행/g)) {
      assert.equal(match[1], entry.next, `${entry.id} advances to the next retained instruction`);
    }
    for (const match of body.matchAll(/inspect --workspace "<project-root>" --step (\d+)/g)) {
      assert.equal(Number(match[1]), entry.number, `${entry.id} inspects its own QA evidence`);
    }
  }
  for (const host of [source, target]) {
    const finalBody = await readFile(join(root, host, "step036.md"), "utf8");
    const group = /Step\s*(\d+) 및 Step\s*(\d+)의 실제 분기 검증/.exec(finalBody);
    assert.ok(group, `${host} final gate must retain actual branch verification`);
    assert.deepEqual(group.slice(1).map(Number),
      [getWorkflowProfile(profile).milestones.implementation, profileStepNumber(profile, 45)]);
  }
});

test("new profile resolves 36 physical source contracts with hashes and preserved quality gates", async () => {
  const index = await loadIndex(root, profile);
  assert.equal(index.workflow_profile, profile, "loader must use explicitly selected definition");
  assert.equal(index.total_steps, 36);
  const result = await validateRepositoryParity(root, profile);
  assert.equal(result.steps.length, 36);
  assert.equal(result.steps.at(-1).next, null);
  for (const number of [26,30,36]) assert.ok(result.steps[number-1].acceptance.some(a => a.id === "measured-quality-report"));
  assert.ok(result.steps[35].acceptance.some(a => a.id === "final-regression-report"));
  for (const number of [27,31,32,33,34,35]) {
    assert.ok(result.steps[number-1].acceptance.some(a => a.id === "bounded-pass-loop"));
  }
  assert.ok(result.steps[16].acceptance.some(a => a.id === "requirements-traceability"));
  for (const number of [17,18]) {
    assert.ok(result.steps[number-1].acceptance.some(a => a.id === "provided-api-contract" && a.required),
      `step ${number} must block missing API requirements without manufacturing external facts`);
  }
  assert.ok(result.steps[34].acceptance.some(a => a.id === "design-token-contract-traceability"));
  const forbidden = /general-research-provenance|design-token-research-traceability|research-raw|awwwards|screenshots\/research|supplemental\//i;
  assert.doesNotMatch(JSON.stringify(index), forbidden);
  for (const entry of result.steps) {
    for (const path of [entry.source,entry.target]) {
      const body = await readFile(join(root,path), "utf8");
      assert.doesNotMatch(body, forbidden, path);
      assert.doesNotMatch(body, /(?:step0(?:3[7-9]|4\d|50)\b|Step\s*(?:3[7-9]|4\d|50)\b|\/50\b|50\/36|45~49)/i, path);
    }
  }
});

test("selected definition rejects cross-profile metadata and source hash drift", async t => {
  const index = await loadIndex(root, profile);
  assert.equal(index.workflow_profile, profile, "new index must exist");
  const fixture = await mkdtemp(join(tmpdir(), "harness-profile-"));
  t.after(() => rm(fixture, { recursive:true, force:true }));
  await cp(join(root,source), join(fixture,source), { recursive:true });
  await cp(join(root,target), join(fixture,target), { recursive:true });
  const indexPath = join(fixture,target,"index.json");
  for (const mutate of [i => {i.workflow_profile="legacy-50-v1";}, i => {i.total_steps=50;}, i => {delete i.workflow_profile;}]) {
    const bad = structuredClone(index); mutate(bad);
    await writeFile(indexPath, JSON.stringify(bad));
    await assert.rejects(() => validateRepositoryParity(fixture,profile), /profile|count|total_steps|keys/i);
  }
  await writeFile(indexPath, JSON.stringify(index));
  await writeFile(join(fixture,source,"step017.md"), "changed\n");
  await assert.rejects(() => validateRepositoryParity(fixture,profile), /SOURCE_CHANGED_REVIEW_REQUIRED/);
});
