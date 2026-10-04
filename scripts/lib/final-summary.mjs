// Read-only completion report for the end of step 50 (docs/FINAL-SUMMARY.md). It never runs
// project commands, launches a browser, uses the network or rewrites evidence. Shared guarded metadata resolution
// selects the current profile and generation for evidence inspection. The only write is SUMMARY_PATH, and only inside an
// existing physical step_archive/. stdout and the file carry the same bytes, without any time.
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { physicalWorkspace, readSafe, writeSafe, sha256 } from './quality-files.mjs';
import { inspectQualityReport, REPORT_PATH as QUALITY } from './quality.mjs';
import { inspectBrowserOutput } from './final-output.mjs';
import { inspectFinalRegression, FINAL_REGRESSION_CHECKS } from './final-regression.mjs';
import { readRouteManifestBytes } from './route-contract.mjs';
import { readBrowserReportBytes } from './browser-report.mjs';
import { inspectQa } from './qa-report.mjs';
import { inspectJevJudgment } from './jev-judge.mjs';
import { inspectJevReview } from './jev-review.mjs';

import { workflowContext, evidenceDirectory } from './workflow-context.mjs';
import { LEGACY_WORKFLOW_PROFILE } from './workflow-profiles.mjs';

export const SUMMARY_PATH = 'step_archive/outputs/final-summary.md';
export const SUMMARY_HEADINGS = Object.freeze(['## 사용자 확인 필요', '## 변경', '## 발견']);

const HTML = 'dist/index.html';
const BROWSER = 'step_archive/outputs/browser-output.json';
const QA_DIR = 'step_archive/outputs/qa-reports';
const FINAL_POINTER = `${QA_DIR}/step050.latest.json`;
const TOPIC = 'step_archive/TOPIC/TOPIC.md';
const GATE = 'quality-gate.mjs --inspect-final';
const TOPIC_FIELDS = new Set(['topic', 'audience', 'interactive', 'real_world_apps', 'constraints', 'decisions']);
// The line webapp-trigger writes under its TOPIC decision heading; it records no decision.
const TRIGGER_BOILERPLATE = '자동 추출 항목이 모호하면 step001이 즉시 결정·기록 후 진행 (질문 금지)';
const DECISION = /결정\s*\/\s*사유/;
const QUOTED_DECISION = /["“'「`]\s*결정\s*\/\s*사유/;
const HEADING = /^\s{0,3}#{1,6}\s/;
// scripts/lib/qa-report.mjs SECRET plus JSON web tokens.
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]|\bbearer\s+\S+|\b(?:sk|ghp|github_pat)[_-][a-zA-Z0-9_-]{16,}|https?:\/\/[^\s/]+:[^\s/]+@|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.)/i;
// Control, line-separator and bidirectional-override characters never reach the report.
const UNSAFE = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const SOURCE_EXT = /\.(?:m?js|cjs|jsx|tsx?|css|scss|html|vue|svelte)$/i;
const SKIP_DIRS = new Set(['node_modules', 'step_archive', 'dist', 'coverage', 'test-results', 'playwright-report']);
const TOKEN = /^[a-z][a-z-]{0,31}$/;
const AXE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LIMITS = Object.freeze({ decisions: 10, deployments: 5, jevFiles: 64, jevLines: 10, unavailable: 10,
  routes: 12, axe: 10, depth: 8, walkFiles: 2000, walkBytes: 32 * 1024 * 1024, textBytes: 1024 * 1024,
  browserBytes: 1024 * 1024, excerpt: 80 });

const pad = step => String(step).padStart(3, '0');
const tick = value => `\`${String(value).replace(/`/g, '').replace(UNSAFE, '')}\``;
const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// Reason codes only: a raw error message could carry an absolute path.
function why(error) {
  if (error?.code === 'ENOENT') return '없음';
  return /size limit/i.test(error?.message ?? '') ? '크기 초과' : '형식 오류';
}

