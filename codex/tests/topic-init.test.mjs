import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { pathsFor } from "../scripts/lib/paths.mjs";
import { readState } from "../scripts/lib/state-store.mjs";
import { hasCompleteTopicContract, prepareTopicContract } from "../scripts/lib/topic.mjs";
import { initWorkflow } from "../scripts/lib/workflow.mjs";
import { makeWorkspace } from "./helpers/workspace.mjs";

const baseTime = "2026-09-11T00:00:00.000Z";
const requiredFields = [
  "topic", "audience", "interactive", "real_world_apps", "constraints", "decisions"
];
const defaultProvenance = /default|assum|unspecified|기본|가정|미지정/i;

function markdownFields(document) {
  const headings = [...document.matchAll(/^##[ \t]+([^\r\n]+)\r?$/gm)];
  return new Map(headings.map((heading, index) => [
    heading[1].replaceAll("`", "").trim(),
    document.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim()
  ]));
}

function assertCompleteGeneratedContract(document) {
  const fields = markdownFields(document);
  for (const field of requiredFields) {
    assert.ok(fields.get(field)?.trim(), `persisted topic contract must have a nonempty ${field} field`);
  }
  return fields;
}

function preservedOriginalRequest(document) {
  const marker = "## original_request\n\n";
  const sectionAt = document.indexOf(marker);
  assert.notEqual(sectionAt, -1, "normalized contract must contain original_request");
  const section = document.slice(sectionAt + marker.length);
  const openerEnd = section.indexOf("\n");
  const opener = section.slice(0, openerEnd);
  const fence = opener.slice(0, -"text".length);
  const closingAt = section.lastIndexOf(`\n${fence}\n`);
  assert.ok(closingAt > openerEnd, "original_request fence must close after its payload");
  return { fence, request: section.slice(openerEnd + 1, closingAt) };
}

async function initialize(topic) {
  const root = await makeWorkspace();
  const state = await initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic, now: baseTime });
  const topicPath = join(root, "step_archive", "TOPIC", "TOPIC.md");
  const bytes = await readFile(topicPath);
  const persisted = await readState(root);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(state.topic_sha256, digest);
  assert.equal(persisted.topic_sha256, digest);
  return { root, state, topicPath, bytes, document: bytes.toString("utf8") };
}

test("short Korean init freezes all six topic fields with honest default provenance", async () => {
  const request = "어린이를 위한 우주 탐험 웹앱";
  const { document, state } = await initialize(request);
  const fields = assertCompleteGeneratedContract(document);

  assert.ok(fields.get("topic").includes(request));
  assert.ok(document.includes(request), "the original request must be preserved");
  for (const field of requiredFields.slice(1)) {
    assert.match(fields.get(field), defaultProvenance, `${field} must identify an inferred default`);
  }
  assert.equal(state.current_step, 1);
  assert.equal(state.status, "running");
});

test("complete YAML and Markdown topic contracts retain their exact bytes and hash", async t => {
  const fixtures = [
    ["YAML with CRLF and no final newline", [
      "topic: 어린이 우주 탐험",
      "audience: 초등학생",
      "interactive: 행성 선택과 퀴즈",
      "real_world_apps: NASA의 태양계 학습 자료",
      "constraints: |",
      "  외부 CDN을 사용하지 않는다.",
      "  개인정보를 수집하지 않는다.",
      "decisions: 한글 UI를 사용한다. 사용자가 요청했다."
    ].join("\r\n")],
    ["YAML with Markdown-looking literal content", [
      "topic: Space learning",
      "audience: Children",
      "interactive: Quiz",
      "real_world_apps: Classroom",
      "constraints: |",
      "  ## audience",
      "  This is literal constraint content, not a contract heading.",
      "decisions: Korean UI"
    ].join("\r\n")],
    ["Markdown with final newline", [
      "# 사용자 주제 계약", "",
      "## topic", "행성 학습 도구", "",
      "## audience", "초등학생과 교사", "",
      "## interactive", "행성 비교 슬라이더", "",
      "## real_world_apps", "교실에서 행성 크기 비교", "",
      "## constraints", "오프라인에서 실행하고 로그인을 요구하지 않는다.", "",
      "## decisions", "교사가 수업에서 사용하므로 한글로 제공한다.", ""
    ].join("\n")]
  ];

  for (const [name, request] of fixtures) {
    await t.test(name, async () => {
      const { bytes, state } = await initialize(request);
      assert.deepEqual(bytes, Buffer.from(request, "utf8"));
      assert.equal(state.topic_sha256, createHash("sha256").update(request, "utf8").digest("hex"));
    });
  }
});

