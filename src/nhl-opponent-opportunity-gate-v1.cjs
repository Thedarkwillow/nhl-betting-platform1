"use strict";
/**
 * Past-only, source-proven opponent shot-attempt screening for NHL research.
 * Official NHL final-game PBP events, reconciled to BOTH teams' final SOG,
 * are the only accepted attempt source. SOG + blocks is NOT a Corsi proxy.
 * This is an evidence gate, not a fitted projection or betting recommendation.
 */
const KIND="nhl_opponent_opportunity_verified_v1";
const SOURCE="NHL_official_exact_team_attempts_verified";
const int=x=>Number.isInteger(x)&&x>=0;
const stamp=x=>typeof x==="string"?Date.parse(x):NaN;
const mean=xs=>xs.reduce((s,n)=>s+n,0)/xs.length;
function pacificDay(iso){
 const t=stamp(iso);if(!Number.isFinite(t))return null;
 const v=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(t))
  .map(x=>[x.type,x.value]));
 return [v.year,v.month,v.day].join("-");
}
function archivedGames(archive){
 if(archive?.kind!=="official_nhl_exact_game_block_exposure_v1"||
    !/^\d{4}-\d{2}-\d{2}$/.test(archive.date||"")||
    !Number.isFinite(stamp(archive.observedAt))||
    archive.verifiedShotAttemptGames<1||
    !String(archive.source||"").includes("NHL_Gamecenter_events")||
    !Array.isArray(archive.attemptRows))return [];
 const groups=new Map();
 for(const r of archive.attemptRows){
  if(!int(r.gameId)||!int(r.playerId)||r.gameDate!==archive.date||
     !/^[A-Z]{2,3}$/.test(r.team||"")||!int(r.opponentShotAttempts)||
     r.opponentShotAttemptSource!==SOURCE)return [];
  const rows=groups.get(r.gameId)||[];rows.push(r);groups.set(r.gameId,rows);
 }
 if(groups.size!==archive.verifiedShotAttemptGames)return [];
 const result=[];
 for(const [gameId,rows] of groups){
  if(rows.length<24||rows.length>44||
     new Set(rows.map(r=>r.playerId)).size!==rows.length)return [];
  const teams=[...new Set(rows.map(r=>r.team))];
  if(teams.length!==2)return [];
  const attempts={},sogAllowed={},pointsAllowed={},assistsAllowed={};
  for(const team of teams){
   const own=rows.filter(r=>r.team===team);
   if(own.length<12||own.length>22||
      new Set(own.map(r=>r.opponentShotAttempts)).size!==1)return [];
   attempts[team]=rows.find(r=>r.team!==team).opponentShotAttempts;
   const sog=own.filter(r=>int(r.opponentShotsOnGoal)&&
    r.opponentSogConcessionSource==="NHL_official_SOG_independently_reconciled");
   if(sog.length===own.length&&
      new Set(sog.map(r=>r.opponentShotsOnGoal)).size===1)
    sogAllowed[team]=sog[0].opponentShotsOnGoal;
   const scoring=own.filter(r=>int(r.opponentTeamGoals)&&
    int(r.opponentTeamAssists)&&int(r.opponentTeamPoints)&&
    r.opponentTeamPoints===r.opponentTeamGoals+r.opponentTeamAssists&&
    r.opponentScoringSource==="NHL_official_final_scoring_and_gamecenter_goals_reconciled");
   if(scoring.length===own.length&&
     ["opponentTeamGoals","opponentTeamAssists","opponentTeamPoints"].every(
      k=>new Set(scoring.map(r=>r[k])).size===1)){
    pointsAllowed[team]=scoring[0].opponentTeamPoints;
    assistsAllowed[team]=scoring[0].opponentTeamAssists;
   }
  }
  result.push({gameId,date:archive.date,sourceObservedAt:archive.observedAt,
   attemptsFor:attempts,sogAllowed,pointsAllowed,assistsAllowed,source:SOURCE});
 }
 return result;
}
// A completed NHL game may legitimately appear in BOTH independent official
// archive SERIES. Count it once only when its two independently reconciled
// team-attempt aggregates agree exactly. Same-series duplicates, third copies,
// discordant dates/teams/attempts and unspecified source families still abstain.
const BLOCK_ARCHIVE="NHL_Gamecenter_events_shiftcharts_and_official_final_sog_reconciled";
const CONCESSION_ARCHIVE="NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled";
function collapseVerifiedAttemptGame(rows){
 if(rows.length===1)return {game:rows[0],crossArchiveMatched:false};
 if(rows.length!==2)return null;
 const block=rows.find(r=>r.archiveSource===BLOCK_ARCHIVE);
 const concession=rows.find(r=>r.archiveSource===CONCESSION_ARCHIVE);
 if(!block||!concession||block.gameId!==concession.gameId||
    block.date!==concession.date)return null;
 const teams=Object.keys(block.attemptsFor).sort(),
  other=Object.keys(concession.attemptsFor).sort();
 if(teams.length!==2||other.length!==2||
    teams.some((t,i)=>t!==other[i]||
      block.attemptsFor[t]!==concession.attemptsFor[t]))return null;
 return {game:block,crossArchiveMatched:true};
}

