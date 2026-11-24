"use strict";
/**
 * Bounded, official, immutable NHL opponent concession archive.
 * Read only already COMPLETE FINAL official skater inventories and re-fetch
 * official Gamecenter PBP to reconcile shots FOR and conceded BY each team.
 * Individual skater points/assists require exact official final scoring
 * verification. Missing/ambiguous evidence is an ABSTENTION, never zero.
 *
 * Separate archive path intentionally prevents rewriting older shot-attempt
 * freezes. A research snapshot may only consume archives FIRST committed
 * before its own original pregame capture; retroactive promotion forbidden.
 */
const fs=require("node:fs"),path=require("node:path");
const {officialTeamAttemptEvidence}=
 require("../src/nhl-official-block-exposure-v1.cjs");
const {officialPbpUrl}=require("../src/nhl-official-period-events.cjs");
const {getJSON}=require("./collect-nhl-official-period-events.cjs");
const {gamesForDay}=require("./collect-nhl-block-exposure-shards.cjs");
const root=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,".."),at=p=>path.join(root,p);
const DIR="outputs/research/nhl-opponent-concessions-history";
const REPORT="outputs/health/nhl-opponent-concessions-recovery-latest.json";
const RETRY="outputs/health/nhl-opponent-concessions-retry-latest.json";
const COOLDOWN_MS=48*3600000;
const SOURCE_RECONCILIATION_FAILURES=new Set([
 "official_final_sog_and_events_do_not_reconcile",
 "missing_or_ambiguous_shooting_team_event",
 "incomplete_regulation_or_no_shot_events",
 "original_skater_team_or_game_mismatch",
 "incomplete_final_skater_team_roster"
]);
function blockedRetries(doc,now){
 const atNow=Date.parse(now),blocked=new Map();
 if(doc?.kind!=="nhl_official_concession_source_retry_cooldown_v1"||
    !Number.isFinite(atNow)||!Array.isArray(doc.failures))return blocked;
 for(const f of doc.failures){
  const after=Date.parse(f?.retryAfter),before=Date.parse(f?.failedAt);
  if(!Number.isInteger(f?.gameId)||!SOURCE_RECONCILIATION_FAILURES.has(f.reason)||
     !Number.isFinite(after)||!Number.isFinite(before)||before>atNow||
     after-before!==COOLDOWN_MS||after<=atNow)continue;
  blocked.set(f.gameId,{gameId:f.gameId,failedAt:f.failedAt,
   reason:f.reason,retryAfter:f.retryAfter});
 }
 return blocked;
}

