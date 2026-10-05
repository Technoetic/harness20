import { mkdtempSync, rmSync } from 'node:fs';
import { after } from 'node:test';
import { tmpdir } from 'node:os';
// The step 50 completion report (scripts/final-summary.mjs, docs/FINAL-SUMMARY.md): three fixed
// headings, read-only sources, one write, generic CLI failures and the documents that call it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeWorkspace, makeDirectoryLink } from './helpers/workspace.mjs';
import { prepareQuality } from './helpers/completion-quality.mjs';
import { completionHtml, passingBrowserReport } from './helpers/routing.mjs';
import { snapshotQa, recordQa } from '../../scripts/lib/qa-report.mjs';
import { runJevJudgment } from '../../scripts/lib/jev-judge.mjs';
import { runJevReview } from '../../scripts/lib/jev-review.mjs';
import { sha256 } from '../../scripts/lib/quality-files.mjs';
import { writeFinalSummary, SUMMARY_PATH, SUMMARY_HEADINGS } from '../../scripts/lib/final-summary.mjs';
import { inspectFinalRegression, FINAL_REGRESSION_CHECKS } from '../../scripts/lib/final-regression.mjs';
import { inspectBrowserOutput } from '../../scripts/lib/final-output.mjs';
import { inspectQualityReport } from '../../scripts/lib/quality.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(repo, 'scripts', 'final-summary.mjs');
// The completion patterns of step-progress-writer (.ps1 patternA/patternB).
const WRITER = [/^\s*[✅→\-*\s]*Step\s+(\d{1,3})\s*\/\s*(\d{1,3})\s*완료/i, /^\s*[✅→\-*\s]*Step\s+(\d{1,3})\s+완료/i];
const FAILED = { error: { code: 'FINAL_SUMMARY_FAILED', message: 'Final summary command failed' } };

const runCli = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 60000 });
const section = (text, heading) => text.split(`${heading}\n`)[1].split('\n## ')[0];
const noWriterMatch = text => {
  for (const line of text.split('\n')) for (const pattern of WRITER) assert.doesNotMatch(line, pattern);
};

async function recordFinal(root, mode = 'independent') {
  const checks = FINAL_REGRESSION_CHECKS.map(id => ({ id, requirement: `Full final ${id} matrix.` }));
  const snapshot = await snapshotQa(root, 50, { artifacts: ['dist/index.html'], checks });
  await writeFile(join(root, 'step_archive/outputs/final-matrix.json'), '{"fixture":true}');
  return recordQa(root, 50, { snapshot_id: snapshot.snapshot_id, verifier: { id: 'fixture-reviewer', mode },
    outcomes: FINAL_REGRESSION_CHECKS.map(id => ({ id, status: 'pass', observation: `Observed ${id}.`,
      evidence_paths: ['step_archive/outputs/final-matrix.json'], next_check: '' })),
    next_actions: [] });
}

// Write order matters: the quality fingerprint covers everything outside step_archive (dist
// included), so dist and every source file come before prepareQuality.
async function completed({ sources = {}, browser = report => report, mode = 'independent',
  step045 = 'deployment-verification: verified\n' } = {}) {
  const root = await makeWorkspace();
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'step_archive/outputs'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), completionHtml);
  for (const [path, text] of Object.entries(sources)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  }
  await prepareQuality(root);
  const report = browser({ ...passingBrowserReport(sha256(Buffer.from(completionHtml))),
    environment: { backend: 'playwright', isolation: 'fresh-context' } });
  await writeFile(join(root, 'step_archive/outputs/browser-output.json'), JSON.stringify(report));
  if (step045 !== null) await writeFile(join(root, 'step_archive/step045_e2e테스트결과.md'), step045);
  await recordFinal(root, mode);
  return root;
}

// Relative path → SHA-256 of every file below root.
async function tree(root, dir = '') {
  const files = {};
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await tree(root, path));
    else files[path] = sha256(await readFile(join(root, path)));
  }
  return files;
}

