"use strict";
/**
 * Past-only NHL official source corroboration for STRICT shadow research.
 * Unverified data never satisfies a gate. Does not change strict thresholds.
 */
const {canonical}=require("./nhl-opponent-context.cjs");
const finite=Number.isFinite;
const nonneg=x=>Number.isInteger(x)&&x>=0;
const utcDay=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\d$/.test(x);
const identity=r=>r.gameId+"|"+r.playerId;
function validateScoringDay(response,official,day){
 if(!utcDay(day)||!Number.isInteger(response?.total)||
   !Array.isArray(response?.data)||response.total!==response.data.length)
  throw Error("Incomplete official per-game scoring inventory");
 const expected=new Map(official.filter(p=>p.type==="skater"&&p.gameDate===day)
  .map(p=>[identity(p),p]));
 const seen=new Set(),rows=[];let invalid=0;
 for(const r of response.data){
  if(!Number.isInteger(r.gameId)||!Number.isInteger(r.playerId))throw Error("Invalid official scoring ID");
  const k=identity(r);if(seen.has(k))throw Error("Duplicate official scoring ID");seen.add(k);
  const p=expected.get(k);
  if(!p)continue;
  if(r.gameDate!==day||!nonneg(r.ppPoints)||!nonneg(r.ppGoals)||
   !nonneg(r.points)||!nonneg(r.goals)||!nonneg(r.assists)||
   r.goals!==p.goals||r.assists!==p.assists||r.points!==p.points||
   r.ppGoals>r.goals||r.ppPoints>r.points||r.ppPoints<r.ppGoals||
   r.ppPoints-r.ppGoals>r.assists||
   canonical(r.teamAbbrev)!==canonical(p.team)){
    invalid++;continue;
  }
  rows.push({gameId:r.gameId,playerId:r.playerId,gameDate:day,
   team:canonical(p.team),goals:r.goals,assists:r.assists,points:r.points,
   ppGoals:r.ppGoals,ppPoints:r.ppPoints,
   powerPlayAssists:r.ppPoints-r.ppGoals});
 }
 return {rows,expected:expected.size,matched:rows.length,invalid,
  source:"NHL_stats_rest_skater_summary_isGame_exact_official_identity",
  zeroIsOnlyVerifiedWhenReturned:true};
}
function enrichHistory(history,archives){
 if(!archives?.length)return {history,counts:{accepted:0,rejected:0,conflicts:0,archives:0}};
 const players={};
 for(const [id,p] of Object.entries(history?.players||{}))
  players[id]={...p,games:(p.games||[]).map(x=>({...x}))};
 const by=new Map();
 for(const p of Object.values(players))for(const g of p.games||[]){
  if(!Number.isInteger(g.gameId)||!Number.isInteger(g.playerId))continue;
  by.set(identity(g),g);
 }
 const counts={accepted:0,rejected:0,conflicts:0,archives:0};
 const seen=new Set();
 for(const a of archives||[]){
  if(a?.kind!=="official_nhl_exact_game_pp_scoring_v1"||
    !utcDay(a.date)||!Array.isArray(a.rows)||
    !a.source?.includes("NHL_stats_rest_skater_summary"))continue;
  counts.archives++;
  for(const r of a.rows){
   const k=identity(r),g=by.get(k);
   if(seen.has(k)){counts.conflicts++;continue;}seen.add(k);
   if(!g||g.gameDate!==a.date||r.gameDate!==a.date||canonical(g.team)!==canonical(r.team)||
     g.type!=="skater"||![g.goals,g.assists,g.points].every(nonneg)||
     g.goals!==r.goals||g.assists!==r.assists||g.points!==r.points||
     ![r.ppGoals,r.ppPoints,r.powerPlayAssists].every(nonneg)||
     r.ppGoals>g.goals||r.ppPoints>g.points||
     r.ppPoints-r.ppGoals!==r.powerPlayAssists||
     r.powerPlayAssists>g.assists){counts.rejected++;continue;}
   g.powerPlayAssists=r.powerPlayAssists;
   g.powerPlayScoringSource="NHL_stats_rest_skater_summary_exact_game";
   counts.accepted++;
  }
 }
 return {history:{...history,players},counts};
}
function teamGoalOpportunity(history,team,cutoff){
 if(!utcDay(cutoff)||!canonical(team))return {verified:false,reason:"invalid_cutoff_team"};
 const grouped=new Map();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(g.type!=="skater"||!Number.isInteger(g.gameId)||!Number.isInteger(g.playerId)||
    !utcDay(g.gameDate)||g.gameDate>=cutoff||
    !["OFF","FINAL"].includes(g.gameState)||!nonneg(g.goals)||!nonneg(g.assists)||
    !nonneg(g.points)||g.points!==g.goals+g.assists)continue;
  const key=g.gameId+"|"+canonical(g.team),a=grouped.get(key)||[];
  a.push(g);grouped.set(key,a);
 }
 const games=[];
 for(const [key,rows] of grouped){
  const teams=key.split("|"),day=rows[0]?.gameDate;
  if(teams[1]!==canonical(team)||new Set(rows.map(x=>x.playerId)).size<12||
    rows.length<12||rows.length>24||rows.some(r=>r.gameDate!==day))continue;
  const opponentTeams=[...grouped.entries()].filter(([k,v])=>
   k.startsWith(teams[0]+"|")&&k!==key&&v.length>=12);
  if(opponentTeams.length!==1)continue;
  const goals=rows.reduce((s,r)=>s+r.goals,0);
  if(goals>20)continue;
  games.push({gameId:Number(teams[0]),gameDate:day,goals});
 }
 games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 const tail=games.slice(-12),verified=tail.length>=10;
 return {verified,priorCompleteGames:tail.length,
  goalsPerGame:verified?tail.reduce((s,g)=>s+g.goals,0)/tail.length:null,
  lastPriorDate:tail.at(-1)?.gameDate??null,
  source:"official_previous_FINAL_game_complete_team_skater_goals",
  noFutureGames:true};
}
function ppAssistHistory(prior){
 const last=(prior||[]).slice(-10);
 const verified=last.length===10&&last.every(g=>nonneg(g.powerPlayAssists)&&
  g.powerPlayScoringSource==="NHL_stats_rest_skater_summary_exact_game"&&
  nonneg(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds);
 return {verified,games:verified?10:last.filter(g=>nonneg(g.powerPlayAssists)&&
  g.powerPlayScoringSource==="NHL_stats_rest_skater_summary_exact_game").length,
  assistsPerGame:verified?last.reduce((s,g)=>s+g.powerPlayAssists,0)/10:null};
}
function blockExposure(prior){
 const last=(prior||[]).slice(-10);
 const shot=last.length===10&&last.every(g=>nonneg(g.opponentShotAttempts)&&
  g.opponentShotAttemptSource==="NHL_official_exact_team_attempts_verified");
 const zone=last.length===10&&last.every(g=>nonneg(g.defensiveZoneStarts)&&
  g.defensiveZoneStartSource==="NHL_official_shift_faceoff_onice_reconciled");
 return {opponentShotAttemptsVerified:shot,defensiveZoneStartsVerified:zone,
  sampleGames:last.length,
  opponentAttemptsPerGame:shot?last.reduce((s,g)=>s+g.opponentShotAttempts,0)/10:null,
  defensiveZoneStartsPerGame:zone?last.reduce((s,g)=>s+g.defensiveZoneStarts,0)/10:null};
}
function enrichBlockHistory(history,archives){
 if(!archives?.length)return {history,counts:{archives:0,attemptRows:0,zoneRows:0,rejected:0}};
 const players={};
 for(const [id,p] of Object.entries(history?.players||{}))
  players[id]={...p,games:(p.games||[]).map(x=>({...x}))};
 const by=new Map();
 for(const p of Object.values(players))for(const g of p.games||[]){
  if(Number.isInteger(g.gameId)&&Number.isInteger(g.playerId))
   by.set(identity(g),g);
 }
 const seenAttempt=new Set(),seenZone=new Set(),counts={
  archives:0,attemptRows:0,zoneRows:0,rejected:0};
 for(const a of archives||[]){
  if(a?.kind!=="official_nhl_exact_game_block_exposure_v1"||
    !utcDay(a.date)||!a.source?.includes("NHL_Gamecenter_events_shiftcharts")||
    !Array.isArray(a.attemptRows)||!Array.isArray(a.zoneRows))continue;
  counts.archives++;
  for(const [rows,field,label,seen] of [
   [a.attemptRows,"opponentShotAttempts",
    "NHL_official_exact_team_attempts_verified",seenAttempt],
   [a.zoneRows,"defensiveZoneStarts",
    "NHL_official_shift_faceoff_onice_reconciled",seenZone]]){
   for(const r of rows){
    const k=identity(r),g=by.get(k);
    const sourceField=field==="opponentShotAttempts"?
     "opponentShotAttemptSource":"defensiveZoneStartSource";
    if(seen.has(k)||!g||g.type!=="skater"||g.gameDate!==a.date||
      r.gameDate!==a.date||canonical(g.team)!==canonical(r.team)||
      !nonneg(r[field])||r[sourceField]!==label){
     counts.rejected++;continue;
    }
    seen.add(k);g[field]=r[field];g[sourceField]=label;
    counts[field==="opponentShotAttempts"?"attemptRows":"zoneRows"]++;
   }
  }
 }
 return {history:{...history,players},counts};
}
module.exports={validateScoringDay,enrichHistory,enrichBlockHistory,teamGoalOpportunity,ppAssistHistory,blockExposure};