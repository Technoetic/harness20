// Hook input is data only. Never evaluate shell commands or submitted content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isActive, physical, within } from './harness-activity.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
// Execution-linked files: a later git operation, install, editor, CI run, agent session or
// user-approved command runs or follows them without anyone reading the edit. They keep the
// normal permission prompt in auto mode. The guard mode below does not deny them, so ordinary
// edits still go through once the user confirms.
const EXECUTION_LINKED = [
  /(^|\/)\.mcp\.json$/,
  /(^|\/)(claude|claude\.local|agents|agents\.override)\.md$/,
  /(^|\/)\.(husky|githooks|vscode|idea|devcontainer|cursor|circleci|buildkite|claude-plugin|codex-plugin)(\/|$)/,
  /(^|\/)\.github\/(workflows|actions)(\/|$)/,
  /(^|\/)(\.cursorrules|\.windsurfrules)$/,
  /(^|\/)\.github\/copilot-instructions\.md$/,
  /(^|\/)(\.pre-commit-config\.ya?ml|\.?lefthook(-local)?\.(ya?ml|json|toml)|\.lefthookrc|\.?simple-git-hooks\.(json|c?js)|\.lintstagedrc(\.[^/]*)?|lint-staged\.config\.[^/]+)$/,
  /(^|\/)(\.gitlab-ci\.ya?ml|azure-pipelines\.ya?ml|jenkinsfile|\.travis\.ya?ml|bitbucket-pipelines\.ya?ml)$/,
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.yarnrc(\.ya?ml)?|\.?pnpmfile\.c?js|bunfig\.toml|\.envrc|harness50\.quality\.json)$/,
  /(^|\/)node_modules(\/|$)/,
  /^step_archive\/tools(\/|$)/
];
// Project-relative, lower case, '/' separated, with any ':stream' suffix (NTFS alternate data
// stream) dropped from each component before matching.
function executionLinked(candidate, root) {
  const relative = path.relative(spelled(root), spelled(candidate)).replaceAll('\\', '/').toLowerCase()
    .split('/').map(part => part.replace(/:.*$/, '')).join('/');
  return EXECUTION_LINKED.some(pattern => pattern.test(relative));
}
// Active-state judgement lives in harness-activity.mjs (isActive). Any entry at the Codex state
// path makes it false there, even next to a stale or imported progress.json.
try {
  const event = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const root = physical(path.resolve(process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd()));
  const mode = process.argv[2];
  const edits = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
  if (mode === 'auto') {
    if (!isActive(root)) process.exit(0);
    // Shell commands and network fetches retain ordinary host permission checks. Bash and WebFetch
    // are never eligible here, and the auto-approve matcher in hooks/hooks.json leaves them out
    // too: widen both together or neither.
    if (event.tool_name === 'WebSearch') process.stdout.write('eligible');
    else if (edits.includes(event.tool_name)) {
      const candidate = canonical(event.tool_input?.file_path || event.tool_input?.notebook_path, root);
      if (within(candidate, root) && !sensitive(candidate) && singlyLinked(candidate) && candidate !== root &&
          !workflowState(candidate, root) && !executionLinked(candidate, root)) process.stdout.write('eligible');
    }
  } else if (mode === 'guard' && edits.includes(event.tool_name)) {
    const candidate = canonical(event.tool_input?.file_path || event.tool_input?.notebook_path, root);
    if (sensitive(candidate)) process.stdout.write('protected');
  }
} catch {
  // Invalid data, missing state, unavailable paths: no grant. Guard fails closed.
  if (process.argv[2] === 'guard') process.stdout.write('protected');
}
