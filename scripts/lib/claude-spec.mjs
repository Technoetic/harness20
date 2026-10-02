// Generated SPECs are advisory hints, never completion evidence. Old bytes remain retrievable.
import { open } from 'node:fs/promises';
import { readSafe, safePath, writeSafe, sha256 } from './quality-files.mjs';
import { workflowContext, recheckWorkflowContext } from './workflow-context.mjs';
import { claudeStepBody } from './claude-profile.mjs';

async function optionalRead(root, name) {
  try { return await readSafe(root, name); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function preserve(root, name, bytes) {
  const history = `step_archive/specs/history/${sha256(bytes)}/${name}`;
  const target = await safePath(root, history, { createParents: true });
  let handle;
  try { handle = await open(target, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await readSafe(root, history)).equals(bytes)) throw error;
    return;
  }
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  if (!(await readSafe(root, history)).equals(bytes)) throw new Error('SPEC history changed');
}
export async function publishProfileSpecs(root) {
  const context = await workflowContext(root);
  if (!context.generation) throw new Error('Legacy SPEC uses its original generator');
  const state = JSON.parse((await readSafe(root, 'step_archive/progress.json')).toString('utf8').replace(/^\uFEFF/, ''));
  const profile = context.profile;
  const targets = [...new Set([...state.completed_steps, state.current_step])].sort((a, b) => a - b);
  let count = 0;
  const binding = `workflow_profile: ${profile.id}\nworkflow_generation: ${context.generation}\n`;
  for (const step of targets) {
    if (count >= 10) break;
    const bodyPath = claudeStepBody(root, state, step);
    const name = `SPEC-${String(step).padStart(3, '0')}.md`;
    const destination = `step_archive/specs/${name}`;
    const previous = await optionalRead(root, destination);
    if (previous?.toString('utf8').startsWith(binding)) continue;
    const body = (await readSafe(root, bodyPath)).toString('utf8');
    const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? `Step ${step}`;
    const section = /^##\s+(?:실행 내용|개요|목적|Step-Back|검증)[\s\S]*?(?=^##\s+|^---|(?![\s\S]))/m.exec(body)?.[0];
    const text = `${binding}\n# ${name.slice(0, -3)} — ${title}\n\n원본: ${bodyPath}\n\n` +
      `## ACCEPTANCE\n\n본문의 필수 검사를 모두 수행한다. SPEC은 보조 지침이며 완료 권한이 없다.\n` +
      `품질 단계: ${profile.milestones.quality.join(' / ')}. 독립 QA: ${profile.milestones.independentQa.join(' / ')}.\n` +
      (step === profile.milestones.final ? `- ${step}단계 마무리: quality-gate.mjs --inspect-final 종료 코드 0 뒤 node "<plugin-root>/scripts/final-summary.mjs" --workspace "<project-root>"를 1회 실행하고 완료 줄 뒤에 세 제목(사용자 확인 필요 / 변경 / 발견)만 붙인다.\n` : '') +
      `\n## REFERENCE\n\n${section?.split('\n').slice(0, 30).join('\n') ?? '원본 본문을 직접 읽는다.'}\n\n## RUN-COMMAND\n\nRead ${bodyPath}\n`;
    if (previous) await preserve(root, name, previous);
    await recheckWorkflowContext(root, context);
    const current = await optionalRead(root, destination);
    if (previous ? !current?.equals(previous) : current !== null) throw new Error('SPEC alias changed during publication');
    await writeSafe(root, destination, text);
    count++;
  }
  return count;
}
