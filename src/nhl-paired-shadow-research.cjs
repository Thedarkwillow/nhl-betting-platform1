"use strict";
/**
 * P03-08 / EDGE-05: Paired SAME-original-line comparison of prospective NHL
 * Standard champion and three challenger directions. Never compare models
 * on different row denominators or mix post-hoc replays with precommits.
 */
const NAMES=Object.freeze(["usage","matchup","distribution"]);
const SIDES=new Set(["Higher","Lower"]);
function aggregate(rows,challenger){
 const accepted=[],rejected={};
 const reject=r=>{rejected[r]=(rejected[r]||0)+1;};
 const seen=new Set();
 for(const r of rows||[]){
  if(r?.market==null||r?.gameId==null||r?.playerId==null||
     !Number.isFinite(r?.line)||!SIDES.has(r.originalSelectedSide)||
     !SIDES.has(r.outcome?.side)||r.outcome?.status!=="decided"){
   reject("not_decided_or_identity_missing");continue;
  }
  const spec=r.shadow?.variants?.[challenger],side=r.shadow?.decisions?.[challenger]?.side;
  if(spec?.status!=="research_only"||!SIDES.has(side)){
   reject("challenger_not_supported_on_original_line");continue;
  }
  const key=[r.gameId,r.playerId,r.market,r.line].join("|");
  if(seen.has(key)){reject("duplicate_exact_original_line");continue;}
  seen.add(key);
  accepted.push({gameId:r.gameId,market:r.market,actual:r.outcome.side,
   champion:r.originalSelectedSide,challenger:side});
 }
 const n=accepted.length;
 const win=fn=>accepted.filter(fn).length;
 const champion=win(x=>x.champion===x.actual),
   candidate=win(x=>x.challenger===x.actual),
   higher=win(x=>x.actual==="Higher"),
   lower=n-higher;
 const pairedDisagreements=accepted.filter(x=>x.champion!==x.challenger);
 const games=new Set(accepted.map(x=>x.gameId)).size;
 return {challenger,pairedDecisions:n,distinctGames:games,
  championCorrect:champion,challengerCorrect:candidate,
  alwaysHigherCorrect:higher,alwaysLowerCorrect:lower,
  challengerMinusChampion:n?(candidate-champion)/n:null,
  challengerOnlyCorrect:pairedDisagreements.filter(x=>x.challenger===x.actual).length,
  championOnlyCorrect:pairedDisagreements.filter(x=>x.champion===x.actual).length,
  discordantPairs:pairedDisagreements.length,
  championRate:n?champion/n:null,challengerRate:n?candidate/n:null,
  exclusions:rejected,originalExactLinesOnly:true,
  gameCluster95:null,modelOutperformanceProven:false,
  platformPayoutEV:null,calibratedProbabilities:false};
}
function pairedResearch(rows,{originalPrecommitted=false}={}){
 const inputs=Array.isArray(rows)?rows:[];
 const results=Object.fromEntries(NAMES.map(name=>[name,aggregate(inputs,name)]));
 const markets=[...new Set(inputs.map(x=>x?.market).filter(Boolean))].sort();
 const byMarket=Object.fromEntries(markets.map(m=>[m,Object.fromEntries(NAMES.map(name=>
  [name,aggregate(inputs.filter(x=>x.market===m),name)]))]));
 return {kind:"nhl_standard_exact_same_line_paired_shadow_audit_v1",
  prospectiveModelEvidence:originalPrecommitted===true,
  retrospectiveNotProspective:originalPrecommitted!==true,
  comparedChallengers:NAMES,
  sameDenominatorForEachChampionAndChallenger:true,
  results,byMarket,modelPromotionApproved:false,
  note:"Each challenger is scored only on its own paired supported original lines. Different challenger coverage is not interchangeable; no calibrated EV or betting edge."};
}
module.exports={NAMES,aggregate,pairedResearch};
