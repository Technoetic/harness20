#!/usr/bin/env node
// No stdin commands or paths are accepted. Evaluation uses only public fixtures.
import { evaluateMemoryWorkflows } from './lib/memory-evaluation.mjs';

try {
  const args = process.argv.slice(2);
  let options = {};
  if (args.length !== 0) {
    if (args.length !== 2 || args[0] !== '--action-budget' || !/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(args[1])) {
      throw new Error('invalid');
    }
    options = { action_budget: Number(args[1]) };
  }
  process.stdout.write(`${JSON.stringify(evaluateMemoryWorkflows(options))}\n`);
} catch {
  // Never echo supplied flags, text or raw exceptions.
  process.stderr.write(`${JSON.stringify({ error: 'INVALID_EVALUATION_OPTIONS', message: 'Use no options or --action-budget with an integer from 1 to 32.' })}\n`);
  process.exitCode = 2;
}
