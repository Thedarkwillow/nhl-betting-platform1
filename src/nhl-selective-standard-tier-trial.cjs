"use strict";
// Fixed future-only research challenger, not a wager policy or production model.
// This file's first main-branch Git addition is the policy cutoff. No earlier
// frozen rows count toward its prospective results.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const KIND="nhl_selective_standard_and_tier_shrink_trial_v1";
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const p=x=>Number.isFinite(x)&&x>0&&x<1;
const rate=(x,n)=>n?x/n:null;
const key=x=>JSON.stringify([x.gameId,x.playerId,x.market,x.line]);
function selection(r){
 const side=r.originalSelectedSide;
 if(!["Higher","Lower"].includes(side)||!p(r.originalChampionModelProbability))return null;
 const names=["usage","matchup","distribution"];
 const probs=[r.originalChampionModelProbability];
 for(const n of names){
  const v=r.shadow?.variants?.[n],d=r.shadow?.decisions?.[n];
  if(v?.status!=="research_only"||d?.side!==side||!p(d.probability)||d.probability<.5)return null;
  probs.push(d.probability);
 }
 // Predeclare equal weighting and a conservative half-shrink. The filter
 // uses only original pregame information, not realized accuracy.
 const mean=probs.reduce((a,b)=>a+b,0)/probs.length;
 if(mean<.60)return null;
 return {side,estimate:.5+.5*(mean-.5)};
}
function bucket(){return {eligible:0,selected:0,decided:0,pending:0,push:0,hits:0,champion:0,higher:0,lower:0,rawBrier:0,shrunkBrier:0,games:new Set(),dates:new Set()};}
function summarize(a){return {eligible:a.eligible,selected:a.selected,coverage:rate(a.selected,a.eligible),decided:a.decided,pending:a.pending,push:a.push,
 hits:a.hits,observedRate:rate(a.hits,a.decided),sameRowsChampionRate:rate(a.champion,a.decided),sameRowsAlwaysHigherRate:rate(a.higher,a.decided),sameRowsAlwaysLowerRate:rate(a.lower,a.decided),rawBrier:rate(a.rawBrier,a.decided),challengerBrier:rate(a.shrunkBrier,a.decided),distinctGames:a.games.size,distinctDates:a.dates.size,minimumReviewSample:a.decided>=200&&a.games.size>=30&&a.dates.size>=20,calibrationApproved:false};}
function add(a,{side,actual,raw,estimate,gameId,start,status}){
 a.selected++;
 if(status==="push"){a.push++;return;}if(status!=="decided"){a.pending++;return;}
 const y=Number(side===actual);a.decided++;a.hits+=y;a.champion+=y;a.higher+=Number(actual==="Higher");a.lower+=Number(actual==="Lower");
 a.rawBrier+=(raw-y)**2;a.shrunkBrier+=(estimate-y)**2;a.games.add(gameId);a.dates.add(start.slice(0,10));
}
function evaluate(rows,ledger,{policyAt}={}){
 const t=dt(policyAt);if(!Number.isFinite(t))throw Error("Missing original trial policy Git timestamp");
 const standard={},all=bucket(),seen=new Set(),tier={},tierSeen=new Set();
 for(const r of rows||[]){
  const k=key(r);
  if(!Number.isFinite(dt(r.createdAt))||!(dt(r.createdAt)>t&&dt(r.originalGitCommit)>t&&dt(r.originalGitCommit)<dt(r.gameStartAt)-900000)||seen.has(k))continue;
  seen.add(k);const a=standard[r.market]??=bucket();a.eligible++;all.eligible++;
  const s=selection(r);if(!s)continue;
  for(const b of [a,all])add(b,{...s,actual:r.outcome?.side,raw:r.originalChampionModelProbability,gameId:r.gameId,start:r.gameStartAt,status:r.outcome?.status});
 }
 for(const r of ledger?.records||[]){
  if(!rowValid(r)||!p(r.estimatedProbability)||!(dt(r.firstGitCommittedAt)>t&&dt(r.firstResearchAt)>t)||tierSeen.has(r.id))continue;
  tierSeen.add(r.id);
  // One fixed, tier/market/side-separated sensitivity; no claim of fitted calibration.
  const k=JSON.stringify([r.tier,r.market,r.selectedSide]),a=tier[k]??=bucket();a.eligible++;
  add(a,{side:r.selectedSide,actual:r.officialResult,raw:r.estimatedProbability,estimate:.5+.5*(r.estimatedProbability-.5),gameId:r.gameId,start:r.gameStartAt,status:r.selectionStatus==="push"?"push":r.selectionStatus==="pending_official_player_stats"?"pending":"decided"});
 }
 return {kind:KIND,policyAt,standard:{all:summarize(all),byMarket:Object.fromEntries(Object.entries(standard).map(([k,v])=>[k,summarize(v)]))},tierSensitivity:Object.fromEntries(Object.entries(tier).map(([k,v])=>[k,summarize(v)])),modelPromoted:false,calibrationApproved:false,originalPlatformSettlementVerified:false,scope:"first original frozen selected thresholds after policy; no alternate-side or payout inference"};
}
module.exports={selection,evaluate};