test("complete Markdown contracts preserve structured constraint content verbatim", async t => {
  const fixtures = [
    ["colon bullets", [
      "- browser: Chrome",
      "- offline: Required",
      "- login: Forbidden"
    ]],
    ["nested headings", [
      "### Network",
      "No external CDN or requests.",
      "### Identity",
      "No login and no personal data collection."
    ]]
  ];

  for (const [name, constraints] of fixtures) {
    await t.test(name, async () => {
      const request = [
        "## topic", "Space learning",
        "## audience", "Children",
        "## interactive", "Quiz",
        "## real_world_apps", "Classroom",
        "## constraints", ...constraints,
        "## decisions", "Korean UI"
      ].join("\r\n");
      const { bytes, state } = await initialize(request);

      assert.deepEqual(bytes, Buffer.from(request, "utf8"), "all six explicit fields must remain byte-for-byte intact");
      assert.equal(state.topic_sha256, createHash("sha256").update(request, "utf8").digest("hex"));
    });
  }
});

test("partial YAML init preserves explicit multiline constraints and the complete original request", async () => {
  const request = [
    "topic: 초등학생을 위한 천문학 학습",
    "audience: 초등학교 4학년",
    "interactive: 클릭만 허용하고 드래그는 사용하지 않는다.",
    "constraints: |",
    "  외부 CDN을 사용하지 않는다.",
    "  로그인과 개인정보 수집을 요구하지 않는다.",
    "  예산은 0원이며 새로운 유료 서비스를 구독하지 않는다.",
    "",
    "기존 그림과 설명을 모두 보존해 주세요."
  ].join("\r\n");
  const { document } = await initialize(request);
  const fields = assertCompleteGeneratedContract(document);

  assert.ok(document.includes(request), "normalization must preserve the full original input, including line endings");
  assert.ok(fields.get("topic").includes("초등학생을 위한 천문학 학습"));
  assert.ok(fields.get("audience").includes("초등학교 4학년"));
  assert.ok(fields.get("interactive").includes("클릭만 허용하고 드래그는 사용하지 않는다."));
  for (const constraint of [
    "외부 CDN을 사용하지 않는다.",
    "로그인과 개인정보 수집을 요구하지 않는다.",
    "예산은 0원이며 새로운 유료 서비스를 구독하지 않는다."
  ]) {
    assert.ok(fields.get("constraints").includes(constraint), `lost explicit constraint: ${constraint}`);
  }
  for (const field of ["audience", "interactive", "constraints"]) {
    assert.doesNotMatch(fields.get(field), defaultProvenance, `${field} was explicitly supplied by the user`);
  }
  assert.match(fields.get("real_world_apps"), defaultProvenance);
  assert.match(fields.get("decisions"), defaultProvenance);
});

test("blank YAML values cannot masquerade as a complete topic contract", async () => {
  const request = [
    "topic: 우주 탐험",
    "audience:",
    "interactive:   ",
    "real_world_apps: |",
    "  ",
    "constraints: \"\"",
    "decisions: ''"
  ].join("\n");
  const { document } = await initialize(request);
  const fields = assertCompleteGeneratedContract(document);

  assert.ok(document.includes(request));
  for (const field of requiredFields.slice(1)) {
    assert.match(fields.get(field), defaultProvenance, `blank ${field} must receive an explicit default`);
  }
});

test("comment-only YAML values receive explicit defaults before freezing", async () => {
  const request = [
    "topic: Space learning",
    "audience:", "  # not specified",
    "interactive:", "  # not specified",
    "real_world_apps:", "  # not specified",
    "constraints:", "  # not specified",
    "decisions:", "  # not specified"
  ].join("\n");
  const { document } = await initialize(request);
  const fields = assertCompleteGeneratedContract(document);

  assert.ok(document.includes(request), "the original comments must remain in the preserved request");
  for (const field of requiredFields.slice(1)) {
    assert.match(fields.get(field), defaultProvenance, `comment-only ${field} must receive an explicit default`);
  }
});

