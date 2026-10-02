import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { initWorkflow } from '../scripts/lib/workflow.mjs';
import { parseReceipt } from '../scripts/lib/receipts.mjs';
import { makeWorkspace } from './helpers/workspace.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));

function runPowerShell(args, options) {
  // GitHub Actions starts Node from pwsh; let Windows PowerShell rebuild its own module path.
  return spawnSync('powershell.exe', args, {
    ...options,
    env: Object.fromEntries(Object.entries(options.env ?? process.env)
      .filter(([key]) => key.toLowerCase() !== 'psmodulepath'))
  });
}

test('isolated packaged preflight validates both definitions and refuses missing shared dependencies or changed bodies', {
  skip: process.platform !== 'win32', timeout: 180000
}, async () => {
  const sandbox = await makeWorkspace(); // Existing helper guards cleanup beneath the temporary test root.
  const packaged = join(sandbox, 'package');
  for (const path of ['.codex-plugin', '.claude-plugin', 'codex', 'assets', 'hooks', 'scripts', 'docs']) {
    await cp(join(repo, path), join(packaged, path), {
      recursive: true, filter: path => !path.includes(`${join('codex', 'tests')}`)
    });
  }
  const smoke = () => {
    const result = runPowerShell(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      resolve(repo, 'codex/tests/install-smoke.ps1'), '-PluginRoot', packaged, '-Mode', 'Preflight'],
    { encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.ifError(result.error);
    return { exit: result.status, report: JSON.parse(result.stdout.trim()) };
  };
  const positive = smoke();
  assert.equal(positive.exit, 0, JSON.stringify(positive.report));
  assert.equal(positive.report.step_count, 36);
  assert.deepEqual(positive.report.workflow_profiles, { 'legacy-50-v1': 50, 'research-free-36-v1': 36 });
  assert.equal(positive.report.shared_dependencies_verified, true);

  const dependency = join(packaged, 'scripts/lib/json-io.mjs');
  const originalDependency = await readFile(dependency);
  await rm(dependency);
  const missing = smoke();
  assert.equal(missing.exit, 1);
  assert.equal(missing.report.passed, false);
  await writeFile(dependency, originalDependency);

  const body = join(packaged, 'assets/profiles/research-free-36-v1/steps/step017.md');
  await writeFile(body, Buffer.concat([await readFile(body), Buffer.from('\nChanged packaged body\n')]));
  const changed = smoke();
  assert.equal(changed.exit, 1);
  assert.equal(changed.report.error_code, 'STEP_VALIDATION_FAILED');
});

test('native smoke readers use the validated selected profile and reject count or receipt cross-binding', {
  skip: process.platform !== 'win32', timeout: 60000
}, async () => {
  const fixture = await makeWorkspace();
  const smokeSource = await readFile(join(repo, 'codex/tests/install-smoke.ps1'), 'utf8');
  const mainOffset = smokeSource.lastIndexOf('\ntry {');
  assert.ok(mainOffset > 0);
  const paths = [];
  for (const workflowProfile of ['research-free-36-v1', 'legacy-50-v1']) {
    const workspaceRoot = await makeWorkspace();
    const state = await initWorkflow({ workspaceRoot, workflowProfile, topic: 'Public profile smoke fixture' });
    const receipt = parseReceipt({ schema_version: state.schema_version,
      ...(state.schema_version === 2 ? { workflow_profile: workflowProfile } : {}),
      workflow_id: state.workflow_id, step: 1, attempt_id: 'smoke-attempt', provenance: 'codex-verified',
      completed_at: state.created_at, summary: 'Public first-step fixture',
      evidence: [{ acceptance_id: 'required-tool-inventory', kind: 'check', detail: 'Synthetic reader evidence', ok: true }] });
    await mkdir(join(workspaceRoot, 'step_archive/.harness50-codex/receipts'), { recursive: true });
    await writeFile(join(workspaceRoot, 'step_archive/.harness50-codex/receipts/step001.json'), JSON.stringify(receipt));
    paths.push(workspaceRoot.replaceAll("'", "''"));
  }
  const script = `${smokeSource.slice(0, mainOffset)}
$newRoot = '${paths[0]}'
$legacyRoot = '${paths[1]}'
foreach ($case in @(@{root=$newRoot;profile='research-free-36-v1';total=36}, @{root=$legacyRoot;profile='legacy-50-v1';total=50})) {
  $state = Read-StrictJson (Resolve-SafeFile $case.root 'step_archive/.harness50-codex/state.json' 'State') 'State'
  [void](Assert-State $state $case.root 'Reader')
  $receipts = @(Read-Receipts $case.root $state.workflow_id 'Reader' $case.profile)
  if ($receipts.Count -ne 1) { throw 'Expected one receipt' }
  $contract = Get-NativeStepContract $PluginRoot 17 $case.profile
  $expectedPath = if ($case.total -eq 36) { 'codex/assets/profiles/research-free-36-v1/steps/step017.md' } else { 'codex/assets/steps/step017.md' }
  if ($contract.target -cne $expectedPath) { throw 'Wrong selected contract' }
  $state.total_steps = if ($case.total -eq 36) { 50 } else { 36 }
  try { [void](Assert-State $state $case.root 'Reader'); throw 'Count mismatch accepted' } catch {
    if ($_.Exception.Data['SmokeCode'] -cne 'STATE_INVALID') { throw }
  }
}
$state = Read-StrictJson (Resolve-SafeFile $newRoot 'step_archive/.harness50-codex/state.json' 'State') 'State'
try { [void](Read-Receipts $newRoot $state.workflow_id 'Reader' 'legacy-50-v1'); throw 'Cross-profile receipt accepted' } catch {
  if ($_.Exception.Data['SmokeCode'] -cne 'SCHEMA_INVALID') { throw }
}
Write-Output 'selected profile readers verified'
`;
  const scriptPath = join(fixture, 'profile-readers.ps1');
  await writeFile(scriptPath, script, 'utf8');
  const result = runPowerShell(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PluginRoot', repo],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), 'selected profile readers verified');
});

test('PowerShell smoke children hash safely despite an inherited incompatible Utility module', {
  skip: process.platform !== 'win32', timeout: 30000
}, async () => {
  const fixture = await makeWorkspace();
  const moduleRoot = join(fixture, 'Microsoft.PowerShell.Utility', '99.0.0');
  await mkdir(moduleRoot, { recursive: true });
  await writeFile(join(moduleRoot, 'Microsoft.PowerShell.Utility.psd1'),
    "@{RootModule='Microsoft.PowerShell.Utility.psm1';ModuleVersion='99.0.0';GUID='84579e8f-e2da-44eb-a0b7-ff23c9d52767';FunctionsToExport=@('Get-FileHash');CmdletsToExport=@();AliasesToExport=@()}", 'utf8');
  await writeFile(join(moduleRoot, 'Microsoft.PowerShell.Utility.psm1'),
    "function Get-FileHash { throw 'INCOMPATIBLE_POWERSHELL_MODULE_FIXTURE' }; Export-ModuleMember -Function Get-FileHash", 'utf8');
  await writeFile(join(fixture, 'hash-source.txt'), 'abc', 'utf8');
  const smokeSource = await readFile(join(repo, 'codex/tests/install-smoke.ps1'), 'utf8');
  const stopOffset = smokeSource.indexOf('function Stop-Smoke {');
  const hashOffset = smokeSource.indexOf('function Get-Sha256 {');
  assert.ok(stopOffset > 0 && hashOffset > stopOffset);
  const scriptPath = join(fixture, 'hash-reader.ps1');
  // Exercise the smoke's actual hash reader before other Utility cmdlets preload a default.
  await writeFile(scriptPath, `$ErrorActionPreference = 'Stop'
${smokeSource.slice(stopOffset, smokeSource.indexOf('function Test-IsReparsePoint {', stopOffset))}
${smokeSource.slice(hashOffset, smokeSource.indexOf('function Assert-SingleLinkFile {', hashOffset))}
Write-Output (Get-Sha256 '${join(fixture, 'hash-source.txt').replaceAll("'", "''")}')
Write-Output $env:HARNESS50_FIXTURE
`, 'utf8');
  const environment = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath')),
    PsMoDuLePaTh: fixture,
    HARNESS50_FIXTURE: 'preserved'
  };
  const before = { ...environment };
  const result = runPowerShell(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { env: environment, encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'preserved'
  ]);
  assert.deepEqual(environment, before);
});
