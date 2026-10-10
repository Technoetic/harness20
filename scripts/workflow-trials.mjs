#!/usr/bin/env node
import { readJsonInput, writeOutput } from './lib/json-io.mjs';
import { prepareTrial, inspectTrial, recordTrial, compareTrials, exportTrace } from './lib/workflow-trials.mjs';

const operations={prepare:prepareTrial,inspect:inspectTrial,record:recordTrial,compare:compareTrials,trace:exportTrace};
async function main() {
  const [command,...args]=process.argv.slice(2),options=Object.create(null);
  if(!Object.hasOwn(operations,command)||args.length!==4)throw Error('Invalid command');
  for(let i=0;i<args.length;i+=2) {
    const flag=args[i],value=args[i+1];
    if(!['--workspace','--input'].includes(flag)||Object.hasOwn(options,flag)||!value?.trim()||value.startsWith('--')||value.includes('\0'))
      throw Error('Invalid flags');
    options[flag]=value;
  }
  if(!options['--workspace']||options['--input']!=='-')throw Error('Missing flags');
  const input=await readJsonInput(process.stdin,64*1024),result=await operations[command](options['--workspace'],input);
  await writeOutput(process.stdout,`${JSON.stringify(result)}\n`);
  process.exitCode=['hold','stale','unsupported','unavailable'].includes(result.status)?2:0;
}
main().catch(async()=>{
  process.exitCode=2;
  try {await writeOutput(process.stderr,'{"error":{"code":"TRIAL_COMMAND_FAILED","message":"Offline trial command rejected"}}\n');}
  catch { /* Raw input and secondary errors remain private. */ }
});
