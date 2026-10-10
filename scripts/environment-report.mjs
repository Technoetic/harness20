#!/usr/bin/env node
import { inspectEnvironmentReport } from './lib/environment-report.mjs';

const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='inspect'||args[1]!=='--workspace'||!args[2]) {
  console.error(JSON.stringify({error:{code:'ENVIRONMENT_INSPECT_INVALID'}}));
  process.exitCode=2;
} else {
  const result=await inspectEnvironmentReport(args[2]);
  console.log(JSON.stringify(result));
  process.exitCode=result.verdict==='PASS'?0:1;
}
