import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
test('release validation explicitly runs the supplied OWASP dependency gate', async () => {
  const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  assert.equal(pkg.scripts['verify:security'], 'node scripts/security-audit.mjs');
  const ci=await readFile(new URL('.github/workflows/test.yml',root),'utf8');
  assert.ok(ci.includes('npm --ignore-scripts run verify:security'));
});

test('dependency audit rejects drifting versions, untrusted tarballs and install hooks', async () => {
  const {auditDependencyLock}=await import('../../scripts/security-audit.mjs');
  const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  const lock=JSON.parse(await readFile(new URL('package-lock.json',root),'utf8'));
  assert.equal(auditDependencyLock(pkg,lock).verdict,'PASS');
  for (const mutate of [
    (p,l)=>{p.devDependencies['axe-core']='^4.13.0';},
    (p,l)=>{l.packages['node_modules/axe-core'].resolved='https://evil.example/axe.tgz';},
    (p,l)=>{delete l.packages['node_modules/axe-core'].integrity;},
    (p,l)=>{l.packages['node_modules/axe-core'].hasInstallScript=true;},
    (p,l)=>{p.scripts.postinstall='node malicious.js';},
    (p,l)=>{l.packages['node_modules/unreviewed']={...l.packages['node_modules/axe-core']};},
    (p,l)=>{l.packages['node_modules/axe-core'].version='4.14.0';},
    (p,l)=>{p.devDependencies['axe-core']='99.0.0';l.packages[''].devDependencies['axe-core']='99.0.0';Object.assign(l.packages['node_modules/axe-core'],{version:'99.0.0',resolved:'https://registry.npmjs.org/axe-core/-/axe-core-99.0.0.tgz',integrity:'sha512-'+ 'A'.repeat(86)+'=='});},
    (p,l)=>{p.optionalDependencies={'unreviewed-loader':'1.0.0'};l.packages[''].optionalDependencies={...p.optionalDependencies};},
    (p,l)=>{l.packages['node_modules/axe-core'].dependencies={'unreviewed-loader':'1.0.0'};},
    (p,l)=>{p.scripts['preverify:security']='node unreviewed-exfiltration.mjs';},
  ]) {
    const p=structuredClone(pkg),l=structuredClone(lock);mutate(p,l);
    assert.throws(()=>auditDependencyLock(p,l),/dependency|lock|lifecycle|integrity|review/i);
  }
});
