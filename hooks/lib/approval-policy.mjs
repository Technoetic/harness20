// Hook input is data only. Never evaluate shell commands or submitted content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function physical(candidate) {
  try { return fs.realpathSync(candidate); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A dangling link is not an ordinary missing destination.
    if (fs.lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink()) throw error;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(physical(parent), path.basename(candidate));
  }
}
function canonical(value, root) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f]/.test(value)) throw Error('invalid path');
  let decoded = decodeURIComponent(value).replaceAll('\\', '/').replace(/^\/\/\?\//, '');
  decoded = decoded.split('/').map(part => part === '..' || part === '.' ? part : part.replace(/[. ]+$/, '')).join('/');
  if (/^[a-z]:[^/]/i.test(decoded)) throw Error('ambiguous drive-relative path');
  // Resolve links before consuming a following '..'. Lexically collapsing the
  // whole input first can hide a protected POSIX symlink destination.
  const parsed = path.parse(decoded);
  let candidate = physical(path.isAbsolute(decoded) ? parsed.root : root);
  for (const component of decoded.slice(parsed.root.length).split(/[\\/]+/)) {
    if (component) candidate = physical(path.resolve(candidate, component));
  }
  return candidate;
}
function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function singlyLinked(candidate) {
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  // realpath cannot distinguish aliases to the same inode. A protected file
  // may have a harmless-looking hard link, so retain normal permission checks.
  return !stat || (stat.isFile() && stat.nlink === 1);
}
function sensitive(candidate) {
  const p = candidate.replaceAll('\\', '/').toLowerCase();
  return within(candidate, physical(pluginRoot)) ||
    /(^|\/)harness50(?:\/[^/]+)?\/(hooks(?:\/|$)|\.claude-plugin(?:\/|$))/.test(p) ||
    /(^|\/)(\.claude|\.codex|\.git)(\/|$)/.test(p) ||
    /(^|\/)(\.ssh|\.gnupg|\.aws|\.azure|\.kube)(\/|$)/.test(p) ||
    /(^|\/)(\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|\.bashrc|\.bash_profile|\.zshrc|\.zprofile|\.profile|\.zshenv)$/.test(p) ||
    /(^|\/)(progra~\d+|window~\d+|system~\d+|admini~\d+|docume~\d+|users~\d+|appdat~\d+)(\/|$)/.test(p) ||
    /^\/(etc|var|boot)\//.test(p) || /\/(system32|windows|program files)\//.test(p) ||
    /\/\.config\/gcloud\//.test(p) || /\/\.docker\/config\.json$/.test(p);
}
// canonical() keeps each component as typed. Resolve case and 8.3 aliases of the existing
// prefix too, so a differently spelled path cannot reach the workflow state below.
function spelled(candidate) {
  try { return fs.realpathSync.native(candidate); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(spelled(parent), path.basename(candidate));
  }
}
// Claude progress.json and everything under step_archive/.harness50-codex/ steer the Stop gates.
// A Codex state.json there silences them, so edits to either never receive hook approval.
function workflowState(candidate, root) {
  const relative = path.relative(spelled(root), spelled(candidate)).replaceAll('\\', '/').toLowerCase();
  return /^step_archive(?::[^/]*)?\/(?:progress\.json(?::[^/]*)?$|\.harness50-codex(?::[^/]*)?(?:\/|$))/.test(relative);
}
// Any entry at the Codex state path, even a directory or link, means the Codex state manager owns
// the workspace. The Claude step hooks stand down there, and so does auto-approval, even next to a
// stale or imported progress.json.
function codexWorkspace(root) {
  return fs.lstatSync(path.join(root, 'step_archive', '.harness50-codex', 'state.json'), { throwIfNoEntry: false }) !== undefined;
}
function active(root) {
  if (codexWorkspace(root)) return false;
  const file = path.join(root, 'step_archive/progress.json');
  if (!within(physical(file), root) || !fs.statSync(file).isFile()) return false;
  const state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if ('paused' in state && state.paused !== false) return false;
  if ('status' in state && !['active', 'running', 'in_progress'].includes(state.status)) return false;
  if ('total_steps' in state && state.total_steps !== 50) return false;
  const done = state.completed_steps;
  return Array.isArray(done) && done.length < 50 && done.every((step, index) => step === index + 1) &&
    Number.isInteger(state.current_step) && state.current_step === done.length + 1;
}
try {
  const event = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const root = physical(path.resolve(process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd()));
  const mode = process.argv[2];
  const edits = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
  if (mode === 'auto') {
    if (!active(root)) process.exit(0);
    // Shell commands and network fetches retain ordinary host permission checks.
    if (event.tool_name === 'WebSearch') process.stdout.write('eligible');
    else if (edits.includes(event.tool_name)) {
      const candidate = canonical(event.tool_input?.file_path || event.tool_input?.notebook_path, root);
      if (within(candidate, root) && !sensitive(candidate) && singlyLinked(candidate) && candidate !== root &&
          !workflowState(candidate, root)) process.stdout.write('eligible');
    }
  } else if (mode === 'guard' && edits.includes(event.tool_name)) {
    const candidate = canonical(event.tool_input?.file_path || event.tool_input?.notebook_path, root);
    if (sensitive(candidate)) process.stdout.write('protected');
  }
} catch {
  // Invalid data, missing state, unavailable paths: no grant. Guard fails closed.
  if (process.argv[2] === 'guard') process.stdout.write('protected');
}
