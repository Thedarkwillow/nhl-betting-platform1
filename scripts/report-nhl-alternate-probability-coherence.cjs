"use strict";
const fs=require("node:fs"),path=require("node:path");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {auditFrames}=require("../src/nhl-alternate-probability-coherence.cjs");
function main(){
 const report=auditFrames(originalFrames());report.generatedAt=new Date().toISOString();
 const root=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,"..");
 const dest=path.join(root,"outputs/health/nhl-alternate-probability-coherence-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({frames:report.frames,comparedGroups:report.comparedGroups,researchOnly:true}));
}
if(require.main===module)try{main()}catch(e){console.error("Private coherence audit failed");process.exitCode=1;}
module.exports={main};
