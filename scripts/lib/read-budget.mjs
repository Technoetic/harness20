// One request budget follows nested file/QA helpers without changing old calls.
import { AsyncLocalStorage } from 'node:async_hooks';
const storage=new AsyncLocalStorage();
const failure=()=>Object.assign(new Error('Bounded read budget exceeded.'),{code:'READ_BUDGET_EXCEEDED'});
export function withReadBudget(limit,callback) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>128*1024*1024||typeof callback!=='function')throw failure();
  const meter={limit,used:0,reserved:0,exceeded:false,parent:storage.getStore()??null};
  const finish=value=>{if(meter.exceeded)throw failure();return value;};
  return storage.run(meter,()=>{
    let value;
    try {value=callback();}catch(error){if(meter.exceeded)throw failure();throw error;}
    if(value&&typeof value.then==='function')return Promise.resolve(value).then(finish,error=>{
      if(meter.exceeded)throw failure();throw error;
    });
    return finish(value);
  });
}
export function readBudgetUsage() {
  const meter=storage.getStore();return meter?{limit:meter.limit,used:meter.used,reserved:meter.reserved}:null;
}
export function reserveReadBudget(amount) {
  if(!Number.isSafeInteger(amount)||amount<0)throw failure();
  const meters=[];
  let exceeded=false;
  for(let meter=storage.getStore();meter;meter=meter.parent) {
    if(meter.used+meter.reserved+amount>meter.limit)meter.exceeded=true;
    if(meter.exceeded)exceeded=true;meters.push(meter);
  }
  if(exceeded)throw failure();
  for(const meter of meters)meter.reserved+=amount;
  let settled=false;
  return {complete(actual) {
    if(settled||!Number.isSafeInteger(actual)||actual<0||actual>amount)throw failure();
    settled=true;for(const meter of meters){meter.reserved-=amount;meter.used+=actual;}
  }};
}
export function chargeReadBudget(amount) {
  if(!Number.isSafeInteger(amount)||amount<0)throw failure();
  let exceeded=false;
  // Diagnostic probes are charged after their actual read, including the byte
  // that proves a changed/growing file. A rejected request still has honest usage.
  for(let meter=storage.getStore();meter;meter=meter.parent) {
    meter.used+=amount;if(meter.used+meter.reserved>meter.limit)meter.exceeded=true;
    if(meter.exceeded)exceeded=true;
  }
  if(exceeded)throw failure();
}
