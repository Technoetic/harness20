#!/usr/bin/env node
import { readJsonInput, writeOutput } from './lib/json-io.mjs';

const COMMANDS = new Set(['failure', 'record', 'inspect', 'observe', 'retire']);
function parseArgs(argv) {
  const [command, ...args] = argv;
  if (!COMMANDS.has(command) || args.length !== 4) throw Error('Invalid command');
  const options = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!['--workspace', '--input'].includes(key) || Object.hasOwn(options, key) ||
        typeof value !== 'string' || !value.trim() || value.startsWith('--') || value.includes('\0')) {
      throw Error('Invalid flags');
    }
    options[key] = value;
  }
  if (!options['--workspace'] || options['--input'] !== '-') throw Error('Invalid flags');
  return { command, workspace: options['--workspace'] };
}
async function main() {
  const { command, workspace } = parseArgs(process.argv.slice(2));
  const input = await readJsonInput(process.stdin, 256 * 1024);
  const api = await import('./lib/workflow-memory.mjs');
  const handler = {failure: api.inspectFailure, record: api.recordLesson, inspect: api.inspectLessons,
    observe: api.observeLesson, retire: api.retireLesson}[command];
  const result = await handler(workspace, input);
  if (['invalid', 'unavailable'].includes(result.status)) throw Error('Command unavailable');
  await writeOutput(process.stdout, `${JSON.stringify(result)}\n`);
  process.exitCode = ['recorded', 'current', 'historical'].includes(result.status) ? 0 : 2;
}
main().catch(async error => {
  process.exitCode = 2;
  try {
    if (error?.code === 'MEMORY_UNSUPPORTED') {
      await writeOutput(process.stdout, `${JSON.stringify({status:'unsupported',advisory:true,code:'MEMORY_UNSUPPORTED'})}\n`);
      return;
    }
    await writeOutput(process.stderr, `${JSON.stringify({error:{
      code:'MEMORY_COMMAND_FAILED', message:'Workflow memory command failed'
    }})}\n`);
  } catch { /* Never expose a secondary output exception. */ }
});
