"use strict";
const fs=require("node:fs"),path=require("node:path"),{collect}=require("./collect-live-partner-nhl-nfl.cjs");
async function main(){
 const archive=fs.realpathSync(process.argv[2]||".");
 const code=path.resolve(__dirname,"..");
 if(archive===code||archive.startsWith(code+path.sep)||!fs.existsSync(path.join(archive,".git")))
  throw Error("Require separate authorized original archive checkout");
 const r=await collect({root:archive});
 if(!["saved_private_only","already_complete_morning_snapshot"].includes(r.status)||!/^outputs\/manual-board-captures\/\d{4}-\d{2}-\d{2}\/\d{8}T\d{6}Z$/.test(r.archiveDir))
  throw Error("Unexpected archive result");
 console.log(JSON.stringify(r));
}
if(require.main===module)main().catch(()=>{console.error("Public native capture failed closed; raw diagnostics withheld");process.exitCode=1;});
