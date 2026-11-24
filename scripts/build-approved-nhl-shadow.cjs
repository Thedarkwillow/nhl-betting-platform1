"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildApprovedShadow}=require("../src/nhl-approved-source-shadow.cjs");
const root=path.resolve(__dirname,"..");
function main(){
 const read=x=>JSON.parse(fs.readFileSync(path.join(root,x),"utf8"));
 const approved=read("outputs/approved-nhl-sources/latest.json"),
  research=read("outputs/free-source/nhl/research-latest.json"),at=new Date().toISOString();
 if(Date.parse(at)-Date.parse(approved.generatedAt)>4*3600000)
  throw Error("Approved source snapshot is stale; no model feature archive");
 if(Date.parse(at)-Date.parse(research.generatedAt)>4*3600000)
  throw Error("NHL prop research source stale; refusing to backfill old offered lines");
 const result=buildApprovedShadow(research,approved,at);
 if(result.counts.shadowRows===0)throw Error("No fresh original-line MoneyPuck forecast candidates: retaining existing frozen shadows");
 const target=path.join(root,"outputs/projections/approved-source-snapshots");
 fs.mkdirSync(target,{recursive:true});
 const stamp=at.slice(0,19).replace(/[-:]/g,"")+"Z";
 const payload=JSON.stringify(result)+"\n";
 fs.writeFileSync(path.join(target,stamp+".json"),payload,{flag:"wx"});
 fs.writeFileSync(path.join(root,"outputs/projections/approved-source-shadow-latest.json"),payload);
 console.log(JSON.stringify({asOf:at,sourceAt:approved.generatedAt,
  originalProps:result.counts.originalResearchProps,shadowRows:result.counts.shadowRows,
  goalie:result.counts.goalieRows,excluded:result.counts.excluded,
  modelPromoted:false,platformActualSettlementsVerified:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