const judgeInput = (step, path, excerpt) => ({ schema_version: 1, step, sources: [{ path, excerpt }],
  questions: [{ id: 'claim', instructions: 'Does the selected evidence support the claim?',
    choices: { supported: 'The claim has direct support.', unsupported: 'The claim is contradicted.',
      unknown: 'The supplied evidence is insufficient.' }, abstain: 'unknown' }] });
const judgeAnswer = (choice, confidence) => ({ model: 'jev-1.13.0', answers: { claim: { type: 'choice', choice,
  probabilities: { supported: .1, unsupported: .1, unknown: .1, [choice]: .8 }, confidence } },
  usage: { input_tokens: 1, output_tokens: 1 } });
const budgetFixture = mkdtempSync(join(tmpdir(), 'harness36-jev-summary-budget-'));
after(() => rmSync(budgetFixture, { recursive: true, force: true }));
const answering = value => ({ allowNetwork: true, budgetRoot: mkdtempSync(join(budgetFixture, 'call-')), apiKey: 'synthetic-judgment-key-only',
  fetchImpl: async () => new Response(JSON.stringify(value), { status: 200 }) });

test('T1 complete workspace: three fixed headings, stdout equals the file, deterministic, evidence unchanged', async () => {
  const root = await completed();
  const before = await tree(root);
  const first = await writeFinalSummary(root);
  assert.equal(first.written, true);
  assert.equal(first.path, SUMMARY_PATH);
  assert.deepEqual(first.text.match(/^## .+$/gm), [...SUMMARY_HEADINGS]);
  assert.equal(await readFile(join(root, SUMMARY_PATH), 'utf8'), first.text);
  assert.equal(section(first.text, '## 사용자 확인 필요'), '\n- 없음\n');
  const changes = section(first.text, '## 변경');
  assert.ok(changes.includes(`SHA-256 \`${sha256(Buffer.from(completionHtml))}\``), changes);
  assert.match(changes, /`hash` 모드 · 화면 1개/);
  assert.match(changes, /배포 검증 기록 `verified` `step_archive\/step045_e2e테스트결과\.md:1`/);
  const findings = section(first.text, '## 발견');
  assert.match(findings, /최종 게이트 quality=PASS · browser=PASS · regression=PASS/);
  for (const id of FINAL_REGRESSION_CHECKS) assert.ok(findings.includes(`| \`${id}\` | pass | 1 |`), findings);

  const run = runCli(['--workspace', root]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, first.text);
  assert.equal(run.stdout, await readFile(join(root, SUMMARY_PATH), 'utf8'));
  assert.equal((await writeFinalSummary(root)).text, first.text);
  noWriterMatch(first.text);

  assert.equal((await inspectQualityReport(root)).verdict, 'PASS');
  assert.equal((await inspectBrowserOutput(root)).verdict, 'PASS');
  assert.equal((await inspectFinalRegression(root)).verdict, 'PASS');
  const after = await tree(root);
  assert.equal(after[SUMMARY_PATH], sha256(Buffer.from(first.text)));
  delete after[SUMMARY_PATH];
  assert.deepEqual(after, before);
});

test('T2 attention: pending deployment, axe incomplete, shared profile, same-agent, Jev, defaults, decisions', async () => {
  const decisions = Array.from({ length: 12 }, (_, i) => `// 결정/사유: 선택 ${i} — 이유 ${i}`).join('\n');
  const root = await completed({ mode: 'same-agent',
    sources: { 'README.md': '# App\n<!-- 결정/사유: hash 라우팅 — 파일 직접 열기 지원 -->\n',
      'src/0-secret.js': '// 결정/사유: api_key=abcdefghijklmnop\n', 'src/app.js': `${decisions}\n` },
    step045: '# E2E\n\n`deployment-verification: pending` 배포 대상 미승인\n',
    browser: report => {
      report.environment = { backend: 'aside', isolation: 'shared-profile' };
      report.viewports[0].accessibility_incomplete = ['color-contrast'];
      report.viewports[0].routes[0].accessibility_incomplete = ['color-contrast'];
      return report;
    } });
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), '# t\n\n## initialization_notes\n\n기본값으로 보완한 항목: audience, interactive. 원문의 명시 조건이 기본값보다 우선한다.\n\n## 결정/사유 (NEW-WORK-규칙 3번)\n\n- 자동 추출 항목이 모호하면 step001이 즉시 결정·기록 후 진행 (질문 금지)\n');
  await writeFile(join(root, 'step_archive/step025_기획.md'), '# 기획\n\n## 결정/사유\n\n- 색상 토큰 A 선택 — 대비 확보\n- Step 49 완료 표기 인용\n');
  await mkdir(join(root, 'step_archive/archived'), { recursive: true });
  await writeFile(join(root, 'step_archive/archived/step001.md'), '모호한 항목은 결정/사유 줄에 남긴다\n');
  await writeFile(join(root, 'step_archive/step016_claims.md'), 'The proposal includes a year filter.\n');
  const input = judgeInput(16, 'step_archive/step016_claims.md', 'The proposal includes a year filter.');
  assert.equal((await runJevJudgment(root, input)).error_code, 'network_disabled');
  assert.equal((await runJevJudgment(root, input, answering(judgeAnswer('unknown', .9)))).status, 'needs_review');
  await writeFile(join(root, 'step_archive/outputs/jev-judgments', `${'0'.repeat(64)}.json`), '{}');

  const { text } = await writeFinalSummary(root);
  const attention = section(text, '## 사용자 확인 필요');
  assert.match(attention, /배포 검증 대기\(pending\) `step_archive\/step045_e2e테스트결과\.md:3`/);
  assert.match(attention, /axe incomplete\) 규칙 1개: `color-contrast` `/);
  assert.match(attention, /isolation `shared-profile`, backend `aside`/);
  assert.match(attention, /same-agent`\): step050 `/);
  assert.match(attention, /Jev 검토 필요 step016: 보류 1 · 낮은 확신 0 `step_archive\/outputs\/jev-judgments\/`/);
  assert.doesNotMatch(attention, /미검증 `network_disabled`/);
  assert.match(attention, /사용자 미지정 항목 기본값 적용: `audience`, `interactive` `step_archive\/TOPIC\/TOPIC\.md:5`/);
  assert.match(attention, /`step_archive\/step025_기획\.md:5` — 색상 토큰 A 선택 — 대비 확보/);
  assert.match(attention, /`README\.md:2` — hash 라우팅 — 파일 직접 열기 지원/);
  assert.match(attention, /`src\/0-secret\.js:1` — \(내용 생략: 비밀 형식\)/);
  assert.match(attention, /결정\/사유 외 6건 \(상한 10건\)/);
  assert.match(attention, /`step_archive\/outputs\/jev-judgments\/` 손상 1개/);
  assert.doesNotMatch(text, /abcdefghijklmnop/);
  assert.doesNotMatch(text, /자동 추출 항목이 모호하면/);
  assert.doesNotMatch(text, /archived\/step001/);
  // Fixed order: deployment, accessibility, isolation, verifier, Jev, TOPIC defaults, decisions.
  const order = ['배포 검증 대기', '접근성 자동 판정', '격리 컨텍스트', '독립 검증 아님', 'Jev 검토 필요', '기본값 적용', '- 결정/사유 `'];
  const positions = order.map(label => attention.indexOf(label));
  assert.ok(positions.every(position => position >= 0), positions.join(','));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  noWriterMatch(text);
});

