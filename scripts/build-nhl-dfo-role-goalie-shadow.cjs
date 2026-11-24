"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildRoleGoalieShadow}=require("../src/nhl-dfo-role-goalie-shadow.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(){
 const approved=read("outputs/approved-nhl-sources/latest.json"),
  research=read("outputs/free-source/nhl/research-latest.json"),
  asOf=new Date().toISOString();
 if([approved.generatedAt,research.generatedAt].some(t=>
  !Number.isFinite(Date.parse(t))||Date.parse(t)>Date.parse(asOf)||
  Date.parse(asOf)-Date.parse(t)>4*3600000))
  throw Error("Only fresh original pregame research and first-captured provider facts allowed");
 const result=buildRoleGoalieShadow(research,approved,asOf);
 if(result.counts.skaterRoleCandidates+result.counts.conditionalGoalieCandidates===0)
  throw Error("No valid fresh DFO projected role or conditional goalie candidates: retaining prior snapshot");
 const dir=path.join(root,"outputs/projections/dfo-role-goalie-snapshots");
 fs.mkdirSync(dir,{recursive:true});
 const stamp=asOf.slice(0,19).replace(/[-:]/g,"")+"Z",
  payload=JSON.stringify(result)+"\n";
 fs.writeFileSync(path.join(dir,stamp+".json"),payload,{flag:"wx"});
 fs.writeFileSync(path.join(root,"outputs/projections/dfo-role-goalie-shadow-latest.json"),payload);
 console.log(JSON.stringify({at:asOf,counts:result.counts,modelPromoted:false,
  officialStarterVerified:false,rawDataPublic:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
