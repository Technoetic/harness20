// Design exclusion contract (PR-B area B1). Both hosts write and read one
// `json harness50-design-contract` block in step_archive/step030_레이아웃설계_chunk1.md
// (docs/DESIGN-CONTRACT.md). Claude adds five host defaults; Codex keeps the legacy list
// and the TOPIC exclusions only. Exclusions win over reference fidelity at steps 37, 43, 49.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

const LEGACY = ["generic-sans", "purple-gradient", "centered-cards", "excess-radius", "flat-background"];
const HOST = ["cream-background", "italic-heading-accent", "numbered-section-labels", "monospace-labels", "pill-buttons"];
const HOST_NAMES = ["크림·오프화이트 페이지 바탕", "제목 속 이탤릭 강조어", "01·02·03 장식 번호 섹션 라벨", "코드 밖 모노스페이스 라벨", "알약형 버튼"];
const LEGACY_NAMES = ["맹목적 Inter·Roboto·Arial", "보라 계열 그라데이션 배경", "무조건 중앙정렬 카드", "과도한 border-radius", "획일적 단색 배경"];
const CONTRACT_PATH = "step_archive/step030_레이아웃설계_chunk1.md";
const FENCE = "```json harness50-design-contract";
const ITEM_KEYS = ["adopted", "exception_reason", "id", "signature", "source"];
const TOKEN_KEYS = ["colors", "fonts", "radius", "shadow", "spacing", "type"];

function defaultLine(text, file) {
  const lines = text.split("\n").filter((line) => /^\s*- 디자인 제외\(하네스 기본/.test(line));
  assert.equal(lines.length, 1, `${file}: expected one default exclusion line`);
  return lines[0].replace(/^\s*-\s*/, "");
}

function contractBlocks(text) {
  return [...text.matchAll(/^```json harness50-design-contract\n([^]*?)\n```$/gm)].map((match) => match[1]);
}

function assertContractShape(json, label) {
  const contract = JSON.parse(json);
  assert.deepEqual(Object.keys(contract).sort(), ["exclude", "schema_version", "tokens"], label);
  assert.equal(contract.schema_version, 1, label);
  assert.deepEqual(Object.keys(contract.tokens).sort(), TOKEN_KEYS, label);
  assert.ok(Array.isArray(contract.exclude) && contract.exclude.length > 0, label);
  for (const item of contract.exclude) {
    assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS, `${label}: ${item.id}`);
    assert.ok(["legacy", "host", "topic"].includes(item.source), `${label}: ${item.id}`);
    assert.equal(typeof item.adopted, "boolean", `${label}: ${item.id}`);
    assert.equal(item.adopted ? typeof item.exception_reason : item.exception_reason, item.adopted ? "string" : null, `${label}: ${item.id}`);
    assert.ok(item.source !== "topic" || item.adopted === false, `${label}: a topic item is never adopted`);
  }
}

test("the Claude default exclusion line is identical in /webapp and the step 1 TOPIC template and names every style", async () => {
  const webapp = await read("commands/webapp.md");
  const step001 = await read("assets/steps/step001.md");
  const line = defaultLine(webapp, "commands/webapp.md");
  assert.equal(defaultLine(step001, "assets/steps/step001.md"), line);
  for (const name of [...HOST_NAMES, ...LEGACY_NAMES]) assert.ok(line.includes(name), name);
  assert.doesNotMatch(webapp, /AI Slop 방지 전역 제약 준수/);
  assert.match(step001, /디자인 제외\(사용자\):/);
  assert.match(step001, /기존 TOPIC\.md를 그대로 두는 경우에도 기본 줄이 없으면 추가한다/);
});

test("the constitution defines the five host styles by role and CSS and puts the contract above references", async () => {
  const rules = await read("skills/harness-rules/SKILL.md");
  const section = /^## 5\.[^\n]*\n([^]*?)(?=^## 6\.)/m.exec(rules)?.[1];
  assert.ok(section, "harness-rules has no section 5");
  for (const id of HOST) assert.match(section, new RegExp("^\\| `" + id + "` \\| [^|]+ \\| [^|]+ \\|$", "m"), id);
  for (const id of LEGACY) assert.ok(section.includes("`" + id + "`"), id);
  assert.ok(section.includes("`harness50-design-contract`") && section.includes("`docs/DESIGN-CONTRACT.md`"));
  assert.match(section, /계약의 제외 목록 > Awwwards 참조 충실도/);
  assert.match(section, /`adopted: true`[^]*`exception_reason`[^]*결정\/사유/);
  assert.match(rules, /^4\. 설계 계약 경로/m);
});

