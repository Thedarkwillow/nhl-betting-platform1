"use strict";
/**
 * Official final-game role/minutes observations. NOT a prospective starter or
 * injury confirmation. No NHL player time-on-ice or starter is ever invented.
 */
const MARKETS=["shotsOnGoal","goals","assists","points","blockedShots","saves"];
function parseToi(x){
 if(typeof x!=="string"||!/^(\d{1,3}):([0-5]\d)$/.test(x))return null;
 const [m,s]=x.split(":").map(Number),seconds=m*60+s;
 return seconds>=0&&seconds<=3900?seconds:null;
}
function parseGoalieSaves(player){
 if(Number.isInteger(player.saves)&&player.saves>=0)return player.saves;
 const raw=player.saveShotsAgainst;
 if(typeof raw!=="string")return null;
 const match=/^(\d{1,2})\/(\d{1,2})$/.exec(raw);
 if(!match)return null;
 const saves=Number(match[1]),shots=Number(match[2]);
 return saves<=shots?saves:null;
}
function normalizeOfficialUsage(boxscore){
 if(!boxscore||!Number.isInteger(boxscore.id)||!["OFF","FINAL"].includes(boxscore.gameState)||
    !/^\d{4}-\d{2}-\d{2}$/.test(boxscore.gameDate??"")||!boxscore.playerByGameStats)throw Error("Incomplete official final NHL boxscore");
 const rows=[],seen=new Set();
 for(const side of ["awayTeam","homeTeam"]){
  const team=boxscore[side]?.abbrev,groups=boxscore.playerByGameStats[side];
  if(!team||!groups)throw Error("Missing official NHL team/game roster");
  for(const group of ["forwards","defense","goalies"]){
   for(const p of groups[group]||[]){
    if(!Number.isInteger(p.playerId))continue;
    const key=String(p.playerId);
    if(seen.has(key))throw Error("Duplicate official player in boxscore");
    seen.add(key);
    const goalie=group==="goalies",seconds=parseToi(p.toi);
    // Presence in a final boxscore is NOT a future start confirmation.
    rows.push({gameId:boxscore.id,gameDate:boxscore.gameDate,playerId:p.playerId,
     team,type:goalie?"goalie":"skater",timeOnIceSeconds:seconds,
     started:goalie?(typeof p.starter==="boolean"?p.starter:null):null,
     saves:goalie?parseGoalieSaves(p):null,
     shotsAgainst:goalie?(Number.isInteger(p.shotsAgainst)&&p.shotsAgainst>=0?p.shotsAgainst:null):null,
     shotsOnGoal:!goalie&&Number.isInteger(p.sog)&&p.sog>=0?p.sog:null,
     blockedShots:!goalie&&Number.isInteger(p.blockedShots)&&p.blockedShots>=0?p.blockedShots:null,
     provenance:"official_NHL_final_gamecenter_boxscore"});
   }
  }
 }
 return rows;
}
function buildUsageIndex(reports){
 const players=new Map(),seen=new Set(),summary={games:0,playerGames:0,withToi:0,goalies:0,missingToi:0};
 for(const report of reports){
  if(!Array.isArray(report.rows)||report.errors?.length||report.complete!==true)
   throw Error("Usage report not validated or incomplete");
  const ids=new Set();
  for(const row of report.rows){
   if(!Number.isInteger(row.gameId)||!Number.isInteger(row.playerId)||!["goalie","skater"].includes(row.type))throw Error("Invalid usage row");
   const key=row.gameId+"|"+row.playerId;
   if(seen.has(key))throw Error("Repeated player/game usage across reports");
   seen.add(key);ids.add(row.gameId);
   if(!players.has(row.playerId))players.set(row.playerId,[]);
   players.get(row.playerId).push(row);
   summary.playerGames++;
   if(row.type==="goalie")summary.goalies++;
   if(Number.isFinite(row.timeOnIceSeconds))summary.withToi++;else summary.missingToi++;
  }
  summary.games+=ids.size;
 }
 const playerMap=Object.fromEntries([...players].map(([id,rows])=>[id,rows.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId)]));
 return {schemaVersion:1,source:"official_NHL_final_gamecenter_boxscore",summary,players:playerMap,
  pregameStarterConfirmationsAvailable:false,injuryAvailabilityVerified:false};
}
function assessPlayerUsage(player,report,eventStartsAt){
 const current=Date.parse(eventStartsAt);
 if(!Number.isFinite(current))return {status:"unknown",reason:"unverified_event_start",observations:0};
 // Only use game-day stats STRICTLY prior to the local/UTC game date.
 // This conservatively excludes earlier same-day matches instead of risking lookahead.
 const date=new Date(current).toISOString().slice(0,10);
 const rows=(report?.players?.[String(player.playerId)]||[]).filter(x=>x.gameDate<date&&
  x.type===player.type&&Number.isFinite(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0);
 const seconds=rows.map(x=>x.timeOnIceSeconds);
 const avg=x=>x.reduce((s,v)=>s+v,0)/x.length;
 const five=seconds.slice(-5),ten=seconds.slice(-10);
 const n=seconds.length,mean=n?avg(seconds):null,short=n?avg(five):null;
 const shift=n>=5&&mean>0?(short-mean)/mean:null;
 const goalie=player.type==="goalie";
 const prior=rows.filter(x=>Number.isInteger(x.saves)&&x.saves>=0&&x.timeOnIceSeconds>=600);
 const goalieSavesPer60=prior.length>=5?
  prior.reduce((s,r)=>s+r.saves,0)*3600/prior.reduce((s,r)=>s+r.timeOnIceSeconds,0):null;
 const minutes=n>=5?Math.min(60,Math.max(0,(0.65*avg(ten)+0.35*short)/60)):null;
 return {status:n>=5?"observed_usage":"insufficient_minutes",
  reason:n>=5?null:"fewer_than_five_prior_verified_toi_games",
  observations:n,last5Minutes:five.length?Number((avg(five)/60).toFixed(2)):null,
  baselineMinutes:mean===null?null:Number((mean/60).toFixed(2)),
  expectedMinutesShadow:minutes===null?null:Number(minutes.toFixed(2)),
  minutesShiftPct:shift===null?null:Number((shift*100).toFixed(2)),
  goalieSavesPer60Shadow:goalieSavesPer60===null?null:Number(goalieSavesPer60.toFixed(3)),
  goalieGamesWithRate:prior.length,
  pregameStartConfirmed:false,injuryCleared:false,
  modelReadyForDeployment:false,usageIsHistoricalOnly:true,
  method:"past-only boxscore TOI; empirical 65% last-10 + 35% last-5 minutes; goalie saves/60 descriptive only"};
}
function assessPropRisk(player,report,eventStartsAt,market){
 const usage=assessPlayerUsage(player,report,eventStartsAt),reasons=[];
 if(market==="saves"||player.type==="goalie"){
  // No source in this project establishes NEXT game's starting goalie.
  reasons.push("STARTING_GOALIE_NOT_CONFIRMED");
  if(usage.status!=="observed_usage")reasons.push("INSUFFICIENT_VERIFIED_GOALIE_MINUTES");
 }else{
  if(usage.status!=="observed_usage")reasons.push("ICE_TIME_HISTORY_UNAVAILABLE");
  if(usage.minutesShiftPct!==null&&Math.abs(usage.minutesShiftPct)>25)
   reasons.push("RECENT_ICE_TIME_SHIFT_REVIEW");
 }
 // Missing pregame injury status is unknown, not a confirmed active roster.
 reasons.push("PREGAME_INJURY_STATUS_UNVERIFIED");
 const blocked=reasons.includes("STARTING_GOALIE_NOT_CONFIRMED")||
   reasons.includes("RECENT_ICE_TIME_SHIFT_REVIEW");
 return {usage,reasons,injuryStatus:"unknown",starterStatus:"unconfirmed",
  classification:blocked?"watchlist":"research_only",eligibleForResearchLineup:!blocked,
  verifiedBettingReadiness:false};
}
module.exports={MARKETS,parseToi,parseGoalieSaves,normalizeOfficialUsage,buildUsageIndex,assessPlayerUsage,assessPropRisk};