function verifyOpponentAttempts(archives,opponent,asOf,{minGames=8,maxAgeDays=14}={}){
 const cutoff=stamp(asOf),localDay=pacificDay(asOf),reason="insufficient_verified_opponent_shot_attempt_games";
 const empty={kind:KIND,source:SOURCE,opponent:opponent||null,
  verified:false,status:"abstain",reason,priorDistinctGames:0,
  attemptsForPerGame:null,lastPriorDate:null,
  minimumRequiredGames:minGames,readinessOnly:true};
 if(!Number.isFinite(cutoff)||!localDay||!/^[A-Z]{2,3}$/.test(opponent||"")||
   !Array.isArray(archives)||!Number.isInteger(minGames)||minGames<8||
   !Number.isInteger(maxAgeDays)||maxAgeDays<1)return {...empty,reason:"invalid_input_or_source"};
 const grouped=new Map();
 for(const a of archives){
  if(!(stamp(a?.observedAt)<=cutoff)||!(a?.date<localDay))continue;
  for(const game of archivedGames(a)){
   if(!Object.hasOwn(game.attemptsFor,opponent))continue;
   const old=grouped.get(game.gameId)||[];
   old.push({...game,archiveSource:a.source});grouped.set(game.gameId,old);
  }
 }
 // Reconcile the two official source SERIES only when identical; never
 // count more than ONE observation per unique historical NHL game.
 const collapsed=[...grouped.values()].map(collapseVerifiedAttemptGame).filter(Boolean);
 const games=collapsed.map(x=>x.game)
  .sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId).slice(-10);
 const count=games.length,last=games.at(-1)?.date??null;
 const age=last?(Date.parse(localDay+"T00:00:00Z")-
    Date.parse(last+"T00:00:00Z"))/86400000:Infinity;
 const timely=Number.isFinite(age)&&age>=1&&age<=maxAgeDays;
 const verified=count>=minGames&&timely;
 return {...empty,verified,status:verified?"verified_prior_opponent_attempt_exposure":"abstain",
  reason:verified?null:!timely?"stale_or_missing_recent_official_attempts":reason,
  priorDistinctGames:count,lastPriorDate:last,
  attemptsForPerGame:count?Number(mean(games.map(x=>x.attemptsFor[opponent])).toFixed(2)):null,
  recentOfficialGameIds:games.map(x=>x.gameId),
  matchedCrossArchiveGameIds:collapsed.filter(x=>x.crossArchiveMatched)
   .map(x=>x.game.gameId),
  cutoffAt:asOf,readinessOnly:true};
}
/**
 * Market-specific concessions (not shot attempts FOR). Accept only historic
 * official FINAL games already present in the original pregame source archives.
 * Missing new fields in old archives never become inferred zeros or clearance.
 */
/** One official game, never two independent observations. Concessions may
 * exist in only the newer archive; both series' attempt totals must agree,
 * and if both carry concessions they must also agree for BOTH clubs.
 * Never silently accept conflicting or duplicate same-series snapshots.
 */