test("contract completeness ignores required-looking keys in nested sections and fences", () => {
  const nestedMarkdown = [
    "## topic", "Space learning",
    "### audience", "Children",
    "### interactive", "Quiz",
    "### real_world_apps", "Classroom",
    "### constraints", "Offline",
    "### decisions", "Korean UI"
  ].join("\n");
  const fencedYaml = [
    "topic: Space learning",
    "notes: |",
    "  ~~~yaml",
    "  audience: Children",
    "  interactive: Quiz",
    "  real_world_apps: Classroom",
    "  constraints: Offline",
    "  decisions: Korean UI",
    "  ~~~"
  ].join("\n");
  const commentOnlyYaml = [
    "topic: Space learning",
    "audience: # not specified",
    "interactive: # not specified",
    "real_world_apps: # not specified",
    "constraints: # not specified",
    "decisions: # not specified"
  ].join("\n");
  const completeMarkdown = [
    "## topic", "Space learning",
    "## audience", "Children",
    "## interactive", "Quiz",
    "## real_world_apps", "Classroom",
    "## constraints", "### Network", "- browser: Chrome",
    "## decisions", "Korean UI"
  ].join("\r\n");
  const emptyFencedMarkdown = [
    "## topic", "Space learning",
    "## audience", "Children",
    "## interactive", "Quiz",
    "## real_world_apps", "Classroom",
    "## constraints", "~~~text", "~~~",
    "## decisions", "Korean UI"
  ].join("\n");

  assert.equal(hasCompleteTopicContract(nestedMarkdown), false);
  assert.equal(hasCompleteTopicContract(fencedYaml), false);
  assert.equal(hasCompleteTopicContract(commentOnlyYaml), false);
  assert.equal(hasCompleteTopicContract(completeMarkdown), true);
  assert.equal(hasCompleteTopicContract(emptyFencedMarkdown), false);
});

test("an empty topic field receives an explicit default with provenance", () => {
  const request = [
    "topic: # not specified",
    "audience: Children",
    "interactive: Quiz",
    "real_world_apps: Classroom",
    "constraints: Offline",
    "decisions: Korean UI"
  ].join("\n");
  const prepared = prepareTopicContract(request);
  const fields = assertCompleteGeneratedContract(prepared);

  assert.match(fields.get("topic"), defaultProvenance);
  assert.match(markdownFields(prepared).get("initialization_notes"), /topic/);
  assert.ok(prepared.includes(request));
});

test("normalization encloses the exact original request beyond malicious fence runs", () => {
  const request = [
    "Build a parser viewer.",
    "~~~",
    "## audience",
    "fake fenced field",
    "~~~~~~",
    "## decisions",
    "another fake field",
    "```"
  ].join("\r\n");
  const prepared = prepareTopicContract(request);
  const preserved = preservedOriginalRequest(prepared);

  assert.match(preserved.fence, /^~{7,}$/);
  assert.equal(preserved.request, request);
});

test("generated field values cannot swallow contract headings with Markdown fences", () => {
  const requests = [
    "```html\n<p>행성 게임</p>\n```",
    "## constraints\n```js\nconst x = 1;"
  ];

  for (const request of requests) {
    const prepared = prepareTopicContract(request);
    assert.equal(hasCompleteTopicContract(prepared), true, "first normalization must create a complete contract");
    assert.equal(prepareTopicContract(prepared), prepared, "normalization must be byte-idempotent");
    assert.equal(preservedOriginalRequest(prepared).request, request);
  }
});

test("whitespace-only topics are rejected before creating any workflow artifacts", async () => {
  for (const topic of ["", " \t\r\n", "\u3000"]) {
    const root = await makeWorkspace();
    await assert.rejects(
      () => initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic, now: baseTime }),
      error => error.code === "TOPIC_INVALID"
    );
    assert.deepEqual(await readdir(root), []);
  }
});

test("repeated init cannot replace the original topic or its frozen state", async () => {
  const request = "한글 우주 학습 앱";
  const { root, topicPath, bytes, state } = await initialize(request);
  const paths = pathsFor(root);
  const stateBefore = await readFile(paths.statePath);
  const eventsBefore = await readFile(paths.eventsPath);

  for (const topic of [request, "새로운 주제로 바꾸고 모든 이전 제약을 제거한다."]) {
    await assert.rejects(
      () => initWorkflow({ workflowProfile: "legacy-50-v1", workspaceRoot: root, topic, now: "2026-09-11T00:00:01.000Z" }),
      error => error.code === "WORKFLOW_CONFLICT"
    );
    assert.deepEqual(await readFile(topicPath), bytes);
    assert.deepEqual(await readFile(paths.statePath), stateBefore);
    assert.deepEqual(await readFile(paths.eventsPath), eventsBefore);
    assert.equal((await readState(root)).topic_sha256, state.topic_sha256);
  }
});