function excerpt(line) {
  if (SECRET.test(line)) return '(내용 생략: 비밀 형식)';
  let text = line.replace(/<!--|-->|\*\/|\/\*+/g, ' ').replace(/^\s*(?:\/\/+|#+|[-*+>]|\d+[.)])\s*/, '');
  text = text.replace(DECISION, ' ').replace(/^[\s*_:：\-—]+/, '').replace(/\*\*/g, '');
  text = text.replace(/[`|]/g, '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...text];
  if (chars.length === 0) return '(내용 없음)';
  return chars.length > LIMITS.excerpt ? `${chars.slice(0, LIMITS.excerpt).join('')}…` : text;
}

async function directoryState(path) {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink() ? 'yes' : 'invalid';
  } catch (error) { return ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'invalid'; }
}

async function listNames(root, relative, pattern) {
  const path = join(root, ...relative.split('/'));
  const state = await directoryState(path);
  if (state !== 'yes') return { state, names: [] };
  const entries = await readdir(path, { withFileTypes: true });
  return { state, names: entries.filter(entry => entry.isFile() && pattern.test(entry.name)).map(entry => entry.name).sort() };
}

async function readText(root, path) { return utf8(await readSafe(root, path, LIMITS.textBytes)); }

async function collectChanges(root, out) {
  let bytes;
  try { bytes = await readSafe(root, HTML); }
  catch (error) { out.changes.push(`- 확인 불가: ${tick(HTML)} (${why(error)})`); return null; }
  const digest = sha256(bytes);
  out.changes.push(`- 최종 HTML ${tick(HTML)} · ${bytes.length} bytes · SHA-256 ${tick(digest)}`);
  try {
    const routing = readRouteManifestBytes(bytes);
    out.changes.push(`- 라우팅 ${tick(routing.mode)} 모드 · 화면 ${routing.routes.length}개 · fallback ${tick(routing.fallback)}`);
    const shown = routing.routes.slice(0, LIMITS.routes).map(route => `${tick(route.id)} ${tick(route.path)}`);
    const rest = routing.routes.length - shown.length;
    out.changes.push(`- 화면 목록: ${shown.join(', ')}${rest > 0 ? ` 외 ${rest}개` : ''}`);
    return { digest, routing };
  } catch {
    out.changes.push(`- 확인 불가: ${tick(HTML)} 라우팅 manifest (형식 오류)`);
    return { digest, routing: null };
  }
}

// The same three read-only inspections as `quality-gate.mjs --inspect-final`.
async function collectGate(root, out, context) {
  const [quality, browser, regression] = await Promise.all([
    inspectQualityReport(root), inspectBrowserOutput(root), inspectFinalRegression(root, context.profile.id)]);
  const line = `quality=${quality.verdict} · browser=${browser.verdict} · regression=${regression.verdict}`;
  if (![quality, browser, regression].every(item => item.verdict === 'PASS')) {
    out.attention.push(`- 최종 게이트 미통과 ${line} ${tick(GATE)}`);
  }
  out.findings.push(`- 최종 게이트 ${line} ${tick(GATE)}`);
  if (quality.verdict === 'PASS') {
    const lowest = Math.min(...Object.values(quality.coverage.metrics));
    out.findings.push(`- 품질 측정 test·lint·typecheck·security 통과 · 커버리지 최저 ${lowest.toFixed(1)}% (기준 ${quality.coverage.minimum}%) ${tick(QUALITY)}`);
  }
}

async function collectDeployment(root, out, context) {
  const files = [];
  const start = context.profile.milestones.e2e;
  const final = context.profile.milestones.final;
  const reportPattern = new RegExp(`^step0(?:${Array.from({length: final - start + 1}, (_, i) => start + i).join('|')})_.+\\.md$`);
  for (const [dir, pattern] of [['step_archive', reportPattern], ['step_archive/outputs', new RegExp(`^step${pad(final)}_.+\\.md$`)]]) {
    const { names } = await listNames(root, dir, pattern);
    files.push(...names.map(name => `${dir}/${name}`));
  }
  if (!files.some(path => path.startsWith(`step_archive/step${pad(start)}_`))) {
    out.unavailable.push(`- 확인 불가: ${tick(`step_archive/step${pad(start)}_*.md`)} (없음)`);
  }
  const hits = [];
  for (const path of files) {
    let text;
    try { text = await readText(root, path); }
    catch (error) { out.unavailable.push(`- 확인 불가: ${tick(path)} (${why(error)})`); continue; }
    text.split(/\r?\n/).forEach((line, index) => {
      const match = /deployment-verification\s*:\s*`?\s*([A-Za-z-]{1,24})/i.exec(line);
      if (match) hits.push({ path, line: index + 1, value: match[1].toLowerCase() });
    });
  }
  const pending = hits.filter(hit => hit.value === 'pending');
  for (const hit of pending.slice(0, LIMITS.deployments)) out.attention.push(`- 배포 검증 대기(pending) ${tick(`${hit.path}:${hit.line}`)}`);
  if (pending.length > LIMITS.deployments) out.attention.push(`- 배포 검증 대기 외 ${pending.length - LIMITS.deployments}건 ${tick('step_archive/')}`);
  for (const hit of hits.filter(hit => hit.value !== 'pending').slice(0, LIMITS.deployments)) {
    out.changes.push(`- 배포 검증 기록 ${tick(hit.value)} ${tick(`${hit.path}:${hit.line}`)}`);
  }
}

async function collectBrowser(root, html, out) {
  let report;
  try {
    report = readBrowserReportBytes(await readSafe(root, BROWSER, LIMITS.browserBytes), html?.routing ?? undefined);
    if (!html || report.artifact_sha256 !== html.digest) throw Object.assign(new Error('not current'), { current: false });
  } catch (error) {
    out.attention.push(`- 확인 불가: ${tick(BROWSER)} (${error.current === false ? '현재 HTML 아님' : why(error)})`);
    return;
  }
  const views = [...report.viewports, ...report.compatibility.navigation_api_unavailable.viewports];
  const rules = [...new Set(views.flatMap(view => [...view.accessibility_incomplete,
    ...view.routes.flatMap(route => route.accessibility_incomplete ?? [])]))].filter(id => typeof id === 'string').sort();
  if (rules.length > 0) {
    const shown = rules.filter(id => AXE_ID.test(id)).slice(0, LIMITS.axe);
    const rest = rules.length - shown.length;
    out.attention.push(`- 접근성 자동 판정 미완료(axe incomplete) 규칙 ${rules.length}개${shown.length ? `: ${shown.map(tick).join(', ')}` : ''}${rest > 0 ? ` 외 ${rest}개` : ''} ${tick(BROWSER)}`);
  }
  const token = value => (typeof value === 'string' && TOKEN.test(value) ? value : null);
  const isolation = token(report.environment?.isolation), backend = token(report.environment?.backend);
  if (!isolation) out.attention.push(`- 확인 불가: ${tick(BROWSER)} environment.isolation (기록 없음)`);
  else if (isolation !== 'fresh-context') {
    out.attention.push(`- 브라우저 검증이 격리 컨텍스트가 아닌 곳에서 실행됨(isolation ${tick(isolation)}${backend ? `, backend ${tick(backend)}` : ''}) ${tick(BROWSER)}`);
  }
  out.findings.push(`- 브라우저 측정 ${backend ? `backend ${tick(backend)} · ` : ''}화면 ${report.routing.routes.length}개 × desktop·mobile × 2 시나리오 ${tick(BROWSER)}`);
}

async function collectQa(root, out, context) {
  const qaDir = evidenceDirectory(QA_DIR, context);
  const finalPointer = `${qaDir}/step${pad(context.profile.milestones.final)}.latest.json`;
  const state = await directoryState(join(root, ...qaDir.split('/')));
  if (state === 'invalid') { out.unavailable.push(`- 확인 불가: ${tick(`${qaDir}/`)} (형식 오류)`); return; }
  const sameAgent = [];
  let final = { status: 'missing' };
  for (let step = 1; state === 'yes' && step <= context.profile.stepCount; step++) {
    const result = await inspectQa(root, step, { workflowProfile: context.profile.id });
    if (step === context.profile.milestones.final) final = result;
    if (result.status === 'invalid') out.unavailable.push(`- 확인 불가: ${tick(`${qaDir}/step${pad(step)}.latest.json`)} (손상)`);
    else if (result.status !== 'missing' && result.report?.verifier?.mode === 'same-agent') {
      sameAgent.push(`step${pad(step)}${result.status === 'stale' ? '(이전 빌드)' : ''}`);
    }
  }
  if (sameAgent.length) out.attention.push(`- 독립 검증 아님(verifier.mode ${tick('same-agent')}): ${sameAgent.join(', ')} ${tick(`${qaDir}/`)}`);
  if (final.status === 'missing') { out.findings.push(`- 확인 불가: ${tick(finalPointer)} (없음)`); return; }
  if (final.status === 'invalid') return;
  out.findings.push(`- 최종 회귀 보고서 ${tick(finalPointer)} → ${tick(final.report_sha256.slice(0, 12))} ${final.status} · 검증자 ${tick(final.report.verifier.mode)}`);
  const byId = new Map(final.report.outcomes.map(outcome => [outcome.id, outcome]));
  const extra = final.report.outcomes.filter(outcome => !FINAL_REGRESSION_CHECKS.includes(outcome.id));
  if (extra.length) {
    const passed = extra.filter(outcome => outcome.status === 'pass').length;
    out.findings.push(`- 추가 검사 ${extra.length}개: pass ${passed} · 미통과 ${extra.length - passed} ${tick(finalPointer)}`);
  }
  out.table = ['| 회귀 검사 | 결과 | 증거 수 |', '|---|---|---|', ...FINAL_REGRESSION_CHECKS.map(id => {
    const outcome = byId.get(id);
    return `| ${tick(id)} | ${outcome ? outcome.status : '누락'} | ${outcome ? outcome.evidence.length : 0} |`;
  })];
}

// One line per (kind, step, input); a later current result for the same input hides an older
// failure. Rank: 0 reviewed (not shown), 1 needs review, 2 unverified, 3 stale.
async function collectJev(root, out, context) {
  const groups = new Map();
  const sources = [[evidenceDirectory('step_archive/outputs/jev-judgments', context), inspectJevJudgment, 'judge']];
  if (context.profile.id === LEGACY_WORKFLOW_PROFILE) sources.push(['step_archive/outputs/jev-reviews', inspectJevReview, 'review']);
  for (const [dir, inspect, kind] of sources) {
    const { state, names } = await listNames(root, dir, /^[a-f0-9]{64}\.json$/);
    if (state === 'missing') continue;
    if (state === 'invalid') { out.unavailable.push(`- 확인 불가: ${tick(`${dir}/`)} (형식 오류)`); continue; }
    if (names.length > LIMITS.jevFiles) out.unavailable.push(`- 확인 불가: ${tick(`${dir}/`)} ${names.length - LIMITS.jevFiles}개 미검사 (상한 ${LIMITS.jevFiles}개)`);
    let invalid = 0;
    for (const name of names.slice(0, LIMITS.jevFiles)) {
      const r = await inspect(root, `${dir}/${name}`);
      if (r.status === 'invalid') { invalid++; continue; }
      let rank, detail;
      if (r.status === 'stale') { rank = 3; detail = '입력 변경(stale)'; }
      else if (r.review_status === 'unverified') { rank = 2; detail = `미검증 ${tick(r.error_code)}`; }
      else if (kind === 'judge') {
        const abstain = r.results.filter((x, i) => x.choice === r.questions[i].abstain).length;
        const low = r.results.filter((x, i) => x.choice !== r.questions[i].abstain && x.confidence < r.min_confidence).length;
        rank = r.review_status === 'needs_review' ? 1 : 0; detail = `보류 ${abstain} · 낮은 확신 ${low}`;
      } else {
        const insufficient = r.results.filter(x => x.choice === 'insufficient_evidence').length;
        const unmet = r.results.filter(x => x.choice === 'unmet').length;
        rank = insufficient + unmet > 0 ? 1 : 0; detail = `근거 부족 ${insufficient} · 미충족 ${unmet}`;
      }
      const key = `${kind}:${r.step}:${r.input_hash ?? r.input_sha256}`;
      const previous = groups.get(key);
      if (!previous || rank < previous.rank) groups.set(key, { rank, step: r.step, dir, detail });
    }
    if (invalid) out.unavailable.push(`- 확인 불가: ${tick(`${dir}/`)} 손상 ${invalid}개`);
  }
  const lines = [...groups.values()].filter(group => group.rank > 0)
    .sort((a, b) => a.step - b.step || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
    .map(group => `- Jev 검토 필요 step${pad(group.step)}: ${group.detail} ${tick(`${group.dir}/`)}`);
  out.attention.push(...lines.slice(0, LIMITS.jevLines));
  if (lines.length > LIMITS.jevLines) out.attention.push(`- Jev 검토 필요 외 ${lines.length - LIMITS.jevLines}건 ${tick('step_archive/outputs/')}`);
}

async function collectTopic(root, out) {
  let text;
  try { text = await readText(root, TOPIC); }
  catch (error) { if (error.code !== 'ENOENT') out.unavailable.push(`- 확인 불가: ${tick(TOPIC)} (${why(error)})`); return; }
  text.split(/\r?\n/).forEach((line, index) => {
    const match = /^기본값으로 보완한 항목:\s*([a-z_, ]+?)\.(?:\s|$)/.exec(line);
    const fields = match ? match[1].split(',').map(value => value.trim()).filter(value => TOPIC_FIELDS.has(value)) : [];
    if (fields.length) out.attention.push(`- 사용자 미지정 항목 기본값 적용: ${fields.map(tick).join(', ')} ${tick(`${TOPIC}:${index + 1}`)}`);
  });
}

// A marker line, or up to five list items under a Markdown heading that carries the marker.
function decisionsIn(path, text) {
  const found = [];
  const lines = text.split(/\r?\n/);
  const markdown = /\.md$/i.test(path);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DECISION.test(line) || QUOTED_DECISION.test(line)) continue;
    if (markdown && HEADING.test(line)) {
      let taken = 0;
      for (let j = i + 1; j < lines.length && taken < 5; j++) {
        if (HEADING.test(lines[j])) break;
        const item = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(lines[j]);
        if (!item) { if (taken && !lines[j].trim()) break; continue; }
        if (item[1].trim() === TRIGGER_BOILERPLATE) continue;
        found.push({ path, line: j + 1, text: excerpt(lines[j]) });
        taken++;
      }
      continue;
    }
    found.push({ path, line: i + 1, text: excerpt(line) });
  }
  return found;
}

