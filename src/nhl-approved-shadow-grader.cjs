"use strict";
/**
 * Grades ONLY original pre-game MoneyPuck xG / official-count champion pair.
 * Snapshot Git first-add and subsequent mutation history, official schedule
 * and FINAL official NHL boxscores must all agree. Never infer DNP = 0.
 */
const FINALS=new Set(["OFF","FINAL"]);
const SUPPORTED=new Set(["shotsOnGoal","goals","saves"]);
const ts=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
const round=x=>Number(x.toFixed(6));
const clamp=x=>Math.max(1e-6,Math.min(1-1e-6,x));
const keyOf=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
function auditAndGrade(snapshot,{path,firstCommitAt,firstCommitSha,historyCount,schedule,finalGames,now}){
 if(snapshot?.kind!=="nhl_approved_source_shadow_research"||!Array.isArray(snapshot.sourceRows)||
   !schedule?.complete||!Array.isArray(schedule.games)||!Number.isFinite(ts(now))||
   !/^[0-9a-f]{40}$/i.test(firstCommitSha||"")||
   !Number.isInteger(historyCount)||historyCount<1)
  throw Error("Missing source shadow, official schedule, original Git evidence or current time");
 const scheduleMap=new Map(schedule.games.map(g=>[g.id,g]));
 const decisions=[],pending=[],excluded=[],seen=new Set();
 const commit=ts(firstCommitAt),asOf=ts(snapshot.asOf);
 for(const row of snapshot.sourceRows){
  const game=scheduleMap.get(row.gameId);
  const start=ts(game?.startTimeUTC),quote=ts(row.originalQuoteCapturedAt),
   source=ts(row.sourceCapturedAt),created=ts(row.shadowCreatedAt),
   offeredStart=ts(row.eventStartsAt);
  let reason=null;
  if(seen.has(keyOf(row)))reason="duplicate_within_snapshot";seen.add(keyOf(row));
  if(!reason&&(!game||!start))reason="missing_official_schedule_identity";
  if(!reason&&(!Number.isInteger(row.playerId)||row.playerId<=0||
   !SUPPORTED.has(row.market)||!Number.isFinite(row.line)||row.line<0||
   !Number.isFinite(row.baseMean)||row.baseMean<0||
   !Number.isFinite(row.shadowMean)||row.shadowMean<0||
   ![row.championHigher,row.shadowHigher].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||
   !["Higher","Lower"].includes(row.selectedSide)))reason="invalid_frozen_model_or_line";
  if(!reason&&(!offeredStart||Math.abs(start-offeredStart)>300000||
   ![game.home,game.away].includes(row.playerTeam)||
   ![game.home,game.away].includes(row.opponentTeam)||
   row.playerTeam===row.opponentTeam))reason="game_team_or_start_mismatch";
  if(!reason&&(!quote||!source||!created||!asOf||!commit||
   quote>created||source>created||created!==asOf||
   created>commit||quote>=start||source>=start||commit>=start))reason="not_originally_archived_before_puck_drop";
  if(!reason&&historyCount!==1)reason="frozen_snapshot_rewritten_in_git";
  if(reason){excluded.push({gameId:row.gameId,playerId:row.playerId,reason});continue;}
  if(start>ts(now)){pending.push({gameId:row.gameId,reason:"future_game"});continue;}
  const official=finalGames?.[row.gameId];
  if(!official||!FINALS.has(official.gameState)){
   pending.push({gameId:row.gameId,reason:"official_final_boxscore_not_available"});continue;
  }
  if(official.gameId!==row.gameId||
   official.home!==game.home||official.away!==game.away){
   excluded.push({gameId:row.gameId,playerId:row.playerId,reason:"official_boxscore_team_identity_conflict"});continue;
  }
  const matched=official.players?.filter(p=>p.playerId===row.playerId);
  if(!matched||matched.length!==1){
   excluded.push({gameId:row.gameId,playerId:row.playerId,
    reason:"player_did_not_appear_or_ambiguous_official_boxscore"});continue;
  }
  const p=matched[0],actual=p[row.market];
  if(p.team!==row.playerTeam||p.type===(row.market==="saves"?"skater":"goalie")||
   !Number.isInteger(actual)||actual<0){
   excluded.push({gameId:row.gameId,playerId:row.playerId,reason:"missing_or_conflicting_player_stat"});continue;
  }
  const result=actual>row.line?"Higher":actual<row.line?"Lower":"Push";
  if(result==="Push"){excluded.push({gameId:row.gameId,playerId:row.playerId,reason:"stat_line_push"});continue;}
  const higher=result==="Higher"?1:0,champion=clamp(row.championHigher),shadow=clamp(row.shadowHigher);
  decisions.push({gameId:row.gameId,gameDate:game.gameDate,
   playerId:row.playerId,market:row.market,line:row.line,tier:row.tier,
   selectedSide:row.selectedSide,actual,actualDirection:result,actualHigher:higher,
   championMean:row.baseMean,shadowMean:row.shadowMean,
   championHigher:row.championHigher,shadowHigher:row.shadowHigher,
   championBrier:round((row.championHigher-higher)**2),
   shadowBrier:round((row.shadowHigher-higher)**2),
   neutralBrier:0.25,
   championLogLoss:round(-(higher?Math.log(champion):Math.log(1-champion))),
   shadowLogLoss:round(-(higher?Math.log(shadow):Math.log(1-shadow))),
   neutralLogLoss:round(Math.log(2)),
   championAbsoluteError:round(Math.abs(row.baseMean-actual)),
   shadowAbsoluteError:round(Math.abs(row.shadowMean-actual)),
   githubSnapshotFirstCommitAt:firstCommitAt,sourceObservedAt:row.sourceCapturedAt,
   statsOfficialNhlFinal:true,originalProviderOfferIndependentlyVerified:false,
   officialPlatformPayoutVerified:false});
 }
 return {kind:"nhl_approved_source_shadow_official_grade_audit",
  snapshot:path,firstCommitSha,firstCommitAt,historyCount,
  sourceAt:snapshot.sourceCapturedAt,model:"moneypuck-rate-25pct-shrink-shadow-v1",
  proofSource:"Original Git commit metadata and official NHL gamecenter final, not independent platform settlement",
  decisions,pending,excluded,originalPlatformOfferVerified:false,
  independentGitHubServerReceiptVerified:false,
  originalPayoutOrDnpRebootVerified:false,modelPromoted:false};
}
function score(rows){
 const n=rows.length,avg=k=>n?round(rows.reduce((s,r)=>s+r[k],0)/n):null,
  breakdown=by=>Object.fromEntries([...new Set(rows.map(r=>r[by]))].sort().map(k=>{
   const selected=rows.filter(r=>r[by]===k);
   return [k,scoreOne(selected)];
  }));
 function scoreOne(d){
  const count=d.length;
  if(!count)return {n:0,distinctGames:0,brier:{champion:null,shadow:null,neutral:null},
   logLoss:{champion:null,shadow:null,neutral:null},mae:{champion:null,shadow:null},positiveResultVerified:false};
  const mean=k=>round(d.reduce((s,r)=>s+r[k],0)/count);
  return {n:count,distinctGames:new Set(d.map(r=>r.gameId)).size,
   distinctPlayers:new Set(d.map(r=>r.playerId)).size,
   brier:{champion:mean("championBrier"),shadow:mean("shadowBrier"),neutral:.25},
   logLoss:{champion:mean("championLogLoss"),shadow:mean("shadowLogLoss"),neutral:round(Math.log(2))},
   mae:{champion:mean("championAbsoluteError"),shadow:mean("shadowAbsoluteError")},
   brierImprovementShadow:round(mean("championBrier")-mean("shadowBrier")),
   beatsNeutralForecast:mean("shadowBrier")<.25,
   positiveResultVerified:false};
 }
 return {overall:scoreOne(rows),byMarket:breakdown("market"),byTier:breakdown("tier")};
}
function combine(audits){
 const decisions=[],pending=[],excluded=[],seen=new Set(),versions={};
 for(const audit of audits){
  for(const row of audit.decisions){
   const key=keyOf(row);
   if(seen.has(key)){excluded.push({gameId:row.gameId,playerId:row.playerId,reason:"repeated_line_across_source_snapshots"});continue;}
   seen.add(key);decisions.push(row);
  }
  pending.push(...audit.pending);
  excluded.push(...audit.excluded);
 }
 const grade=score(decisions);
 return {schemaVersion:1,kind:"nhl_money_puck_dfo_prospective_shadow_scorecard",
  scoredAt:new Date().toISOString(),sourceSnapshots:audits.length,
  matchedDecisions:decisions.length,distinctGames:grade.overall.distinctGames,
  pendingRows:pending.length,excludedRows:excluded.length,
  pendingReasons:Object.fromEntries([...new Set(pending.map(r=>r.reason))].map(k=>[k,pending.filter(r=>r.reason===k).length])),
  excludedReasons:Object.fromEntries([...new Set(excluded.map(r=>r.reason))].map(k=>[k,excluded.filter(r=>r.reason===k).length])),
  grade,scoreRows:decisions,
  frozenPregameGitMetadataVerified:audits.every(a=>a.historyCount===1),
  githubServerReceiptIndependentlyVerified:false,
  originalPlatformOfferAndPayoutVerified:false,
  probabilityCalibrated:false,modelDeploymentApproved:false,
  thresholdForModelPromotionMet:false,
  warning:"Grades NHL official FINAL boxscore observations against fixed pregame Git forecasts on source-observed but not authenticated platform lines. Correlated props and sample selection remain. DNPs/ambiguous stats excluded, pushes separated. No payout claim, calibrated confidence, or model deployment."};
}
module.exports={auditAndGrade,score,combine};
