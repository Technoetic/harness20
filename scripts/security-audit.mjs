#!/usr/bin/env node
// Release gate: audit installed-input provenance without installing or executing dependencies.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { physicalWorkspace, readSafe } from './lib/quality-files.mjs';
import { parseStrictJson } from './lib/strict-json.mjs';

// Changing a reviewed package requires a visible source review of its exact bytes,
// not synchronized edits of package.json and its lockfile.
const REVIEWED = new Map([
  ['axe-core',{version:'4.13.0',integrity:'sha512-UzGt8zg7Ny8djbYMhxl2zuEevVa7r2gJjYY5Lwr1xM7+XU2nd6CkIWFTVcCIbAP63vSz71NaVyyuSk9lHKcy0A=='}],
  ['@axe-core/playwright',{version:'4.13.0',integrity:'sha512-6YLx+kxXu5GJceG4ozFg+33a2EMTdjYwWGloJ3sb9Kta5pp+ZNS53uxGVog5JetIY8s++P5UrtX+cri+u0VAVg=='}],
  ['playwright',{version:'1.63.0',integrity:'sha512-+7ziBLidS4NaNCdt57SUDT+wYmmd5fmiQejUic/kb+YsYSCPyOOE9sebzMjNmQrsnNpDJqd4WHvV/8lfKfUDUg=='}],
  ['playwright-core',{version:'1.63.0',integrity:'sha512-rYCsBF/M5HjUch52bbtVONEFjv6Xu8sm8h72dNlR5bzIE1fvC/bxgspzkjSfU+MweEMmPM8KJebG6nnyxo5mCg=='}],
]);
const LIFECYCLE = new Set(['preinstall','install','postinstall','prepare','prepublish','prepublishOnly']);
const pinned = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
const graph=value=>JSON.stringify(Object.entries(value ?? {}).sort());
const GRAPHS = new Map([
  ['axe-core',{dependencies:{},peerDependencies:{}}],
  ['@axe-core/playwright',{dependencies:{'axe-core':'~4.13.0'},peerDependencies:{'playwright-core':'>= 1.0.0'}}],
  ['playwright',{dependencies:{'playwright-core':'1.63.0'},peerDependencies:{}}],
  ['playwright-core',{dependencies:{},peerDependencies:{}}],
]);
function fail() { throw Error('Dependency lock, integrity or lifecycle policy requires review'); }

export function auditDependencyLock(pkg,lock) {
  if (!pkg || !lock || lock.lockfileVersion !== 3 || !lock.packages || lock.name !== pkg.name || lock.version !== pkg.version
      || Object.keys(pkg.scripts ?? {}).some(name=>LIFECYCLE.has(name)||/^(?:pre|post)/.test(name))) fail();
  const entry=lock.packages[''];
  if (!entry || entry.name !== pkg.name || entry.version !== pkg.version
      || ['optionalDependencies','bundledDependencies','bundleDependencies','workspaces','overrides'].some(field=>Object.hasOwn(pkg,field)||Object.hasOwn(entry,field))) fail();
  const dependencies={...pkg.dependencies,...pkg.devDependencies};
  const locked={...entry.dependencies,...entry.devDependencies};
  if (JSON.stringify(Object.entries(dependencies).sort()) !== JSON.stringify(Object.entries(locked).sort())) fail();
  for(const [name,version] of Object.entries(dependencies)) {
    if(!REVIEWED.has(name) || !pinned(version) || lock.packages[`node_modules/${name}`]?.version !== version) fail();
  }
  let count=0;
  for(const [name,value] of Object.entries(lock.packages)) {
    if(!name)continue;
    const reviewed=REVIEWED.get(name.slice(13));
    if(!name.startsWith('node_modules/') || !reviewed || value.version !== reviewed.version || value.integrity !== reviewed.integrity || value.link || value.hasInstallScript)fail();
    const expectedGraph=GRAPHS.get(name.slice(13));
    if(graph(value.dependencies)!==graph(expectedGraph.dependencies)||graph(value.peerDependencies)!==graph(expectedGraph.peerDependencies)
        || Object.hasOwn(value,'optionalDependencies') || Object.hasOwn(value,'bundledDependencies') || Object.hasOwn(value,'bundleDependencies'))fail();
    let url;try{url=new URL(value.resolved);}catch{fail();}
    const packageName=name.slice(13),tarball=packageName.split('/').at(-1);
    if(url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash
      || decodeURIComponent(url.pathname) !== `/${packageName}/-/${tarball}-${value.version}.tgz`
      || typeof value.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value.integrity))fail();
    count++;
  }
  return {verdict:'PASS',packages:count,install_scripts:false,unreviewed_dependencies:false};
}

export async function auditSecurityInputs(root) {
  root=await physicalWorkspace(root);
  const reports=[];
  for(const folder of ['','browser-verifier/']) {
    const read=async name=>parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(await readSafe(root,folder+name,65536)));
    reports.push({path:folder || '.',...auditDependencyLock(await read('package.json'),await read('package-lock.json'))});
  }
  return {schema_version:1,verdict:'PASS',dependency_locks:reports,reference:'user-supplied OWASP LLM Top 10 2026',
    capability_boundary:{training:false,embeddings:false,vector_index:false,semantic_cache:false},
    note:'Dependency integrity is a release input gate, not vulnerability certification. Adding capabilities or dependencies requires review.'};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await auditSecurityInputs(fileURLToPath(new URL('../',import.meta.url))),null,2)); }
  catch { console.error('Harness20 security inputs failed review; release blocked.');process.exitCode=1; }
}
