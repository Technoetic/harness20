import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRepositoryParity } from "../scripts/validate-steps.mjs";
import { loadStepContract } from "../scripts/lib/acceptance.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const profile = "planning-first-20-v1";
const source = `assets/profiles/${profile}/steps`;
const target = `codex/assets/profiles/${profile}/steps`;
const backend = "step_archive/outputs/browser-backend.json";

async function index() {
  const path = join(root, target, "index.json");
  assert.ok(existsSync(path), "fresh planning workflow must have its own instruction index");
  return JSON.parse(await readFile(path, "utf8"));
}

test("twenty instruction contracts form a complete current-source dependency graph", async () => {
  const data = await index();
  assert.equal(data.workflow_profile, profile);
  assert.equal(data.total_steps, 20);
  const result = await validateRepositoryParity(root, profile);
  assert.equal(result.steps.length, 20);
  assert.equal(result.steps[0].title, "기획: 요구사항 기반 (독립 검증 루프)");
  assert.equal(result.steps.at(-1).next, null);
});

test("planning starts with the frozen request without inventing earlier completion evidence", async () => {
  const data = await index();
  assert.deepEqual(data.steps[0].inputs, ["step_archive/TOPIC/TOPIC.md"]);
  assert.deepEqual(data.steps[0].requires, []);
  assert.deepEqual(data.steps[0].optional_requires, []);
  for (const step of data.steps) {
    assert.doesNotMatch(JSON.stringify(step), /_preflight\.md|_gate_status\.md|_playwright_test\.md/,
      `${step.id} must not consume a removed prerequisite`);
    for (const host of ["source", "target"]) {
      const body = await readFile(join(root, step[host]), "utf8");
      assert.doesNotMatch(body, /_preflight\.md|_gate_status\.md|_playwright_test\.md/, step[host]);
    }
  }
});

test("environment owns a required backend lock consumed by E2E and final verification", async () => {
  const data = await index();
  const environment = data.steps[2];
  assert.ok(environment.outputs.includes(backend));
  assert.ok(environment.acceptance.some(item => item.kind === "artifact" && item.required && item.path === backend));
  assert.ok(environment.acceptance.some(item => item.id === "bounded-browser-readiness" && item.required));
  for (const number of [15, 20]) {
    const step = data.steps[number - 1];
    assert.ok(step.inputs.includes(backend), `${step.id} consumes the selected backend`);
    assert.ok(step.requires.includes("step003"), `${step.id} requires actual environment evidence`);
  }
  assert.ok(data.steps[14].inputs.includes("step_archive/step003_환경준비.md"));
});

test("shorter instructions retain every independent review and measured acceptance gate", async () => {
  const data = await index();
  const old = JSON.parse(await readFile(join(root, "codex/assets/profiles/research-free-36-v1/steps/index.json"), "utf8"));
  for (const step of data.steps) {
    const previous = old.steps[step.number + 15];
    const currentRequired = new Set(step.acceptance.filter(item => item.required).map(item => item.id));
    for (const item of previous.acceptance.filter(item => item.required)) {
      assert.ok(currentRequired.has(item.id), `${step.id} must retain required ${item.id}`);
    }
  }
  for (const number of [10, 14, 20]) {
    assert.ok(data.steps[number - 1].acceptance.some(item => item.id === "measured-quality-report"));
  }
  // Runtime milestones enforce these measured reports independently of the
  // optional report-submission metadata retained from the previous definition.
  assert.ok(data.steps[19].acceptance.some(item => item.id === "final-regression-report"));
  for (const number of [11, 15, 16, 17, 18, 19]) {
    assert.ok(data.steps[number - 1].acceptance.some(item => item.id === "bounded-pass-loop" && item.required));
  }
  for (const number of [1, 2]) {
    assert.ok(data.steps[number - 1].acceptance.some(item => item.id === "provided-api-contract" && item.required));
  }
});

test("completion, advancement, QA and numbered references use retained coordinates", async () => {
  const data = await index();
  for (const step of data.steps) {
    for (const host of ["source", "target"]) {
      const body = await readFile(join(root, step[host]), "utf8");
      for (const marker of body.matchAll(/\bStep\s*(\d+)\/(\d+)\s+완료/g)) {
        assert.deepEqual(marker.slice(1).map(Number), [step.number, 20], step[host]);
      }
      for (const next of body.matchAll(/자동으로 (step\d{3})\.md를 읽고 수행/g)) {
        assert.equal(next[1], step.next, step[host]);
      }
      for (const qa of body.matchAll(/inspect --workspace "<project-root>" --step (\d+)/g)) {
        assert.equal(Number(qa[1]), step.number, step[host]);
      }
      for (const reference of body.matchAll(/\bstep(\d{3})\b|\bStep\s*`?(\d+)`?(?!\d)|SPEC-(\d{3})/g)) {
        const number = Number(reference[1] ?? reference[2] ?? reference[3]);
        assert.ok(number >= 1 && number <= 20, `${step[host]} has an out-of-profile reference ${reference[0]}`);
      }
    }
  }
  const design = await readFile(join(root, target, "step019.md"), "utf8");
  assert.deepEqual(/앞선 (\d+)~(\d+) 검사 결과/.exec(design)?.slice(1).map(Number), [15, 18]);
  for (const host of [source, target]) {
    const body = await readFile(join(root, host, "step020.md"), "utf8");
    assert.deepEqual(/Step\s*(\d+) 및 Step\s*(\d+)의 실제 분기 검증/.exec(body)?.slice(1).map(Number), [9, 15]);
  }
});

