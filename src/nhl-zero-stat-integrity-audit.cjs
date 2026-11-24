"use strict";
/** Fail-closed official NHL skater history audit.
 * Event-only shot feeds often omit active 0-shot skaters. Such files are NOT
 * valid player-game denominators. An official full skater roster is required.
 * Counts only; does not publish player names, offer lines, or model weights.
 */
const MARKETS=["shotsOnGoal","blockedShots","hits","goals","assists","points"];
const count=x=>Number.isInteger(x)&&x>=0;
function audit(history){
 const players=history?.players;
 if(!players||typeof players!=="object")throw Error("Official NHL player-game history required");
 const grouped=new Map(),ids=new Set();let total=0,invalidRows=0,duplicates=0;
 for(const p of Object.values(players)){
  for(const r of p?.games||[]){
   if(r.type!=="skater"||!["OFF","FINAL"].includes(r.gameState))continue;
   total++;
   if(!count(r.gameId)||!count(r.playerId)||!r.gameDate||
       !/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate)||
       typeof r.team!=="string"||!r.team.trim()||
       !count(r.timeOnIceSeconds)||r.timeOnIceSeconds===0||
       r.timeOnIceSeconds>3900){invalidRows++;continue;}
   const id=r.gameId+"|"+r.playerId;
   if(ids.has(id)){duplicates++;continue;}
   ids.add(id);
   const g=grouped.get(r.gameId)||[];
   g.push(r);grouped.set(r.gameId,g);
  }
 }
 const markets=Object.fromEntries(MARKETS.map(k=>[k,{
  observedOfficialRows:0,missingOrInvalid:0,zeroStatAppearances:0,
  positiveStatAppearances:0,allNonzeroMean:null,allAppearanceMean:null
 }]));
 const num=Object.fromEntries(MARKETS.map(k=>[k,{total:0,positiveTotal:0}]));
 let completeGames=0,incompleteGames=0,completeSkaterAppearances=0;
 let mismatchedPoints=0,impossibleShotRelations=0,shotAttemptsVerifiable=0,
  shotAttemptsInvalid=0,completeZeroShotAppearances=0;
 const reasons={};
 const fail=k=>{reasons[k]=(reasons[k]||0)+1;};
 for(const rows of grouped.values()){
  const teams=new Map();
  for(const r of rows){const k=r.team.toUpperCase();teams.set(k,(teams.get(k)||0)+1);}
  // Standard full-game NHL boxscores have eighteen active skaters per club.
  // Do not infer zeros from partial rosters, scratched players or PBPs.
  const complete=teams.size===2&&[...teams.values()].every(n=>n===18);
  if(!complete){incompleteGames++;fail("roster_not_18_skaters_per_side");continue;}
  const dates=new Set(rows.map(r=>r.gameDate));
  if(dates.size!==1){incompleteGames++;fail("game_date_conflict");continue;}
  completeGames++;completeSkaterAppearances+=rows.length;
  for(const r of rows){
   for(const m of MARKETS){
    const x=r[m],t=markets[m];
    if(!count(x)){t.missingOrInvalid++;continue;}
    t.observedOfficialRows++;num[m].total+=x;
    if(x===0){t.zeroStatAppearances++;if(m==="shotsOnGoal")completeZeroShotAppearances++;}
    else{t.positiveStatAppearances++;num[m].positiveTotal+=x;}
   }
   if(["points","assists","goals"].every(k=>count(r[k]))&&r.points!==r.goals+r.assists)
    mismatchedPoints++;
   if(count(r.shotsOnGoal)&&count(r.goals)&&r.goals>r.shotsOnGoal)
    impossibleShotRelations++;
   if(r.shotAttempts!==null&&r.shotAttempts!==undefined){
    if(count(r.shotAttempts)&&count(r.shotsOnGoal)&&r.shotAttempts>=r.shotsOnGoal)
     shotAttemptsVerifiable++;
    else shotAttemptsInvalid++;
   }
  }
 }
 for(const m of MARKETS){
  const a=markets[m],n=a.observedOfficialRows;
  a.allAppearanceMean=n?num[m].total/n:null;
  a.allNonzeroMean=a.positiveStatAppearances?
   num[m].positiveTotal/a.positiveStatAppearances:null;
  a.zeroAppearancesRetained=a.zeroStatAppearances>0;
  a.positiveOnlyEventFileWouldBeBiased=a.zeroStatAppearances>0;
 }
 const fullyReconciled=duplicates===0&&invalidRows===0&&mismatchedPoints===0&&
  impossibleShotRelations===0&&shotAttemptsInvalid===0;
 return {kind:"nhl_full_roster_zero_stat_and_feature_integrity_v1",
  inspectedFinalSkaterRows:total,distinctFinalGameIds:grouped.size,
  completeGames,incompleteGames,completeSkaterAppearances,
  invalidRows,duplicatePlayerGameRows:duplicates,rosterExclusionReasons:reasons,
  byMarket:markets,completeZeroShotAppearances,
  mismatchedPoints,impossibleShotRelations,
  validatedAttemptRows:shotAttemptsVerifiable,invalidAttemptRows:shotAttemptsInvalid,
  fullRosterZeroStatPopulationVerified:completeGames>0&&
   markets.shotsOnGoal.missingOrInvalid===0&&fullyReconciled,
  noMissingStatConvertedToZero:true,onlyOfficialCompletedGames:true,
  calibratedProbability:null,livePropAccuracy:null,modelPromoted:false};
}
/** Private-only exceptions for official source reconciliation. These rows
 * must never appear in the public website's sanitized research JSON.
 */
