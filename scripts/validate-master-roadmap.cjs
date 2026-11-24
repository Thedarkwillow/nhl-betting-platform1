"use strict";
const fs=require("node:fs"),path=require("node:path");
const DEFAULT=path.join(__dirname,"..","docs","MASTER_BETTING_PLATFORM_ROADMAP.md");
function validate(content){
 const errors=[],tasks=[],ids=new Set(),lines=String(content||"").split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const ln=lines[i],m=ln.match(/^- \[([ x])\] \*\*\[([A-Z][A-Z0-9-]{3,})\]\*\*\s+(.+)$/);
  if(!m){
   if(/^- \[[ x]\] /.test(ln))errors.push("Checklist missing task ID at line "+(i+1));
   continue;
  }
  if(ids.has(m[2]))errors.push("Duplicate task ID "+m[2]+" at line "+(i+1));
  ids.add(m[2]);tasks.push({id:m[2],checked:m[1]==="x"});
 }
 const match=content.match(/## Verified completion log\b([\s\S]*?)(?=\n## Roadmap change history\b)/);
 if(!match)errors.push("Missing Verified completion log section");
 const completionIds=new Set();
 for(const line of (match?.[1]||"").split(/\r?\n/)){
  const m=line.match(/^\|\s*([A-Z][A-Z0-9-]{3,})\s*\|\s*([^|]+)\|\s*([^|]+)\|/);
  if(!m)continue;
  if(completionIds.has(m[1]))errors.push("Duplicate completion log row "+m[1]);
  completionIds.add(m[1]);
  if(!m[3].includes("https://"))
   errors.push("Missing link to evidence in log for "+m[1]);
 }
 for(const task of tasks)if(task.checked&&!completionIds.has(task.id))
  errors.push("Checked task "+task.id+" requires completion log evidence");
 for(const id of completionIds)if(!ids.has(id))
  errors.push("Completion log has unknown task ID "+id);
 const phase10=content.match(/## Phase 10\b([\s\S]*?)(?=\n## Phase 11\b)/)?.[1]||"";
 const order=["**NHL FIRST**","**NFL SECOND","**NBA THIRD**","**ESPORTS FOURTH**","**MLB LAST**"];
 const loc=order.map(x=>phase10.indexOf(x));
 if(loc.some(x=>x<0)||loc.some((x,i)=>i>0&&x<=loc[i-1]))
  errors.push("Sport rollout must remain NHL, NFL, NBA, Esports, MLB LAST");
 if(!content.includes("## The product moat")||!content.includes("## Phase 15"))
  errors.push("Commercial roadmap or differentiation missing");
 return {valid:errors.length===0,errors,tasks:tasks.length,checked:tasks.filter(x=>x.checked).length,
 pending:tasks.filter(x=>!x.checked).length,completionLogEntries:completionIds.size};
}
if(require.main===module){
 const result=validate(fs.readFileSync(process.argv[2]||DEFAULT,"utf8"));
 console.log(JSON.stringify(result,null,2));
 if(!result.valid)process.exitCode=1;
}
module.exports={validate};
