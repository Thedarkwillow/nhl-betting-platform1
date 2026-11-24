"use strict";
// Offline historical archive scan. Save aggregate output inside private checkout only.
const fs=require("node:fs"),path=require("node:path");
const {auditCoverage}=require("../src/partner-direction-tier-evidence.cjs");
function run(root=path.resolve(__dirname,"..")){
 const base=path.join(root,"outputs/manual-board-captures");
 if(!fs.existsSync(base))throw Error("No original source archives");
 const readFailures=[];
 function* archives(){
 for(const day of fs.readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()&&/^\d{4}-\d{2}-\d{2}$/.test(x.name))){
  const dir=path.join(base,day.name);
  for(const capture of fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory())){
   const p=path.join(dir,capture.name),id=day.name+"/"+capture.name;
   try{
    const read=name=>JSON.parse(fs.readFileSync(path.join(p,name),"utf8"));
    const manifest=read("manifest.json");
    if(manifest.pacificDate!==day.name)throw Error("Archive folder date mismatch");
    const parts=Object.fromEntries(["NHL","NFL"].map(s=>[s,fs.readdirSync(p).filter(n=>new RegExp("^"+s.toLowerCase()+"-\\d+\\.json$").test(n)).map(read)]));
    yield {id,manifest,parts};
   }catch(e){readFailures.push({archive:id,reason:"archive_unreadable_or_date_mismatch"});}
  }
 }
 }
 const report=auditCoverage(archives());report.rejectedArchives.push(...readFailures);
 report.generatedAt=new Date().toISOString();
 const dest=path.join(root,"outputs/health/partner-direction-tier-evidence-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({acceptedArchives:report.acceptedArchives,rejectedArchives:report.rejectedArchives.length,observedDates:report.observedDates,researchOnly:true}));
 return report;
}
if(require.main===module)try{run()}catch(e){console.error("Private archive audit failed");process.exitCode=1;}
module.exports={run};