test('T3 Jev: stale input, missing key, a later reviewed run and an unverified step 25 review', async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, 'step_archive/TOPIC'), { recursive: true });
  const claim = 'The proposal includes a year filter.';
  for (const step of ['016', '024', '030']) await writeFile(join(root, `step_archive/step${step}_claims.md`), `${claim}\n`);
  const first = judgeInput(16, 'step_archive/step016_claims.md', claim);
  assert.equal((await runJevJudgment(root, first)).status, 'unverified');
  assert.equal((await runJevJudgment(root, first, answering(judgeAnswer('supported', .95)))).status, 'reviewed');
  assert.equal((await runJevJudgment(root, judgeInput(24, 'step_archive/step024_claims.md', claim), { allowNetwork: true })).error_code, 'missing_api_key');
  await runJevJudgment(root, judgeInput(30, 'step_archive/step030_claims.md', claim));
  await writeFile(join(root, 'step_archive/step030_claims.md'), `${claim}\nEdited after the judgment.\n`);
  const topic = 'The page must provide a year filter.';
  await writeFile(join(root, 'step_archive/TOPIC/TOPIC.md'), `Unselected topic context.\n${topic}\n`);
  await writeFile(join(root, 'step_archive/step025_planning_chunk1.md'), 'A year filter is provided above the chart.\n');
  const review = await runJevReview(root, { schema_version: 1, topic_excerpt: topic,
    planning: [{ path: 'step_archive/step025_planning_chunk1.md', excerpt: 'A year filter is provided above the chart.' }],
    requirements: [{ id: 'year-filter', text: topic }] });
  assert.equal(review.status, 'unverified');

  const { text } = await writeFinalSummary(root);
  const attention = section(text, '## 사용자 확인 필요');
  assert.doesNotMatch(attention, /step016/);
  assert.match(attention, /- Jev 검토 필요 step024: 미검증 `missing_api_key` `step_archive\/outputs\/jev-judgments\/`/);
  assert.match(attention, /- Jev 검토 필요 step025: 미검증 `network_disabled` `step_archive\/outputs\/jev-reviews\/`/);
  assert.match(attention, /- Jev 검토 필요 step030: 입력 변경\(stale\) `step_archive\/outputs\/jev-judgments\/`/);
  const jev = attention.split('\n').filter(line => line.startsWith('- Jev'));
  assert.deepEqual(jev.map(line => /step(\d{3})/.exec(line)[1]), ['024', '025', '030']);
});

