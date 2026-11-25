"use strict";
const fs=require("node:fs"),path=require("node:path");
function validate(s){
 const tasks=new Map(),log=new Map(),errors=[];
 for(const l of s.split(/\r?\n/)){
  const t=l.match(/^- \[([ x])\] \*\*\[([A-Z][A-Z0-9-]+)\]\*\* /);
  if(t){if(tasks.has(t[2]))errors.push("duplicate "+t[2]);tasks.set(t[2],t[1]==="x");}
  else if(/^- \[[ x]\]/.test(l))errors.push("missing ID");
  const e=l.match(/^\|\s*([A-Z][A-Z0-9-]+)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|([^|]+)\|/);
  if(e){if(log.has(e[1]))errors.push("duplicate evidence "+e[1]);if(!/https:\/\/github\.com\/[^\s)]+\/(?:actions\/runs|pull)\/\d+/.test(e[3]))errors.push("missing evidence "+e[1]);log.set(e[1],e[3]);}
 }
 for(const [k,v] of tasks)if(v!==log.has(k))errors.push("checkbox/evidence mismatch "+k);
 for(const k of log.keys())if(!tasks.has(k))errors.push("unknown evidence "+k);
 return {valid:errors.length===0&&tasks.size>0,checked:[...tasks.values()].filter(Boolean).length,open:[...tasks.values()].filter(x=>!x).length,errors};
}
if(require.main===module){const r=validate((()=>{const master=fs.readFileSync(path.join(__dirname,"../docs/MASTER_BETTING_PLATFORM_ROADMAP.md"),"utf8");const phase=master.match(/## Phase 22\b([\s\S]*?)(?=\n## Verified completion log)/)?.[1]||"";const log=master.match(/## Verified completion log\b([\s\S]*?)(?=\n## Roadmap change history)/)?.[1]||"";return phase+"\n"+log.split("\n").filter(x=>/^\| ESP-/.test(x)).join("\n");})());console.log(JSON.stringify(r));if(!r.valid)process.exitCode=1;}
module.exports={validate};