const NAME=c=>c.day+"__"+c.gameId+".json";
// Exactly the filenames we write in NAME(); a double-escaped \\d silently
// ignores every existing official archive and breaks undercoverage recovery.
const CONCESSION_FILE=/^\d{4}-\d{2}-\d{2}__\d{10}\.json$/;
const isConcessionArchiveFilename=name=>typeof name==="string"&&CONCESSION_FILE.test(name);
const {archivedGames}=require("../src/nhl-opponent-opportunity-gate-v1.cjs");
function committedVerifiedHistory(){
 const full=at(DIR);if(!fs.existsSync(full))return [];
 // These are historic coverage priorities only, never admissibility for a
 // future original freeze. The freeze requires separate actual first-Git proof.
 return fs.readdirSync(full).filter(isConcessionArchiveFilename)
  .sort().slice(-500).flatMap(n=>{
   try{const doc=JSON.parse(fs.readFileSync(path.join(full,n),"utf8"));
    return archivedGames(doc).length?[doc]:[];}catch{return [];}
  });
}
function prioritizeGames(candidates,archives,limit=10){
 if(!Array.isArray(candidates)||!Array.isArray(archives)||
    !Number.isInteger(limit)||limit<1||limit>12)throw Error("Invalid official history priority inputs");
 const markets=[["sogAllowed",100],["pointsAllowed",65],["assistsAllowed",45]];
 const teams=Object.fromEntries(markets.map(([market])=>[market,new Map()])),seen=new Set();
 for(const doc of archives)for(const game of archivedGames(doc)){
  if(seen.has(game.gameId))continue;seen.add(game.gameId);
  for(const [market] of markets)for(const team of Object.keys(game[market])){
   const items=teams[market].get(team)||new Set();
   items.add(game.gameId);teams[market].set(team,items);
  }
 }
 const counts=Object.fromEntries(markets.map(([market])=>[market,
  new Map([...teams[market]].map(([team,games])=>[team,Math.min(8,games.size)]))]));
 const queue=candidates.filter(c=>c&&typeof c.day==="string"&&
  Number.isInteger(c.gameId)&&Array.isArray(c.players)).map(c=>({
   ...c,teams:[...new Set(c.players.map(p=>p.team).filter(x=>
    typeof x==="string"&&/^[A-Z]{2,3}$/.test(x)))]})).filter(x=>x.teams.length===2);
 const out=[],used=new Set();
 while(out.length<limit&&used.size<queue.length){
  let pick=null,score=-Infinity;
  for(const c of queue){
   if(used.has(c.gameId))continue;
   // Market-specific official SOG, team scoring and assists are separate
   // source proofs. Prioritize recovering missing scoring even if SOG is
   // complete, never infer one market from another. Same 10+2 daily API cap.
   const value=markets.reduce((score,[market,weight])=>{
    const outstanding=c.teams.filter(t=>(counts[market].get(t)||0)<8);
    return score+weight*outstanding.length+
     outstanding.reduce((n,t)=>n+Math.min(7,counts[market].get(t)||0),0);
   },0);
   if(value>score||value===score&&
      (!pick||c.day>pick.day||c.day===pick.day&&c.gameId<pick.gameId)){
    pick=c;score=value;
   }
  }
  if(!pick||score<=0)break; // No verified historical market deficit: avoid a wasted official call.
  used.add(pick.gameId);out.push({day:pick.day,gameId:pick.gameId,players:pick.players});
  for(const [market] of markets)for(const team of pick.teams)
   counts[market].set(team,Math.min(8,(counts[market].get(team)||0)+1));
 }
 return out;
}

