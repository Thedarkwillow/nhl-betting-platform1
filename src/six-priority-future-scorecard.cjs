"use strict";
/**
 * Prospective challenger scoring from original (unmodified, first-Git)
 * pregame snapshots. No tuning or fitted calibration on evaluation games.
 * Original model, challenger, always-Higher/Lower are compared on identical
 * lines. All are descriptive research, not authenticated payout settlements.
 */
const KIND="nhl_nfl_first_git_market_challenger_future_scorecard_v1";
const CUT="2026-11-21T00:00:00Z";
const {KIND:NHL_KIND}=require("./nhl-standard-quality-challenger-v2.cjs");
const {KIND:NFL_KIND}=require("./nfl-directional-usage-challenger-v3.cjs");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
const gameDate=t=>{
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(t));
 const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return x.year+"-"+x.month+"-"+x.day;
};
function group(){return {registered:0,decided:0,wins:0,losses:0,push:0,pending:0,
  higherWins:0,lowerWins:0,byGame:new Map(),dates:new Set()};}
function add(b,{gameday,gameId,status,hit,actualSide}){
 b.registered++;if(status==="pending"){b.pending++;return;}
 if(status==="push"){b.push++;return;}
 b.decided++;b.wins+=Number(hit);b.losses+=Number(!hit);
 b.higherWins+=Number(actualSide==="Higher");b.lowerWins+=Number(actualSide==="Lower");
 const g=b.byGame.get(gameId)||{decided:0,model:0,higher:0,lower:0};
 g.decided++;g.model+=Number(hit);g.higher+=Number(actualSide==="Higher");
 g.lower+=Number(actualSide==="Lower");b.byGame.set(gameId,g);
 b.dates.add(gameday);
}
function clusterCI(games,baseline){
 const a=[...games.values()].filter(g=>g.decided>0),reps=2500;
 if(a.length<10)return null;
 let seed=0x1e2d2026;const vals=[];
 for(let k=0;k<reps;k++){
  let delta=0,n=0;
  for(let i=0;i<a.length;i++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const g=a[Math.floor(seed/4294967296*a.length)];
   delta+=g.model-g[baseline];n+=g.decided;
  }
  if(n)vals.push(delta/n);
 }
 vals.sort((a,b)=>a-b);
 return {lower:vals[Math.floor((vals.length-1)*.025)],
  upper:vals[Math.ceil((vals.length-1)*.975)],
  resamples:reps,clusterUnit:"official_completed_game",
  candidateOnly:true};
}
function summary(b,minimumGames=30,minimumSlates=20){
 const n=b.decided,clusterHigher=clusterCI(b.byGame,"higher"),
  clusterLower=clusterCI(b.byGame,"lower");
 return {registered:b.registered,decided:n,correct:b.wins,incorrect:b.losses,
  pushes:b.push,pending:b.pending,
  distinctGames:b.byGame.size,distinctPacificDates:b.dates.size,
  observedRate:n?b.wins/n:null,
  hypotheticalAlwaysHigherRate:n?b.higherWins/n:null,
  hypotheticalAlwaysLowerRate:n?b.lowerWins/n:null,
  pairedGameCluster95VsHigher:clusterHigher,pairedGameCluster95VsLower:clusterLower,
  sufficientIndependentEvaluation:n>=200&&b.byGame.size>=minimumGames&&
    b.dates.size>=minimumSlates,
  descriptiveOutperformanceBothBaselines:
   n>=200&&b.byGame.size>=minimumGames&&b.dates.size>=minimumSlates&&
   clusterHigher?.lower>0&&clusterLower?.lower>0,
  originalAppSettlementVerified:false,payoutEV:null,modelPromoted:false};
}
function validFrame(f,tfield){
 const created=at(f?.snapshot?.[tfield]),git=at(f?.firstGitCommittedAt);
 return f?.gitHistoryCount===1&&Number.isFinite(created)&&
  Number.isFinite(git)&&created>=at(CUT)&&git>=created&&git-created<=15*60000;
}
function scoreNhl(frames,history){
 const total=group(),markets={},reasons={},seen=new Set();
 for(const f of [...(frames||[])].sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  const s=f.snapshot;
  if(!validFrame(f,"generatedAt")||s?.standardQualityShadowV2?.kind!==NHL_KIND||
    s.standardQualityShadowV2.generatedAt!==s.generatedAt)continue;
  for(const p of s.standardQualityShadowV2.rows||[]){
   if(p.status!=="shadow_selected_research_only")continue;
   const k=key(p);
   if(seen.has(k))continue;
   const orig=(s.individualPropSelections||[]).filter(o=>
    key(o)===k&&o.lean===p.originalSide&&o.capturedAt===p.capturedAt&&
    o.gameStartAt===p.gameStartAt);
   if(orig.length!==1||!(at(p.gameStartAt)-at(f.firstGitCommittedAt)>=900000)||
     p.modelSideNeverReversed!==true||p.platformSettlementVerified!==false||
     p.bettingEligible!==false||p.originalLine!==p.line){
    reasons.invalid_original_precommit=(reasons.invalid_original_precommit||0)+1;continue;
   }
   seen.add(k);
   const official=(history?.players?.[String(p.playerId)]?.games||[]).filter(g=>
    g.gameId===p.gameId&&g.playerId===p.playerId&&["OFF","FINAL"].includes(g.gameState)&&
    g.type==="skater"&&g.timeOnIceSeconds>0&&Number.isInteger(g[p.market])&&g[p.market]>=0);
   const status=official.length!==1?"pending":official[0][p.market]===p.line?"push":"decided";
   const actual=status==="decided"?(official[0][p.market]>p.line?"Higher":"Lower"):null;
   const result={gameId:p.gameId,gameday:gameDate(p.gameStartAt),status,actualSide:actual,
    hit:status==="decided"&&actual===p.originalSide};
   add(total,result);
   const b=markets[p.market]||(markets[p.market]=group());add(b,result);
  }
 }
 return {sport:"NHL",all:summary(total),byMarket:Object.fromEntries(
  Object.entries(markets).map(([k,v])=>[k,summary(v)])),exclusions:reasons};
}
function scoreNfl(frames,grade){
 const totals=group(),markets={},reasons={},seen=new Set();
 const grading=new Map();
 for(const r of grade?.explicitFrozenDirections?.rows||[]){
  if(grading.has(r.id))throw Error("Repeated original NFL grading ID");
  grading.set(r.id,r);
 }
 for(const f of [...(frames||[])].sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  const s=f.snapshot;
  if(!validFrame(f,"createdAt")||s?.usageDirectionShadowV3?.kind!==NFL_KIND||
    s.usageDirectionShadowV3.createdAt!==s.createdAt)continue;
  for(const p of s.usageDirectionShadowV3.rows||[]){
   if(p.status!=="shadow_selected_research_only"||seen.has(p.originalId))continue;
   const originals=(s.selections||[]).filter(x=>x.id===p.originalId&&
     x.market===p.originalMarket&&x.line===p.originalLine&&
     x.selectedSide===p.originalSide&&x.offeredSide===p.originalSide);
   if(originals.length!==1||!p.originalDirectionNeverRewritten||
      !(at(p.eventStartsAt)-at(f.firstGitCommittedAt)>=900000)){
    reasons.original_source_mismatch=(reasons.original_source_mismatch||0)+1;continue;
   }
   seen.add(p.originalId);
   const r=grading.get(p.originalId);
   const exact=r&&r.firstGitCommittedAt===f.firstGitCommittedAt&&
    r.line===p.originalLine&&r.modeledSide===p.originalSide&&
    r.market===p.originalMarket;
   const valid=exact&&["decided","push"].includes(r.status)&&
    (r.status==="push"||["Higher","Lower"].includes(r.actualSide));
   const status=valid?r.status==="push"?"push":"decided":"pending";
   const gameId=r?.officialScheduleGameId||p.sourceGameId;
   const result={gameId,gameday:gameDate(p.eventStartsAt),status,
    actualSide:status==="decided"?r.actualSide:null,
    hit:status==="decided"&&r.actualSide===p.originalSide};
   add(totals,result);
   const b=markets[p.originalMarket]||(markets[p.originalMarket]=group());add(b,result);
  }
 }
 return {sport:"NFL",all:summary(totals,30,20),
  byMarket:Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,summary(v,30,20)])),
  exclusions:reasons};
}
function evaluate({nhlFrames=[],nflFrames=[],history,grade}={}){
 const nhl=scoreNhl(nhlFrames,history),nfl=scoreNfl(nflFrames,grade);
 return {kind:KIND,policyEffectiveAt:CUT,nhl,nfl,
  originalSideAndLineUnchanged:true,noPostgameRuleSelection:true,
  matchedOriginalSourceOnly:true,
  lineupProbabilityCalibrated:false,modelPromoted:false,
  independentlyVerifiedProfitability:false,
  originalPlatformSettlementsVerified:false,verifiedExpectedValue:null,
  autoWagers:0};
}
module.exports={KIND,CUT,scoreNhl,scoreNfl,evaluate,summary,clusterCI};