test("the shared format document lists every item, both host defaults and the fallback", async () => {
  const doc = await read("docs/DESIGN-CONTRACT.md");
  for (const id of LEGACY) assert.match(doc, new RegExp("^\\| `" + id + "` \\| legacy \\|", "m"), id);
  for (const id of HOST) assert.match(doc, new RegExp("^\\| `" + id + "` \\| host \\|", "m"), id);
  assert.match(doc, /^\| `topic-N` \| topic \|/m);
  assert.match(doc, /\*\*Codex\*\*: the five `legacy` items and no `host` items/);
  assert.match(doc, /## Workspaces without a contract[^]*Do not\s+edit the step 30 outputs/);
  const blocks = contractBlocks(doc);
  assert.equal(blocks.length, 1);
  assertContractShape(blocks[0], "docs/DESIGN-CONTRACT.md");
});

// The rules that differ by host (B-R2-1, B-R1-1/B-R2-2): a TOPIC that both asks for and excludes a
// style, the step 43 notation and a workspace without a contract. Each document states the rule the
// step bodies of that host actually carry, and the constitution, the evaluator and the shared
// document give one Claude fallback. Pure function, so the mutation cases below can reuse it.
function sectionOf(text, heading) {
  return new RegExp("^## " + heading + "\\n([^]*?)(?=^## |(?![^]))", "m").exec(text)?.[1] ?? null;
}
function hostLine(section, host, label) {
  const lines = section.replace(/\n  /g, " ").split("\n").filter((line) => line.startsWith("- **" + host + "**"));
  assert.equal(lines.length, 1, `${label}: one ${host} line`);
  return lines[0];
}
function assertHostSplit({ doc, rules, evaluator, claude30, codex30, claude43, codex43 }) {
  const exceptions = sectionOf(doc, "Exceptions");
  assert.ok(exceptions, "doc: Exceptions section");
  const flat = exceptions.replace(/\s+/g, " ");
  assert.doesNotMatch(flat, /excludes a style blocks step 30/, "doc: the Codex block rule is written for both hosts");
  assert.match(hostLine(exceptions, "Claude", "Exceptions"), /the exclusion wins\. The `topic` item stays `adopted: false`[^]*`결정\/사유`/);
  assert.match(hostLine(exceptions, "Codex", "Exceptions"), /step 30 blocks instead of guessing/);
  assert.match(claude30, /`topic` 항목은 채택하지 않는다\./, "claude step030: the exclusion wins");
  assert.doesNotMatch(claude30, /모순되면[^\n]*차단/, "claude step030 has no block rule");
  assert.match(codex30.replace(/\s+/g, " "), /TOPIC 요구와 제외 항목이 모순되면 추정하지 않고 차단한다/, "codex step030 blocks");

  const precedence = sectionOf(doc, "Precedence and judgement").replace(/\s+/g, " ");
  assert.match(precedence, /\*\*Claude\*\* as `제외 계약: <id>`, \*\*Codex\*\* as `excluded-by-contract`/, "doc: step 43 notation per host");
  assert.doesNotMatch(precedence, /\(it records `excluded-by-contract`/, "doc: the Codex notation is written for both hosts");
  assert.match(claude43, /`제외 계약: <id>`/, "claude step043 notation");
  assert.doesNotMatch(claude43, /excluded-by-contract/, "claude step043 uses the Codex notation");
  assert.match(codex43, /`excluded-by-contract`/, "codex step043 notation");
  assert.doesNotMatch(codex43, /제외 계약: <id>/, "codex step043 uses the Claude notation");

  const fallback = sectionOf(doc, "Workspaces without a contract");
  assert.ok(fallback, "doc: Workspaces without a contract section");
  assert.doesNotMatch(fallback.replace(/\s+/g, " "), /the default list of the host that runs the step/, "doc: one reconstruction rule for both hosts");
  const codexLine = hostLine(fallback, "Codex", "fallback");
  assert.match(codexLine, /`reconstructed`/);
  assert.match(codexLine, /`exclude` from the Codex defaults \(the five `legacy` items\) and the TOPIC exclusions/);
  const claudeLine = hostLine(fallback, "Claude", "fallback");
  assert.match(claudeLine, /do not reconstruct a contract/);
  assert.match(claudeLine, /§5 numbers only \(`skills\/harness-rules\/SKILL\.md` §11\)/);
  assert.match(claudeLine, /the `host` items are not required criteria/);

  const s11 = /^## 11\. 검증 판정과 finding 형식\n([^]*?)(?=^## |^---$)/m.exec(rules)?.[1];
  assert.ok(s11, "harness-rules has no section 11");
  assert.match(s11, /계약이 없는 이전 실행은 §5의 수치를 기준으로 쓴다\. 이 실행에서는 계약을 복원하지 않으며, §5 '기본 제외 목록'\(`host` 5종\)은 필수 기준이 아니다/);
  assert.match(evaluator, /계약 블록이 없는 이전 실행은 헌법 §11대로 계약을 복원하지 않고 §5의 수치만 기준으로 쓴다\(`host` 제외 항목은 필수 기준이 아니다\)\./);
}

async function hostSplitInputs() {
  return {
    doc: await read("docs/DESIGN-CONTRACT.md"),
    rules: await read("skills/harness-rules/SKILL.md"),
    evaluator: await read("skills/evaluator/SKILL.md"),
    claude30: await read("assets/steps/step030.md"),
    codex30: await read("codex/assets/steps/step030.md"),
    claude43: await read("assets/steps/step043.md"),
    codex43: await read("codex/assets/steps/step043.md")
  };
}

test("host-specific rules in the shared document match each host's step bodies and one Claude fallback", async () => {
  const inputs = await hostSplitInputs();
  assertHostSplit(inputs);
  for (const number of ["037", "043", "049"]) {
    const text = (await read(`codex/assets/steps/step${number}.md`)).replace(/\s+/g, " ");
    assert.match(text, /계약 없는 작업 공간 절차/, `codex step${number} reads the Codex fallback`);
  }
});

test("the host split check rejects the earlier shared wording", async () => {
  const inputs = await hostSplitInputs();
  const { doc, rules, evaluator } = inputs;
  const earlierBlock = doc.replace(/A `topic` item is never adopted\. When the TOPIC[^]*?\n\n## Precedence/,
    "A `topic` item is never adopted; a TOPIC that both asks for and excludes a style blocks step 30.\n\n## Precedence");
  const earlierNotation = doc.replace(/step 43 does not report it as missing, and the Claude\n  evaluator[^]*?`excluded-by-contract` and the id\./,
    "step 43 does not report it as missing (it records\n  `excluded-by-contract` with the id), and the evaluator does not deduct design\n  fidelity for it.");
  const earlierFallback = doc.replace(/edit the step 30 outputs\.\n\n- \*\*Codex\*\*[^]*?an `Important` finding\.\n/,
    "edit the step 30 outputs. The current step writes the contract it uses once in its\nown report, marked `reconstructed`: `tokens` from the values the layout design\nalready names, `exclude` from the default list of the host that runs the step and\nthe TOPIC exclusions. Missing values stay missing; do not invent them.\n");
  const mutations = {
    earlierBlock: { ...inputs, doc: earlierBlock },
    earlierNotation: { ...inputs, doc: earlierNotation },
    earlierFallback: { ...inputs, doc: earlierFallback },
    constitutionReconstructs: { ...inputs, rules: rules.replace(" 이 실행에서는 계약을 복원하지 않으며, §5 '기본 제외 목록'(`host` 5종)은 필수 기준이 아니다", "") },
    evaluatorWithoutFallback: { ...inputs, evaluator: evaluator.replace(" 계약 블록이 없는 이전 실행은 헌법 §11대로 계약을 복원하지 않고 §5의 수치만 기준으로 쓴다(`host` 제외 항목은 필수 기준이 아니다).", "") },
    claudeBlocks: { ...inputs, claude30: inputs.claude30.replace("`topic` 항목은 채택하지 않는다.", "`topic` 항목은 채택하지 않으며 TOPIC 요구와 제외 항목이 모순되면 차단한다.") }
  };
  for (const [name, mutated] of Object.entries(mutations)) {
    assert.ok(Object.keys(mutated).some((key) => mutated[key] !== inputs[key]), `${name}: mutation changed nothing`);
    assert.throws(() => assertHostSplit(mutated), undefined, name);
  }
});

test("both hosts' step 30 write one contract block in the same place with the same fields", async () => {
  const claude = await read("assets/steps/step030.md");
  const codex = await read("codex/assets/steps/step030.md");
  for (const [label, text] of [["claude", claude], ["codex", codex]]) {
    assert.ok(text.includes("`" + CONTRACT_PATH + "`"), label);
    assert.ok(text.includes("harness50-design-contract") && text.includes("docs/DESIGN-CONTRACT.md"), label);
    assert.match(text, /정확히 하나/, label);
    for (const id of LEGACY) assert.ok(text.includes("`" + id + "`"), `${label}: ${id}`);
  }
  for (const id of HOST) {
    assert.ok(claude.includes("`" + id + "`"), `claude: ${id}`);
    assert.ok(!codex.includes(id), `codex keeps no host default: ${id}`);
  }
  const blocks = contractBlocks(claude);
  assert.equal(blocks.length, 1);
  assertContractShape(blocks[0], "assets/steps/step030.md");
  const index = JSON.parse(await read("codex/assets/steps/index.json"));
  const step30 = index.steps[29];
  assert.ok(step30.outputs.includes(CONTRACT_PATH));
  assert.ok(step30.acceptance.some((item) => item.id === "design-exclusion-contract" && item.kind === "check" && item.required));
});

test("steps 37, 43 and 49 of both hosts read the contract and let exclusions win over references", async () => {
  for (const prefix of ["assets", "codex/assets"]) {
    for (const number of ["037", "043", "049"]) {
      const text = await read(`${prefix}/steps/step${number}.md`);
      assert.ok(text.includes(CONTRACT_PATH), `${prefix} step${number}`);
      assert.ok(text.includes("harness50-design-contract"), `${prefix} step${number}`);
      assert.match(text, /adopted(?:`가 |: )false/, `${prefix} step${number}`);
    }
    const step043 = await read(`${prefix}/steps/step043.md`);
    const precedence = /^## 설계 제외 계약 우선\n([^]*?)(?=^## )/m.exec(step043)?.[1];
    assert.ok(precedence, `${prefix} step043 has no contract precedence section`);
    assert.match(precedence, /목록 우선/, `${prefix} step043 precedence section`);
    if (prefix === "assets") {
      // The verifier prompt repeats the rule, so deleting one copy must not pass unnoticed.
      assert.match(step043, /`제외 계약: <id>`로 따로 적는다 \(목록 우선\)/, "assets step043 verifier prompt");
    }
    const step049 = await read(`${prefix}/steps/step049.md`);
    assert.match(step049, /`Important`/, `${prefix} step049`);
  }
  const index = JSON.parse(await read("codex/assets/steps/index.json"));
  for (const number of [37, 43, 49]) {
    assert.ok(index.steps[number - 1].inputs.includes(CONTRACT_PATH), `codex step0${number} reads the layout chunk`);
  }
});

test("Claude steps 23 and 49 name the five host styles and step 49 blocks on an unadopted exclusion", async () => {
  const step023 = await read("assets/steps/step023.md");
  const step049 = await read("assets/steps/step049.md");
  for (const name of HOST_NAMES) {
    assert.ok(step023.includes(name), `step023: ${name}`);
    assert.ok(step049.includes(name), `step049: ${name}`);
  }
  for (const id of [...LEGACY, ...HOST]) assert.ok(step049.includes("`" + id + "`"), `step049: ${id}`);
  assert.match(step049, /`adopted: false`인 항목의 위반은 `Important` 필수 finding/);
  assert.match(step049, /설계 계약 `tokens`에 매핑/);
});
