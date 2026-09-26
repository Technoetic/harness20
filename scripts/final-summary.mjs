#!/usr/bin/env node
// Usage: node scripts/final-summary.mjs --workspace <project-root>
// Prints the step 50 completion report (docs/FINAL-SUMMARY.md) and writes the same bytes to
// step_archive/outputs/final-summary.md when step_archive/ exists. Exit 0 even when sources are
// missing: the report is not a gate. Exit 2 only for invalid flags, a workspace that is not a
// physical directory or an unexpected failure, with a generic diagnostic on stderr.
// Self-contained under scripts/: no codex/ import, so a hooks+scripts-only copy still runs it.
const write = (stream, text) => new Promise(resolve => { stream.write(text, () => resolve()); });

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--workspace') throw new Error('Invalid flags');
  const value = argv[1];
  if (typeof value !== 'string' || !value.trim() || value.startsWith('--') || value.includes('\0')) throw new Error('Invalid workspace');
  return value;
}

async function main() {
  const workspace = parseArgs(process.argv.slice(2));
  const { writeFinalSummary } = await import('./lib/final-summary.mjs');
  const { text } = await writeFinalSummary(workspace);
  await write(process.stdout, text);
}

main().catch(async () => {
  process.exitCode = 2;
  try { await write(process.stderr, `${JSON.stringify({ error: { code: 'FINAL_SUMMARY_FAILED', message: 'Final summary command failed' } })}\n`); }
  catch { /* A failed diagnostic stream must not expose a secondary exception. */ }
});