test('T4 missing inputs report 확인 불가 without failing; no step_archive means no write', async () => {
  const empty = await makeWorkspace();
  const run = runCli(['--workspace', empty]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.match(/^## .+$/gm), [...SUMMARY_HEADINGS]);
  assert.match(run.stdout, /- 확인 불가: `step_archive\/` \(없음\)/);
  assert.match(run.stdout, /- 확인 불가: `dist\/index\.html` \(없음\)/);
  assert.equal(existsSync(join(empty, 'step_archive')), false);
  assert.deepEqual(await readdir(empty), []);

  const archiveOnly = await makeWorkspace();
  await mkdir(join(archiveOnly, 'step_archive'));
  const result = await writeFinalSummary(archiveOnly);
  assert.equal(result.written, true);
  assert.match(result.text, /- 최종 게이트 미통과 quality=INCOMPLETE · browser=FAIL · regression=INCOMPLETE/);
  assert.match(section(result.text, '## 발견'), /- 확인 불가: `step_archive\/outputs\/qa-reports\/step050\.latest\.json` \(없음\)/);
  assert.match(result.text, /- 확인 불가: `step_archive\/step045_\*\.md` \(없음\)/);
  assert.match(result.text, /- 확인 불가: `step_archive\/outputs\/browser-output\.json` \(없음\)/);
  assert.equal(await readFile(join(archiveOnly, SUMMARY_PATH), 'utf8'), result.text);
});

test('T5 corrupt inputs: browser JSON, older HTML, QA pointer, manifest, TOPIC bytes and unwritable outputs', async () => {
  const root = await completed();
  await writeFile(join(root, 'step_archive/outputs/browser-output.json'), '{not json');
  await writeFile(join(root, 'step_archive/outputs/qa-reports/step046.latest.json'), 'garbage');
  const { text } = await writeFinalSummary(root);
  assert.match(text, /- 확인 불가: `step_archive\/outputs\/browser-output\.json` \(형식 오류\)/);
  assert.match(text, /- 확인 불가: `step_archive\/outputs\/qa-reports\/step046\.latest\.json` \(손상\)/);
  assert.match(text, /- 최종 게이트 미통과 quality=PASS · browser=FAIL · regression=PASS/);

  const older = { ...passingBrowserReport('b'.repeat(64)), environment: { backend: 'playwright', isolation: 'fresh-context' } };
  await writeFile(join(root, 'step_archive/outputs/browser-output.json'), JSON.stringify(older));
  assert.match((await writeFinalSummary(root)).text, /- 확인 불가: `step_archive\/outputs\/browser-output\.json` \(현재 HTML 아님\)/);

  const bare = await makeWorkspace();
  await mkdir(join(bare, 'dist'));
  await mkdir(join(bare, 'step_archive/TOPIC'), { recursive: true });
  await writeFile(join(bare, 'dist/index.html'), '<html><body>x</body></html>');
  await writeFile(join(bare, 'step_archive/TOPIC/TOPIC.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  await writeFile(join(bare, 'step_archive/outputs'), 'not a directory');
  const broken = await writeFinalSummary(bare);
  assert.equal(broken.written, false);
  assert.match(broken.text, /- 최종 HTML `dist\/index\.html` · 27 bytes · SHA-256 `[a-f0-9]{64}`/);
  assert.match(broken.text, /- 확인 불가: `dist\/index\.html` 라우팅 manifest \(형식 오류\)/);
  assert.match(broken.text, /- 확인 불가: `step_archive\/TOPIC\/TOPIC\.md` \(형식 오류\)/);
  assert.match(broken.text, /- 확인 불가: `step_archive\/outputs\/final-summary\.md` \(기록 실패\)/);
  assert.equal(await readFile(join(bare, 'step_archive/outputs'), 'utf8'), 'not a directory');

  const linked = await makeWorkspace();
  const target = await makeWorkspace();
  await mkdir(join(linked, 'step_archive'));
  await makeDirectoryLink(target, join(linked, 'step_archive/outputs'));
  const aliased = await writeFinalSummary(linked);
  assert.equal(aliased.written, false);
  assert.match(aliased.text, /\(기록 실패\)/);
  assert.deepEqual(await readdir(target), []);
});

test('T6 CLI rejects invalid invocation with one generic diagnostic', async () => {
  const root = await makeWorkspace();
  for (const args of [[], ['--workspace'], ['--workspace', '--x'], ['--workspace', ''], ['--root', root],
    ['--workspace', root, '--extra', 'x'], ['--workspace', join(root, 'missing')]]) {
    const run = runCli(args);
    assert.equal(run.status, 2, JSON.stringify(args));
    assert.equal(run.stdout, '');
    assert.deepEqual(JSON.parse(run.stderr), FAILED);
    assert.ok(!run.stderr.includes(root), 'the diagnostic must not echo a path');
  }
});

test('T7 the rules, /webapp and the Codex skill call the summary with the fixed headings; the module stays read-only', () => {
  const text = file => readFileSync(join(repo, file), 'utf8');
  for (const file of ['skills/harness-rules/SKILL.md', 'commands/webapp.md', 'codex/skills/webapp/SKILL.md']) {
    const source = text(file);
    assert.ok(source.includes('final-summary.mjs'), file);
    const positions = SUMMARY_HEADINGS.map(heading => source.indexOf(`\`${heading}\``));
    assert.ok(positions.every(position => position >= 0), `${file}: ${positions}`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, file);
  }
  assert.ok(text('skills/harness-rules/SKILL.md').includes('Step 050/50 완료'));
  assert.ok(text('codex/skills/webapp/SKILL.md').includes('- Shared final summary: `../../../scripts/final-summary.mjs`'));
  for (const file of ['scripts/lib/final-summary.mjs', 'scripts/final-summary.mjs']) {
    const code = text(file).split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.doesNotMatch(code, /progress\.json|\.harness50-codex|child_process|fetch\(|codex\//, file);
  }
});
