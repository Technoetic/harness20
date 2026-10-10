import test from "node:test";
import assert from "node:assert/strict";

const profiles = await import("../../scripts/lib/workflow-profiles.mjs").catch((error) => {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  return {};
});

test("fresh selection is explicit while unmarked v1 records retain fifty steps", () => {
  assert.equal(typeof profiles.defaultWorkflowProfile, "function", "shared registry must exist");
  assert.equal(profiles.defaultWorkflowProfile().id, "planning-first-14-v1");
  assert.equal(profiles.defaultWorkflowProfile().stepCount, 14);
  assert.equal(profiles.resolveWorkflowProfile({ total_steps: 50 }).id, "legacy-50-v1");
  assert.equal(profiles.resolveWorkflowProfile({ schema_version: 1, total_steps: 50 }).stepCount, 50);
  assert.equal(profiles.resolveWorkflowProfile({ schema_version: 2, workflow_profile: "research-free-36-v1", total_steps: 36 }).stepCount, 36);
});

test("record selection fails closed on ambiguous versions, identities, and counts", () => {
  assert.equal(typeof profiles.resolveWorkflowProfile, "function", "strict record resolver must exist");
  for (const record of [null, [], {}, { schema_version: 1 }, { total_steps: 36 }, { schema_version: "1" }, { schema_version: 3 },
    { schema_version: 1, total_steps: 36 }, { schema_version: 1, workflow_profile: "legacy-50-v1", total_steps: 50 }, { schema_version: 1, workflow_profile: "research-free-36-v1" },
    { schema_version: 2 }, { schema_version: 2, workflow_profile: "../steps", total_steps: 36 },
    { schema_version: 2, workflow_profile: "research-free-36-v1" },
    { schema_version: 2, workflow_profile: "research-free-36-v1", total_steps: "36" },
    { schema_version: 2, workflow_profile: "research-free-36-v1", total_steps: 50 }]) {
    assert.throws(() => profiles.resolveWorkflowProfile(record), /profile|schema|record|count|total_steps/i);
  }
  assert.throws(() => profiles.getWorkflowProfile("toString"), /profile/i);
});

test("coordinate mapping never aliases removed work and exposes retained gate roles", () => {
  assert.equal(typeof profiles.getWorkflowProfile, "function", "profile lookup must exist");
  const id = "research-free-36-v1";
  const profile = profiles.getWorkflowProfile(id);
  const originals = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,21,25,30,31,32,33,34,35,36,37,38,39,41,42,44,45,46,47,48,49,50];
  assert.deepEqual(profile.originalSteps, originals);
  originals.forEach((original, offset) => {
    assert.equal(profiles.originalStepNumber(id, offset + 1), original);
    assert.equal(profiles.profileStepNumber(id, original), offset + 1);
  });
  for (const original of [16,17,18,19,20,22,23,24,26,27,28,29,40,43]) {
    assert.equal(profiles.profileStepNumber(id, original), null);
  }
  assert.deepEqual(profile.milestones.quality, [26,30,36]);
  assert.deepEqual(profile.milestones.independentQa, [27,32,33,34]);
  assert.deepEqual(profile.milestones.jev, [17,18,25,31,35]);
  const legacy = profiles.getWorkflowProfile("legacy-50-v1");
  assert.deepEqual(legacy.milestones.independentQa, [39,40,43,46,47,48]);
  assert.deepEqual(legacy.milestones.jev, [16,24,25,30,37,45,49]);
  assert.equal(profile.milestones.design, 18);
  assert.equal(profile.milestones.final, 36);
  assert.equal(profiles.stepPhase(id,16), "planning");
  assert.equal(profiles.stepPhase(id,27), "review");
  assert.equal(profile.indexPath, "codex/assets/profiles/research-free-36-v1/steps/index.json");
  assert.throws(() => profiles.originalStepNumber(id,37), /step/i);
  assert.throws(() => profiles.originalStepNumber(id,"1"), /step/i);
  assert.throws(() => profile.originalSteps.push(51), TypeError);
  assert.throws(() => profile.milestones.quality.push(37), TypeError);
});
