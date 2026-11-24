"use strict";
/**
 * Strict frozen-forward evaluation of the market-specific NHL v3 SHADOW.
 * One common Higher event per exact player/game/stat/line; NEVER count both
 * offered sides as independent model picks. Official stats != fantasy settlement.
 */
const {validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const probability=x=>Number.isFinite(x)&&x>=0&&x<=1;
const validIso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const round=x=>Number(x.toFixed(6));
function pairedGameInterval(rows,{reps=400}={}){
 const groups=new Map();
 for(const r of rows){
  const key=String(r.gameId);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(r.championBrier-r.shadowBrier);
 }
 if(groups.size<30)return null;
 const samples=[],list=[...groups.values()];let seed=472131>>>0;
 for(let n=0;n<reps;n++){
  let sum=0,count=0;
  for(let k=0;k<list.length;k++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const drawn=list[Math.floor(seed/4294967296*list.length)];
   for(const x of drawn){sum+=x;count++;}
  }
  samples.push(sum/count);
 }
 samples.sort((a,b)=>a-b);
 return {method:"paired NHL game-cluster bootstrap",
  lower95:round(samples[Math.floor((reps-1)*.025)]),
  upper95:round(samples[Math.floor((reps-1)*.975)]),
  unit:"champion minus v3 Higher-event Brier; positive favors v3",
  independentClusterCount:groups.size};
}
function summarize(rows){
 const n=rows.length;
 const sum=key=>n?round(rows.reduce((a,r)=>a+r[key],0)/n):null;
 const champions=sum("championBrier"),shadows=sum("shadowBrier");
 return {decisions:n,distinctGames:new Set(rows.map(x=>x.gameId)).size,
  distinctDates:new Set(rows.map(x=>x.gameDate)).size,
  championBrier:champions,shadowBrier:shadows,
  championMinusShadowBrier:n?round(champions-shadows):null,
  championLogLoss:sum("championLogLoss"),
  shadowLogLoss:sum("shadowLogLoss"),
  gameCluster95:pairedGameInterval(rows),
  modelSelectedPickHitRate:null,payoutAdjustedEV:null};
}
function evaluateForwardMarketV3(frames,history,officialSchedule){
 if(!Array.isArray(frames)||!history?.players||
    officialSchedule?.complete!==true||!Array.isArray(officialSchedule.games))
  throw Error("Require Git-frozen snapshots, official player stats and complete NHL season schedule");
 const games=new Map(officialSchedule.games.filter(g=>Number.isInteger(g?.id)&&validIso(g.startTimeUTC))
  .map(g=>[g.id,g]));
 const rows=[],seen=new Set(),excluded={},cohorts=new Set();
 let pending=0,pushes=0;
 const skip=reason=>{excluded[reason]=(excluded[reason]||0)+1;};
 for(const frame of [...frames].sort((a,b)=>Date.parse(a.firstCommittedAt)-Date.parse(b.firstCommittedAt))){
  const snap=frame?.snapshot;
  if(snap?.kind!=="nhl_live_distribution_shadow_unconfirmed_git_archive"||
    !validIso(snap.generatedAt)||!validIso(frame.firstCommittedAt)||
    frame.gitHistoryCount!==1||!Array.isArray(snap.rows)){
   skip("unverified_original_snapshot_or_commit");continue;
  }
  for(const q of snap.rows){
   const v=q?.marketTrainedV3,start=Date.parse(q?.eventStartsAt);
   const captured=Date.parse(q?.sourceCapturedAt),observed=Date.parse(q?.sourceObservedAt),
    recorded=Date.parse(snap.generatedAt),committed=Date.parse(frame.firstCommittedAt);
   const game=games.get(Number(q?.gameId)),officialStart=Date.parse(game?.startTimeUTC);
   if(v?.model!=="nhl-market-trained-v3-shadow")continue;
   if(q.originalModel!=="weighted-form-v1"||!probability(q.originalHigher)||
     !probability(v.higher)||!Number.isInteger(Number(q.playerId))||
     !Number.isInteger(Number(q.gameId))||!Number.isFinite(q.line)||q.line<0||
     !q.market||!v.policyId||!validIso(q.gameStartAt)||
     !Number.isFinite(start)||!Number.isFinite(observed)||observed>captured||
     !validArchiveChronology(captured,recorded,committed,start)||
     !Number.isFinite(officialStart)||Math.abs(start-officialStart)>300000||
     Math.abs(Date.parse(q.gameStartAt)-officialStart)>300000){
    skip("unverified_pregame_game_source_or_probability");continue;
   }
   const key=[q.gameId,q.playerId,q.market,q.line].join("|");
   if(seen.has(key)){skip("duplicate_exact_line_not_independent");continue;}
   seen.add(key);
   const logs=history.players[String(q.playerId)]?.games||[],
    actualGame=logs.find(g=>String(g.gameId)===String(q.gameId));
   if(!actualGame||!Number.isInteger(actualGame[q.market])||actualGame[q.market]<0){
    pending++;continue;
   }
   const stat=actualGame[q.market];
   if(stat===q.line){pushes++;continue;}
   const y=stat>q.line?1:0;
   const loss=p=>-(y*Math.log(Math.max(1e-6,Math.min(1-1e-6,p)))+
    (1-y)*Math.log(Math.max(1e-6,Math.min(1-1e-6,1-p))));
   const row={gameId:Number(q.gameId),playerId:Number(q.playerId),
    gameDate:actualGame.gameDate,market:q.market,line:q.line,
    actualHigher:y,modelVersion:v.model,policyId:v.policyId,
    originalHigher:q.originalHigher,shadowHigher:v.higher,
    championBrier:(q.originalHigher-y)**2,shadowBrier:(v.higher-y)**2,
    championLogLoss:loss(q.originalHigher),shadowLogLoss:loss(v.higher)};
   rows.push(row);cohorts.add(v.policyId);
  }
 }
 const byMarket={};
 for(const market of [...new Set(rows.map(x=>x.market))].sort())
  byMarket[market]=summarize(rows.filter(x=>x.market===market));
 return {schemaVersion:1,kind:"nhl_frozen_forward_market_v3_vs_champion_v1",
  originalSourceSnapshots:frames.length,
  policyVersions:[...cohorts].sort(),
  summary:summarize(rows),byMarket,pushes,pending,excluded,
  rowsReviewed:rows.length,
  historicalLineReconstructionIncluded:false,
  originalPlatformSettlementVerified:false,
  rawOfferedSidesNotIndependentSelections:true,
  retrospectiveDataFittedAfterResults:false,
  championAutoPromotionAllowed:false,
  shadowAutoPromotionAllowed:false,
  warning:"Chronological Git-committed source quote comparison only; not independently confirmed original PrizePicks/Underdog offers or settlements. Offered sides are NOT precommitted optimizer selections. No betting profitability, calibrated edge or original-platform ROI inferred."};
}
module.exports={evaluateForwardMarketV3,summarize,pairedGameInterval};