async function collectDecisions(root, out) {
  const paths = [];
  if ((await directoryState(join(root, 'step_archive', 'TOPIC'))) === 'yes') paths.push(TOPIC);
  for (const dir of ['step_archive', 'step_archive/outputs']) {
    const { names } = await listNames(root, dir, /^step\d{3}_.+\.md$/);
    paths.push(...names.map(name => `${dir}/${name}`));
  }
  paths.push('README.md');
  let files = 0, bytes = 0, limited = false;
  async function walk(dir, depth) {
    let entries;
    try { entries = (await readdir(dir ? join(root, ...dir.split('/')) : root, { withFileTypes: true })).sort(byName); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (depth >= LIMITS.depth) { limited = true; continue; }
        await walk(path, depth + 1);
        if (files > LIMITS.walkFiles) return;
      } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
        if (++files > LIMITS.walkFiles) { limited = true; return; }
        paths.push(path);
      }
    }
  }
  await walk('', 0);
  const found = [];
  for (const path of paths) {
    let data;
    try { data = await readSafe(root, path, LIMITS.textBytes); }
    catch (error) { if (why(error) === '크기 초과') limited = true; continue; }
    if ((bytes += data.length) > LIMITS.walkBytes) { limited = true; break; }
    let text;
    try { text = utf8(data); } catch { continue; }
    found.push(...decisionsIn(path, text));
  }
  for (const item of found.slice(0, LIMITS.decisions)) out.attention.push(`- 결정/사유 ${tick(`${item.path}:${item.line}`)} — ${item.text}`);
  if (found.length > LIMITS.decisions) out.attention.push(`- 결정/사유 외 ${found.length - LIMITS.decisions}건 (상한 ${LIMITS.decisions}건) ${tick('step_archive/')}`);
  if (limited) out.unavailable.push(`- 확인 불가: 결정/사유 검색 상한 도달(깊이 ${LIMITS.depth}, 파일 ${LIMITS.walkFiles}개, 합계 32 MiB, 파일당 1 MiB) ${tick('.')}`);
}

