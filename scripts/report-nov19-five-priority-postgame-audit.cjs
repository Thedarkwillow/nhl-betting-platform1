"use strict";
/** Offline, first-Git/final-only audit. Never calls a provider or edits a frozen ledger. */
const fs=require("node:fs"),path=require("node:path");
const {audit}=require("../src/nov19-five-priority-postgame-audit.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(){
 const result=audit({
  ledger:read("outputs/research/registry/nhl-precommitted-ledger-latest.json"),
  stats:read("outputs/player-stats/2026-11-19.json"),
  schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
  nflDiagnostic:read("outputs/nfl/backtests/frozen-direction-bias-diagnostic-latest.json")
 });
 if(result.nhl.stillUnresolved!==0||result.nhl.confirmedNonappearances!==4||
    result.nfl.overall.decided!==269||result.futureGate.evidenceReadyForHumanReview)
  throw Error("Nov 19 is unreconciled or future-only trial inappropriately approved");
 const target="outputs/health/nov19-five-priority-readonly-audit.json";
 const absolute=path.join(root,target);
 const existing=fs.existsSync(absolute)?read(target):null;
 const previousComparable=existing?((({generatedAt,...rest})=>rest)(existing)):null;
 const unchanged=previousComparable&&JSON.stringify(previousComparable)===JSON.stringify(result);
 if(!unchanged)
  fs.writeFileSync(absolute,JSON.stringify({...result,
   generatedAt:new Date().toISOString()},null,2)+"\n");
 console.log(JSON.stringify({kind:result.kind,report:target,
  nhlFrozenDecided:result.nhl.decidedSelections,nhlConfirmedNonappearances:result.nhl.confirmedNonappearances,
  nhlRemainingUnresolved:result.nhl.stillUnresolved,
  nflFrozenDecided:result.nfl.overall.decided,nflOriginalCorrect:result.nfl.overall.wins,
  futureReviewApproved:result.futureGate.evidenceReadyForHumanReview,
  picksPromoted:false,platformSettlementsVerified:false,paidRequests:0,
  privateOnly:true}));
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={main};
