#!/usr/bin/env node
import { readJsonInput, writeOutput } from '../codex/scripts/lib/json-io.mjs';

const COMMANDS = new Set(['prepare', 'run', 'inspect']);
const INPUT_LIMIT = 64 * 1024;

function parseArgs(argv) {
  const [command, ...args] = argv;
  if (!COMMANDS.has(command)) throw new Error('Invalid command');
  const allowed = new Set(command === 'inspect' ? ['workspace', 'report'] : ['workspace', 'input']);
  const options = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const name = flag.startsWith('--') ? flag.slice(2) : '';
    if (Object.hasOwn(options, name)) throw new Error('Duplicate flag');
    if (name === 'allow-network' && command === 'run') {
      options[name] = true;
      continue;
    }
    if (!allowed.has(name)) throw new Error('Invalid flag');
    const value = args[++i];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--') || value.includes('\0')) {
      throw new Error('Invalid value');
    }
    options[name] = value;
  }
  if ([...allowed].some(name => !Object.hasOwn(options, name)) ||
      (command !== 'inspect' && options.input !== '-') ||
      (command === 'run' && options['allow-network'] !== true)) throw new Error('Required flags missing');
  return { command, workspace: options.workspace, report: options.report };
}

async function main() {
  // Parse before reading stdin: network opt-in can never be supplied by document content.
  const { command, workspace, report } = parseArgs(process.argv.slice(2));
  const input = command === 'inspect' ? undefined : await readJsonInput(process.stdin, INPUT_LIMIT);
  const { prepareJevReview, runJevReview, inspectJevReview } = await import('./lib/jev-review.mjs');
  const result = command === 'prepare' ? await prepareJevReview(workspace, input)
    : command === 'run' ? await runJevReview(workspace, input, {
      allowNetwork: true, apiKey: process.env.TYPESAFE_API_KEY
    })
    : await inspectJevReview(workspace, report);
  await writeOutput(process.stdout, `${JSON.stringify(result)}\n`);
  process.exitCode = result.status === 'prepared' || result.status === 'reviewed' ||
    (result.status === 'current' && result.review_status === 'reviewed') ? 0 : 2;
}

main().catch(async () => {
  process.exitCode = 2;
  try {
    await writeOutput(process.stderr, `${JSON.stringify({
      error: { code: 'JEV_COMMAND_FAILED', message: 'Jev review command failed' }
    })}\n`);
  } catch { /* Diagnostic failures must not expose input or secondary exceptions. */ }
});