// A collector that fails unexpectedly becomes one 확인 불가 line instead of failing the report.
async function guarded(out, source, collect) {
  try { return await collect(); }
  catch { out.unavailable.push(`- 확인 불가: ${tick(source)} (형식 오류)`); return null; }
}

export function renderFinalSummary(out) {
  const unavailable = out.unavailable.slice(0, LIMITS.unavailable);
  if (out.unavailable.length > LIMITS.unavailable) unavailable.push(`- 확인 불가 외 ${out.unavailable.length - LIMITS.unavailable}건 ${tick('step_archive/')}`);
  const section = (heading, lines) => [heading, '', ...(lines.length ? lines : ['- 없음'])].join('\n');
  return [
    section(SUMMARY_HEADINGS[0], [...out.attention, ...unavailable]),
    section(SUMMARY_HEADINGS[1], out.changes),
    section(SUMMARY_HEADINGS[2], [...out.findings, ...(out.table ? ['', ...out.table] : [])])
  ].join('\n\n') + '\n';
}

export async function collectFinalSummary(workspaceRoot) {
  const root = await physicalWorkspace(workspaceRoot);
  const out = { attention: [], changes: [], findings: [], table: null, unavailable: [] };
  const archive = await directoryState(join(root, 'step_archive'));
  if (archive !== 'yes') out.unavailable.push(`- 확인 불가: ${tick('step_archive/')} (${archive === 'missing' ? '없음' : '형식 오류'})`);
  const html = await collectChanges(root, out);
  let context;
  try { context = await workflowContext(root); }
  catch { out.unavailable.push('- 확인 불가: workflow profile/generation (형식 오류)'); }
  if (context) await collectGate(root, out, context);
  if (archive === 'yes') {
    if (context) await guarded(out, 'step_archive/', () => collectDeployment(root, out, context));
    await guarded(out, BROWSER, () => collectBrowser(root, html, out));
    if (context) await guarded(out, `${QA_DIR}/`, () => collectQa(root, out, context));
    if (context) await guarded(out, 'step_archive/outputs/', () => collectJev(root, out, context));
    await guarded(out, TOPIC, () => collectTopic(root, out));
    await guarded(out, '.', () => collectDecisions(root, out));
  }
  return { root, archive: archive === 'yes', out };
}

export async function writeFinalSummary(workspaceRoot) {
  const { root, archive, out } = await collectFinalSummary(workspaceRoot);
  let text = renderFinalSummary(out), written = false;
  if (archive) {
    try { await writeSafe(root, SUMMARY_PATH, Buffer.from(text, 'utf8')); written = true; }
    catch { out.unavailable.unshift(`- 확인 불가: ${tick(SUMMARY_PATH)} (기록 실패)`); text = renderFinalSummary(out); }
  }
  return { text, written, path: SUMMARY_PATH };
}