test("parity rejects removed-gate dependencies and source drift in the new profile", async t => {
  const data = await index();
  const fixture = await mkdtemp(join(tmpdir(), "harness-planning-steps-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(join(root, source), join(fixture, source), { recursive: true });
  await cp(join(root, target), join(fixture, target), { recursive: true });
  const path = join(fixture, target, "index.json");
  const bad = structuredClone(data);
  bad.steps[0].requires = ["step016"];
  await writeFile(path, JSON.stringify(bad));
  await assert.rejects(() => validateRepositoryParity(fixture, profile), /prior steps|future|dependency/i);
  await writeFile(path, JSON.stringify(data));
  await writeFile(join(fixture, source, "step001.md"), "changed\n");
  await assert.rejects(() => validateRepositoryParity(fixture, profile), /SOURCE_CHANGED_REVIEW_REQUIRED/);
});

test("dependency quality uses current environment evidence instead of the deleted installer", async () => {
  const body = await readFile(join(root, source, "step010.md"), "utf8");
  assert.doesNotMatch(body, /Step\s+15[^\n]*madge/);
  assert.match(body, /Step\s+3[^\n]*madge/);
});

test("final browser verification cannot bypass its required backend lock", async () => {
  for (const host of [source, target]) {
    const body = await readFile(join(root, host, "step020.md"), "utf8");
    assert.doesNotMatch(body, /잠금 파일이 없는 기존 프로젝트는\s*step003 보고서[\s\S]*?--backend/);
  }
});

test("completion reports use twenty-stage progress throughout the instruction contracts", async () => {
  const data = await index();
  assert.doesNotMatch(JSON.stringify(data), /36\/36|50\/50/);
  for (const step of data.steps) {
    for (const host of ["source", "target"]) {
      assert.doesNotMatch(await readFile(join(root, step[host]), "utf8"), /36\/36|50\/50/, step[host]);
    }
  }
});

test("first planning reads no prior-stage history and scopes retry records to the current run", async () => {
  for (const host of [source, target]) {
    const body = await readFile(join(root, host, "step001.md"), "utf8");
    assert.doesNotMatch(body, /step_archive\/outputs\/step0\*|이전 기획 Step의 결과 파일/);
    assert.match(body, /planning-first-20-v1/);
    assert.match(body, /workflow_generation/);
    assert.match(body, /현재 기획 시도/);
  }
});

test("Claude planning records actual input digests without claiming an automatic metadata pin", async () => {
  const body = await readFile(join(root, source, "step001.md"), "utf8");
  assert.doesNotMatch(body, /workflow가[^\n]*해시로 고정/);
  assert.match(body, /기획 작성자와 독립 검증자[\s\S]{0,120}SHA-256/);
});

test("Codex planning identifies the manager's actual frozen topic hash", async () => {
  const body = await readFile(join(root, target, "step001.md"), "utf8");
  assert.match(body, /state\.topic_sha256/);
});

test("stored planning verifier handoffs bind explicit inputs to the current attempt", async () => {
  const contract = await loadStepContract(root, 1, profile);
  for (const host of ["source", "target"]) {
    const body = await readFile(join(root, contract[host]), "utf8");
    const handoff = host === "source"
      ? /에이전트 B에게 전달할 프롬프트[^\n]*\n[\s\S]*?```[^\n]*\n([\s\S]*?)\n```/.exec(body)?.[1]
      : /## 실행 역할\n([\s\S]*?)(?=\n## )/.exec(body)?.[1];
    assert.ok(handoff, `${host} exposes its actual verifier input contract`);
    assert.doesNotMatch(handoff, /Glob|step_archive\/[^\s`]*\*/);
    for (const field of ["workflow_profile", "workflow_generation", "planning_attempt", "topic_sha256"]) {
      assert.ok(handoff.includes(field), `${host} handoff requires ${field}`);
    }
    assert.match(handoff, /명시 경로/);
    assert.match(handoff, /이번 시도[^\n]*실제 생성[^\n]*SHA-256/);
  }
});
