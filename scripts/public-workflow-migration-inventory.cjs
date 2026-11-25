"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..",".github","workflows");
const files=fs.readdirSync(root).filter(x=>/\.ya?ml$/.test(x));
const rows=files.map(name=>{
 const c=fs.readFileSync(path.join(root,name),"utf8");
 const privateSource=/(repository:\s*['"]?Thedarkwillow\/nhl-betting-platform(?:['"]|\s|$)|PRIVATE_RESEARCH_REPO_TOKEN)/i.test(c);
 const archiveWrites=/git\s+push|git\s+add\s+-f\s+outputs/i.test(c);
 const scheduled=/^\s+schedule:/m.test(c);
 const privateCode=/(?:node|python3?|bash)\s+(?:\.\/)?(?:private|archive|private-repo|source-private)\//i.test(c);
 const privateWorkingDirectory=/working-directory:\s*['"]?(?:private|archive|private-repo|source-private)(?:\/|['"]|\s|$)/i.test(c);
 return {name,privateSource,archiveWrites,scheduled,privateCode,privateWorkingDirectory};
});
console.log(JSON.stringify({kind:"public_workflow_migration_inventory_v1",activeWorkflowDefinitions:rows.length,
 privateDependent:rows.filter(x=>x.privateSource).length,privateDependentScheduled:rows.filter(x=>x.privateSource&&x.scheduled).length,
 privateDependentPotentialArchiveWrites:rows.filter(x=>x.privateSource&&x.archiveWrites).length,
 noPrivateReferenceDetected:rows.filter(x=>!x.privateSource).length,reviewBatches:{scheduledReadOnlyCandidates:rows.filter(x=>x.privateSource&&x.scheduled&&!x.archiveWrites&&!x.privateCode&&!x.privateWorkingDirectory).map(x=>x.name).sort(),scheduledPrivateExecutionReview:rows.filter(x=>x.privateSource&&x.scheduled&&!x.archiveWrites&&(x.privateCode||x.privateWorkingDirectory)).map(x=>x.name).sort(),scheduledArchiveWriteReview:rows.filter(x=>x.privateSource&&x.scheduled&&x.archiveWrites).map(x=>x.name).sort()},classification:"Static heuristic only; review checkout paths, code and data dependencies before migration."}));
