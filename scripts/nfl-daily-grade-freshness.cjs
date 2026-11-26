"use strict";
// Count-only guard: no source requests, no grading or modification of originals.
const fs=require("node:fs"),path=require("node:path");
function checkDue(originals,grades,clock){
 const now=Date.parse(clock);
 if(!Number.isFinite(now)||!Array.isArray(grades)||!(originals instanceof Map))throw Error("invalid grade audit");
 const byId=new Map(grades.map(r=>[r.id,r]));
 if(byId.size!==grades.length||byId.size!==originals.size)throw Error("original grade count mismatch");
 let due=0,missingFinal=0,missingGame=0,otherUnresolved=0;
 for(const [id,{p,firstCommittedAt}] of originals){
  const r=byId.get(id),start=Date.parse(p.eventStartsAt);
  if(!r||r.firstGitCommittedAt!==firstCommittedAt||r.line!==p.line||r.market!==p.market||r.modeledSide!==p.selectedSide||r.sourceGameId!==p.sourceGameId||!Number.isFinite(start))throw Error("original grade mismatch");
  if(now-start<8*3600000)continue;
  due++;
  if(r.status==="pending_official_final")missingFinal++;
  else if(r.status==="pending_official_game_match")missingGame++;
  else if(r.status!=="decided"&&r.status!=="push")otherUnresolved++;
 }
 return {due,missingFinal,missingGame,otherUnresolved,sourceComplete:missingFinal===0&&missingGame===0};
}
function main(root){
 root=path.resolve(root);
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
 const report=read("outputs/nfl/backtests/pregame-forecast-proof-latest.json");
 if(report.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||report.nflverseFinalStatsNotPlatformSettlement!==true)throw Error("invalid grade report");
 const {firstOriginals,KIND}=require(path.join(root,"src/nfl-original-freeze-identity.cjs"));
 const {verifyCommitChronology}=require(path.join(root,"src/nfl-prospective-freeze.cjs"));
 const {original,filesIn}=require(path.join(root,"scripts/grade-nfl-precommitted.cjs"));
 const originals=firstOriginals(filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/).map(p=>({...original(p),snapshot:read(p)})).filter(x=>x.gitHistoryCount===1&&x.snapshot?.kind===KIND&&verifyCommitChronology(x.snapshot,x.firstCommittedAt).verified&&Date.parse(x.firstCommittedAt)<=Date.parse(report.generatedAt))).earliest;
 const result=checkDue(originals,report.explicitFrozenDirections.rows,report.generatedAt);
 console.log(JSON.stringify(result));
 if(!result.sourceComplete)process.exitCode=1;
}
if(require.main===module){try{main(process.argv[2]);}catch{console.error("NFL due-source integrity audit failed");process.exitCode=1;}}
module.exports={checkDue};
