#!/usr/bin/env node
import { writeOutput } from './lib/json-io.mjs';
import { readJevAskInput, prepareJevAsk, runJevAsk } from './lib/jev-ask.mjs';

function parseArgs(argv) {
  const [command, ...args] = argv;
  if (!['prepare', 'run'].includes(command)) throw new Error('Invalid command');
  const options = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (Object.hasOwn(options, flag)) throw new Error('Duplicate flag');
    if (flag === '--allow-network' && command === 'run') options[flag] = true;
    else if (flag === '--input' && args[++i] === '-') options[flag] = '-';
    else throw new Error('Invalid flag');
  }
  if (options['--input'] !== '-' || (command === 'run' && options['--allow-network'] !== true)) throw new Error('Required flags missing');
  return command;
}

async function main() {
  // Parse before stdin; document content never grants network authorization.
  const command = parseArgs(process.argv.slice(2));
  const input = await readJevAskInput(process.stdin);
  const options = { apiKey: process.env.TYPESAFE_API_KEY };
  const result = command === 'prepare' ? await prepareJevAsk(input, options)
    : await runJevAsk(input, { ...options, allowNetwork: true });
  await writeOutput(process.stdout, `${JSON.stringify(result)}\n`);
  process.exitCode = ['prepared', 'reviewed'].includes(result.status) ? 0 : 2;
}

main().catch(async () => {
  process.exitCode = 2;
  try { await writeOutput(process.stderr, `${JSON.stringify({ error: {
    code: 'JEV_COMMAND_FAILED', message: 'Jev direct question command failed'
  } })}\n`); } catch { /* Never expose input or secondary exceptions. */ }
});