function collapseVerifiedConcessionGame(rows,field,opponent){
 const matched=collapseVerifiedAttemptGame(rows);
 if(!matched)return null;
 const qualified=rows.filter(r=>Object.hasOwn(r[field],opponent));
 if(!qualified.length)return null;
 if(qualified.length===2){
  const a=qualified[0][field],b=qualified[1][field];
  const teams=Object.keys(a).sort(),other=Object.keys(b).sort();
  if(teams.length!==2||other.length!==2||
     teams.some((team,i)=>team!==other[i]||a[team]!==b[team]))
   return null;
 }
 return {...matched.game,[field]:qualified[0][field]};
}
function verifyOpponentConcessions(archives,opponent,asOf,metric,{minGames=8,maxAgeDays=14}={}){
 const fields={shotsOnGoal:"sogAllowed",points:"pointsAllowed",assists:"assistsAllowed"};
 const field=fields[metric],local=pacificDay(asOf),cut=stamp(asOf);
 const blank={kind:KIND,market:metric,opponent,verified:false,status:"abstain",
  reason:"insufficient_verified_opponent_"+metric+"_concession_games",
  priorDistinctGames:0,concededPerGame:null,lastPriorDate:null,minimumRequiredGames:minGames,
  onlyPreexistingOfficialSourceAccepted:true};
 if(!field||!Array.isArray(archives)||!/^[A-Z]{2,3}$/.test(opponent||"")||
  !Number.isFinite(cut)||!local||!Number.isInteger(minGames)||minGames<8||
  !Number.isInteger(maxAgeDays)||maxAgeDays<1)
  return {...blank,reason:"invalid_market_opponent_or_cutoff"};
 const byGame=new Map();
 for(const a of archives){
  if(!(stamp(a?.observedAt)<=cut)||!(a?.date<local))continue;
  for(const game of archivedGames(a)){
   if(!Object.hasOwn(game.attemptsFor,opponent))continue;
   const arr=byGame.get(game.gameId)||[];
   arr.push({...game,archiveSource:a.source});byGame.set(game.gameId,arr);
  }
 }
 const games=[...byGame.values()]
  .map(rows=>collapseVerifiedConcessionGame(rows,field,opponent))
  .filter(Boolean)
  .sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId).slice(-10);
 const last=games.at(-1)?.date??null;
 const age=last?(Date.parse(local+"T00:00:00Z")-Date.parse(last+"T00:00:00Z"))/86400000:Infinity;
 const fresh=Number.isFinite(age)&&age>=1&&age<=maxAgeDays;
 const verified=games.length>=minGames&&fresh;
 return {...blank,verified,status:verified?"verified_prior_opponent_"+metric+"_concessions":"abstain",
  reason:verified?null:!fresh?"stale_or_missing_recent_official_concessions":blank.reason,
  priorDistinctGames:games.length,lastPriorDate:last,
  concededPerGame:games.length?Number(mean(games.map(g=>g[field][opponent])).toFixed(2)):null,
  recentOfficialGameIds:games.map(g=>g.gameId),cutoffAt:asOf};
}
function assessNhlOpponentOpportunity(prop,archives){
 const reasons=[],p=prop||{};
 const projectionValid=Number.isFinite(p.projection)&&p.projection>=0&&
  Number.isFinite(p.line)&&p.line>=0&&Number.isInteger(p.observations)&&
  p.observations>=10&&["Higher","Lower"].includes(p.direction)&&
  (p.direction==="Higher"?p.projection>p.line:p.projection<p.line);
 if(!projectionValid)reasons.push("player_projection_not_supported");
 const matchupAgree=p.matchup?.direction===p.direction&&
  Number.isFinite(p.matchup?.projection)&&p.matchup.projection>=0&&
  (p.direction==="Higher"?p.matchup.projection>p.line:p.matchup.projection<p.line);
 if(!matchupAgree)reasons.push("matchup_model_disagrees_or_missing");
 if(!(stamp(p.capturedAt)<stamp(p.gameStartAt)))reasons.push("not_verified_as_pregame");
 let exposure=null;
 if(p.market==="blockedShots"){
  exposure=verifyOpponentAttempts(archives,p.opponent,p.capturedAt);
  if(!exposure.verified)reasons.push(exposure.reason);
 }else if(["shotsOnGoal","points","assists"].includes(p.market)){
  // Scoring and SOG concessions are distinct from opponent attempts FOR.
  exposure=verifyOpponentConcessions(archives,p.opponent,p.capturedAt,p.market);
  if(!exposure.verified)reasons.push(p.market==="shotsOnGoal"?
   "official_opponent_defensive_shots_conceded_not_verified":
   "official_opponent_scoring_concessions_not_verified");
 }else{
  reasons.push("market_specific_opponent_opportunity_not_verified");
 }
 return {kind:KIND,market:p.market||null,playerProjectionVerified:projectionValid,
  opponentOpportunityVerified:exposure?.verified===true,
  opponentAttempts:p.market==="blockedShots"?exposure:null,
  opponentConcessions:p.market!=="blockedShots"?exposure:null,
  matchupAgreementVerified:matchupAgree,
  evidenceQualified:reasons.length===0,
  reasons:[...new Set(reasons)],confidenceApproved:false,
  calibrated:false,originalPlatformOfferVerified:false,
  automaticRecommendationEligible:false,readinessOnly:true};
}
module.exports={KIND,SOURCE,pacificDay,archivedGames,collapseVerifiedAttemptGame,verifyOpponentAttempts,
 verifyOpponentConcessions,assessNhlOpponentOpportunity};