function privateExceptions(history){
 if(!history?.players||typeof history.players!=="object")
  throw Error("Official history required");
 const gameMap=new Map(),exceptionRows=[];
 for(const p of Object.values(history.players))for(const r of p?.games||[]){
  if(r?.type!=="skater"||!["OFF","FINAL"].includes(r.gameState)||
     !count(r.gameId)||!count(r.playerId))continue;
  const rows=gameMap.get(r.gameId)||[];rows.push(r);gameMap.set(r.gameId,rows);
 }
 for(const [gameId,rows] of gameMap){
  const byTeam=new Map(),ids=new Set();
  for(const r of rows){byTeam.set(r.team,(byTeam.get(r.team)||0)+1);ids.add(r.playerId);}
  const complete=byTeam.size===2&&ids.size===36&&
   [...byTeam.values()].every(x=>x===18)&&rows.length===36;
  if(!complete){
   exceptionRows.push({reason:"incomplete_or_duplicate_roster",gameId,
    gameDate:rows[0]?.gameDate??null,
    teamAppearances:Object.fromEntries([...byTeam.entries()])});
   continue;
  }
  for(const r of rows){
   if(count(r.goals)&&count(r.shotsOnGoal)&&r.goals>r.shotsOnGoal)
    exceptionRows.push({reason:"goals_exceed_official_shots",gameId,
     playerId:r.playerId,gameDate:r.gameDate,team:r.team,
     goals:r.goals,shotsOnGoal:r.shotsOnGoal});
   if([r.points,r.goals,r.assists].every(count)&&r.points!==r.goals+r.assists)
    exceptionRows.push({reason:"points_differ_from_goals_plus_assists",gameId,
     playerId:r.playerId,gameDate:r.gameDate,team:r.team,
     points:r.points,goals:r.goals,assists:r.assists});
  }
 }
 return {kind:"private_nhl_full_roster_reconciliation_exceptions_v1",
  generatedAt:new Date().toISOString(),exceptionCount:exceptionRows.length,
  countsByReason:Object.fromEntries([...new Set(exceptionRows.map(x=>x.reason))]
    .map(reason=>[reason,exceptionRows.filter(x=>x.reason===reason).length])),
  exceptions:exceptionRows,sourceCorrectionVerified:false,
  excludedFromConfidencePromotion:true,modelPromoted:false,
  publishOriginalRows:false,providerRequests:0};
}
module.exports={audit,privateExceptions,MARKETS};
