"use strict";
// Research selection uses development only. Holdout may reject a locked candidate,
// never pick a replacement. All comparisons use identical observations.
const {scores}=require("./nba-context-calibration-v2.cjs");
const markets=["player_points","player_rebounds","player_assists","player_threes","player_points_rebounds_assists"];
const candidates=["original","minutesP","roleP","usageP","usageRateP","paceP","defenseOnlyP","positionalP","teammateP"];
const policy=Object.freeze({minRows:100,minGames:30,minDates:10,minCoverage:.8,developmentEnd:"2026-01-19",holdoutStart:"2026-02-01",holdoutEnd:"2026-04-12"});
const valid=p=>Number.isFinite(p)&&p>0&&p<1;
function matched(rows,key){
 const a=rows.filter(r=>valid(r[key])&&valid(r.old)&&valid(r.marketP));
 const baseline=scores(a,"old"),candidate=scores(a,key),market=scores(a,"marketP");
 return {baseline,candidate,market,coverage:rows.length?a.length/rows.length:0,delta:candidate.n?candidate.brier-baseline.brier:null,deltaMarket:candidate.n?candidate.brier-market.brier:null};
}
function enough(s){return s.candidate.n>=policy.minRows&&s.candidate.games>=policy.minGames&&s.candidate.dates>=policy.minDates&&s.coverage>=policy.minCoverage;}
function improved(s){return enough(s)&&s.delta<0&&s.deltaMarket<0&&s.candidate.logLoss<s.baseline.logLoss&&s.candidate.logLoss<s.market.logLoss;}
function assess(rows){
 const seen=new Set();for(const r of rows){
 if(!r.id||seen.has(r.id)||!markets.includes(r.market)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||![0,1].includes(r.y))throw Error("invalid or duplicate research row");seen.add(r.id);
 }
 const out={};
 for(const m of markets){
 const dev=rows.filter(r=>r.market===m&&r.date>="2025-10-21"&&r.date<=policy.developmentEnd&&!(r.playerId==="3112335"&&m==="player_points"&&r.date<="2025-12-07"));
 const hold=rows.filter(r=>r.market===m&&r.date>=policy.holdoutStart&&r.date<=policy.holdoutEnd);
 const trial=candidates.map(key=>({key,...matched(dev,key)}));
 const eligible=trial.filter(improved).sort((a,b)=>a.delta-b.delta||a.key.localeCompare(b.key));
 const locked=eligible[0]?.key||"old",result=matched(hold,locked);
 const status=!enough(result)?"insufficient_holdout":locked==="old"?"baseline_retained_no_development_challenger":improved(result)?"retrospective_candidate_supported":"locked_candidate_rejected";
 out[m]={developmentRows:dev.length,holdoutRows:hold.length,lockedCandidate:locked,developmentTrials:trial,holdout:result,status,productionApproval:false};
 }
 return {kind:"nba_fixed_development_holdout_gate_v1",policy,markets:out,productionFreezeReady:false,retrospectiveOnly:true};
}
module.exports={assess,policy};
