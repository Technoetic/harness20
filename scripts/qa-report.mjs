#!/usr/bin/env node
import { readJsonInput, writeOutput } from './lib/json-io.mjs';

const COMMANDS = new Set(['snapshot', 'record', 'inspect']);
const INPUT_LIMIT = 64 * 1024;

function parseArgs(argv) {
  const [command, ...args] = argv;
  if (!COMMANDS.has(command) || args.length % 2 !== 0) throw new Error('Invalid command');
  const allowed = new Set(command === 'inspect' ? ['workspace', 'step'] : ['workspace', 'step', 'input']);
  const options = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag.startsWith('--') || !allowed.has(flag.slice(2)) || Object.hasOwn(options, flag.slice(2)) ||
        typeof value !== 'string' || !value.trim() || value.startsWith('--') || value.includes('\0')) {
      throw new Error('Invalid flags');
    }
    options[flag.slice(2)] = value;
  }
  if (Object.keys(options).length !== allowed.size || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(options.step) ||
      (command !== 'inspect' && options.input !== '-')) throw new Error('Required flags missing or invalid');
  return { command, workspace: options.workspace, step: Number(options.step) };
}

async function main() {
  const { command, workspace, step } = parseArgs(process.argv.slice(2));
  const input = command === 'inspect' ? undefined : await readJsonInput(process.stdin, INPUT_LIMIT);
  const { snapshotQa, recordQa, inspectQa } = await import('./lib/qa-report.mjs');
  const result = command === 'snapshot' ? await snapshotQa(workspace, step, input)
    : command === 'record' ? await recordQa(workspace, step, input)
    : await inspectQa(workspace, step);
  await writeOutput(process.stdout, `${JSON.stringify(result)}\n`);
  process.exitCode = command !== 'inspect' ? 0
    : result.status !== 'current' ? 2 : result.verdict === 'PASS' ? 0 : 1;
}

main().catch(async () => {
  process.exitCode = 2;
  try {
    await writeOutput(process.stderr, `${JSON.stringify({
      error: { code: 'QA_COMMAND_FAILED', message: 'QA report command failed' }
    })}\n`);
  } catch { /* A failed diagnostic stream must not expose a secondary exception. */ }
});