function sourceDates(dir){
 return fs.existsSync(at(dir))?fs.readdirSync(at(dir)).filter(n=>
  /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n=>n.slice(0,10)):[];
}
function candidates(asOf=new Date().toISOString()){
 const today=asOf.slice(0,10);
 const days=[...new Set([...sourceDates("outputs/player-stats"),
  ...sourceDates("outputs/period-stats/training-source")])].filter(d=>d<today).sort();
 const all=days.flatMap(gamesForDay).filter(c=>
  !fs.existsSync(at(DIR+"/"+NAME(c))));
 // Current season first, then bounded legacy season independent validation.
 return {
  current:all.filter(c=>c.day>="2026-07-01").sort((a,b)=>
   b.day.localeCompare(a.day)||a.gameId-b.gameId),
  prior:all.filter(c=>c.day<"2026-07-01").sort((a,b)=>
   b.day.localeCompare(a.day)||a.gameId-b.gameId)
 };
}
async function collectOne(c,{pbp=id=>getJSON(officialPbpUrl(id))}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c?.day||"")||
  !Number.isInteger(c?.gameId)||!Array.isArray(c?.players))
  throw Error("Invalid independently archived NHL game identity");
 const p=await pbp(c.gameId);
 if(p?.id!==c.gameId||p.gameDate!==c.day||
  !["OFF","FINAL"].includes(p.gameState))
  throw Error("Official Gamecenter final game/date mismatch");
 const e=officialTeamAttemptEvidence(p,c.players);
 if(e.status!=="source_verified_final_official_team_attempts"||
  e.opponentSogConcessionVerified!==true||
  e.rows.some(x=>!Number.isInteger(x.opponentShotsOnGoal)))
  throw Error(SOURCE_RECONCILIATION_FAILURES.has(e.status)?
    e.status:"official_opponent_sog_source_not_reconciled");
 return {kind:"official_nhl_exact_game_block_exposure_v1",
  date:c.day,gameId:c.gameId,observedAt:new Date().toISOString(),
  attemptRows:e.rows,zoneRows:[],verifiedShotAttemptGames:1,
  verifiedZoneStartGames:0,officialGames:1,errors:[],
  source:"NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled",
  opponentSogConcessionVerified:true,
  opponentScoringConcessionsVerified:e.opponentScoringConcessionsVerified===true,
  pastResultOnly:true,neverRetrospectivelyFreezesPredictions:true,
  paidProviderRequests:0,bettingEligible:false};
}
async function main(){
 const now=new Date().toISOString(),{current,prior}=candidates(now),
  history=committedVerifiedHistory();
 let previous=null;try{previous=JSON.parse(fs.readFileSync(at(RETRY),"utf8"))}catch{}
 const blocked=blockedRetries(previous,now),
  allowed=a=>a.filter(c=>!blocked.has(c.gameId));
 const selected=[...prioritizeGames(allowed(current),history,10),
   ...prioritizeGames(allowed(prior),history,2)];
 const report={kind:"nhl_official_opponent_concessions_recovery_v1",
  generatedAt:now,pendingCurrentGames:current.length,
  pendingPriorGames:prior.length,cooldownSkippedCandidates:current.filter(c=>blocked.has(c.gameId)).length+
   prior.filter(c=>blocked.has(c.gameId)).length,
  selectedGames:selected.length,attempts:[],
  coverageSelection:"undercovered_team_prioritized_no_threshold_changes",
  neverQualifiesPastFrozenPicks:true,sourceAuthenticatedOriginalOffers:false,
  policyThresholdsUnchanged:true,modelPromoted:false,bettingEligible:false,
  zeroPaidRequests:true};
 for(const c of selected){
  try{
   const a=await collectOne(c);
   fs.mkdirSync(at(DIR),{recursive:true});
   fs.writeFileSync(at(DIR+"/"+NAME(c)),JSON.stringify(a,null,2)+"\n",{flag:"wx"});
   blocked.delete(c.gameId);
   report.attempts.push({date:c.day,gameId:c.gameId,status:"archived",
    sogConcessions:true,scoringConcessions:a.opponentScoringConcessionsVerified});
  }catch(e){
   const reason=String(e.message).slice(0,150);
   report.attempts.push({date:c.day,gameId:c.gameId,status:"unverified",reason});
   // Source-only deterministic reconciliation failures cool down for 48h,
   // not forever; do not waste the next bounded official daily attempt on
   // a repeatedly contradictory older PBP final. Never fabricate a stat.
   if(SOURCE_RECONCILIATION_FAILURES.has(reason))
    blocked.set(c.gameId,{gameId:c.gameId,reason,
     failedAt:now,retryAfter:new Date(Date.parse(now)+COOLDOWN_MS).toISOString()});
   if(/HTTP (403|429)|rate.limit/i.test(reason))break;
  }
 }
 fs.mkdirSync(at("outputs/health"),{recursive:true});
 fs.writeFileSync(at(REPORT),JSON.stringify(report,null,2)+"\n");
 fs.writeFileSync(at(RETRY),JSON.stringify({
  kind:"nhl_official_concession_source_retry_cooldown_v1",
  generatedAt:now,failures:[...blocked.values()],
  historicalSourceOnly:true,pregameModelRequalification:false,
  paidProviderRequests:0
 },null,2)+"\n");
 console.log(JSON.stringify({attempted:report.attempts.length,
  verified:report.attempts.filter(x=>x.status==="archived").length,
  scoringVerified:report.attempts.filter(x=>x.scoringConcessions).length,
  pendingCurrentGames:current.length,modelPromoted:false}));
 return report;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={NAME,isConcessionArchiveFilename,candidates,collectOne,prioritizeGames,committedVerifiedHistory,blockedRetries,main};
