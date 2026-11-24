"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..",".github","workflows");
const files=fs.readdirSync(root).filter(x=>/\.ya?ml$/.test(x));
const rows=files.map(name=>{
 const c=fs.readFileSync(path.join(root,name),"utf8");
 const privateSource=/(repository:\s*['"]?Thedarkwillow\/nhl-betting-platform(?:['"]|\s|$)|PRIVATE_RESEARCH_REPO_TOKEN)/i.test(c);
 const archiveWrites=/git\s+push|git\s+add\s+-f\s+outputs/i.test(c);
 const scheduled=/^\s+schedule:/m.test(c);
 return {privateSource,archiveWrites,scheduled};
});
console.log(JSON.stringify({kind:"public_workflow_migration_inventory_v1",activeWorkflowDefinitions:rows.length,
 privateDependent:rows.filter(x=>x.privateSource).length,privateDependentScheduled:rows.filter(x=>x.privateSource&&x.scheduled).length,
 privateDependentPotentialArchiveWrites:rows.filter(x=>x.privateSource&&x.archiveWrites).length,
 noPrivateReferenceDetected:rows.filter(x=>!x.privateSource).length,classification:"static inventory, not proof of runtime independence"}));
