"use strict";
/**
 * Official NHL completed-game period stat reconstruction.
 * Gamecenter play-by-play -> counted events; NHL Stats REST shiftcharts ->
 * actual played seconds per player/period. Compare EACH full-game total to
 * the separately archived, final official NHL player boxscore. When an
 * event-count stat differs, quarantine that player's market for every period:
 * never silently award props using uncorrected play-by-play totals.
 *
 * This is a historical official-result DATA SOURCE, not original PrizePicks
 * or Underdog settlement proof or a trained predictive model.
 */
const PERIOD_MARKETS=Object.freeze([
 "shotsOnGoal","goals","assists","points","blockedShots",
 "saves","goalsAgainst","hits","faceoffsWon","timeOnIceSeconds"
]);
const STAT_FIELDS=Object.freeze({
 shotsOnGoal:"shotsOnGoal",goals:"goals",assists:"assists",
 points:"points",blockedShots:"blockedShots",saves:"saves",
 goalsAgainst:"goalsAgainst",hits:"hits",faceoffsWon:"faceoffsWon",
 timeOnIceSeconds:"timeOnIceSeconds"
});
const marketRole=Object.freeze({
 shotsOnGoal:"skater",goals:"skater",assists:"skater",
 points:"skater",blockedShots:"skater",saves:"goalie",
 goalsAgainst:"goalie",hits:"skater",faceoffsWon:"skater",
 timeOnIceSeconds:"either"
});
const int=x=>Number.isInteger(x)&&x>=0;
function seconds(mmss){
 if(typeof mmss!=="string")return null;
 const m=/^(\d{1,3}):([0-5]\d)$/.exec(mmss);
 return m?Number(m[1])*60+Number(m[2]):null;
}
function officialPbpUrl(gameId){
 if(!int(gameId)||gameId<1000000000)throw Error("Invalid NHL period game ID");
 return "https://api-web.nhle.com/v1/gamecenter/"+gameId+"/play-by-play";
}
function officialShiftsUrl(gameId,{start=0,limit=500}={}){
 if(!int(gameId)||gameId<1000000000||!int(start)||
  !Number.isInteger(limit)||limit<1||limit>500)throw Error("Invalid shift pagination");
 const q=new URLSearchParams({cayenneExp:"gameId="+gameId,
  start:String(start),limit:String(limit)});
 return "https://api.nhle.com/stats/rest/en/shiftcharts?"+q.toString();
}
function validateShiftPages(pages,gameId){
 if(!Array.isArray(pages)||!pages.length)throw Error("Missing official shiftchart pages");
 let total=null,all=[];
 for(const pg of pages){
  if(!Number.isInteger(pg?.total)||pg.total<0||
   !Array.isArray(pg?.data))throw Error("Invalid shiftchart response");
  if(total!==null&&pg.total!==total)throw Error("Changing official shiftchart total");
  total=pg.total;all.push(...pg.data);
 }
 if(!all.length||all.length!==total)
  throw Error("Incomplete NHL shiftchart pagination");
 const ids=new Set();
 for(const row of all){
  if(!int(row?.id)||ids.has(row.id)||row.gameId!==gameId||
   !int(row.playerId)||!int(row.period)||row.period<1||
   ![505,517].includes(row.typeCode)||
   (row.typeCode===517&&seconds(row.duration)===null))
   throw Error("Unverified NHL shiftchart row identity or duration");
  // 505 is a zero-time administrative event with null duration in the
  // live official shiftchart; only 517 rows represent played ice time.
  ids.add(row.id);
 }
 return all;
}
function shotAttemptEvidence(playByPlay,officialPlayers){
 const skaters=new Map(officialPlayers.filter(p=>p.type==="skater").map(p=>[p.playerId,p])),counts=new Map(),bad=new Set();let unknown=0;
 for(const e of playByPlay.plays){if(!["REG","OT"].includes(e.periodDescriptor?.periodType)||!["shot-on-goal","goal","missed-shot","blocked-shot"].includes(e.typeDescKey))continue;
  const d=e.details||{},id=e.typeDescKey==="goal"?d.scoringPlayerId:d.shootingPlayerId;if(!skaters.has(id)){unknown++;continue;}
  const a=counts.get(id)||{on:0,miss:0,blocked:0};if(e.typeDescKey==="missed-shot")a.miss++;else if(e.typeDescKey==="blocked-shot")a.blocked++;else a.on++;counts.set(id,a);
 }
 if(unknown)return [];
 return [...skaters.values()].flatMap(p=>{const a=counts.get(p.playerId)||{on:0,miss:0,blocked:0};if(!int(p.shotsOnGoal)||a.on!==p.shotsOnGoal||!int(p.timeOnIceSeconds)||p.timeOnIceSeconds<=0)return [];return [{gameId:p.gameId,gameDate:p.gameDate,playerId:p.playerId,team:p.team,shotAttempts:a.on+a.miss+a.blocked,shotsOnGoal:a.on,missedAttempts:a.miss,blockedAttempts:a.blocked,timeOnIceSeconds:p.timeOnIceSeconds,powerPlayTimeOnIceSeconds:int(p.powerPlayTimeOnIceSeconds)?p.powerPlayTimeOnIceSeconds:null,source:"official_final_pbp_sog_reconciled",attemptTotalIndependentlyVerified:false}];});
}
// Only reconcile actual intervals; matching boxscore total required for both
// skaters. Pair overlap is all situations, NOT an even-strength line label.
function sharedShiftEvidence(shifts,players){
 const map=new Map(),bad=new Set(),ids=new Set(),by=new Map(players.filter(x=>x.type==="skater").map(x=>[x.playerId,x]));
 for(const s of shifts){if(s.typeCode!==517||!by.has(s.playerId))continue;const start=seconds(s.startTime),end=seconds(s.endTime),duration=seconds(s.duration);
 if(ids.has(s.id)||start===null||end===null||end<start||end-start!==duration||!int(s.period)||s.period<1){bad.add(s.playerId);continue;}ids.add(s.id);
 const a=map.get(s.playerId)||[];a.push({period:s.period,start,end});map.set(s.playerId,a);}
 const valid=[];for(const [id,rows] of map){rows.sort((a,b)=>a.period-b.period||a.start-b.start);if(bad.has(id)||rows.some((x,i)=>i&&rows[i-1].period===x.period&&rows[i-1].end>x.start)||rows.reduce((t,x)=>t+x.end-x.start,0)!==by.get(id).timeOnIceSeconds)continue;valid.push(id);}
 const result=[];for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){const a=by.get(valid[i]),b=by.get(valid[j]);if(a.team!==b.team||a.gameId!==b.gameId)continue;let seconds=0;for(const x of map.get(a.playerId))for(const y of map.get(b.playerId))if(x.period===y.period)seconds+=Math.max(0,Math.min(x.end,y.end)-Math.max(x.start,y.start));if(seconds>0)result.push({gameId:a.gameId,gameDate:a.gameDate,team:a.team,playerIds:[a.playerId,b.playerId].sort((a,b)=>a-b),sharedIceSeconds:seconds,allSituations:true,individualIceTotalsReconciled:true});}
 return result;
}
function normalizeOfficialPeriods(playByPlay,shifts,officialPlayers){
 const gameId=playByPlay?.id;
 if(!int(gameId)||gameId<1000000000||
  !["OFF","FINAL"].includes(playByPlay.gameState)||
  !/^\d{4}-\d{2}-\d{2}$/.test(playByPlay.gameDate||"")||
  !Array.isArray(playByPlay.plays)||!Array.isArray(shifts)||
  !Array.isArray(officialPlayers)||!officialPlayers.length)
  throw Error("Require completed official NHL game, events, shiftchart, final players");
 const periods=new Set(playByPlay.plays.filter(p=>
  p.typeDescKey==="period-end"&&p.periodDescriptor?.periodType==="REG")
  .map(p=>p.periodDescriptor.number));
 if(![1,2,3].every(x=>periods.has(x)))
  throw Error("Three complete NHL regulation periods not verified");
 const official=new Map();
 for(const row of officialPlayers){
  if(row.gameId!==gameId||!int(row.playerId)||
   !["skater","goalie"].includes(row.type)||official.has(row.playerId))
   throw Error("Ambiguous final NHL player-game identity");
  official.set(row.playerId,row);
 }
 // Count only REG/OT events for NHL full-game reconciliation, never shootout.
 const events=new Map(),allEvents=new Map(),seenEvent=new Set();
 function add(map,id,stat){
  if(!int(id))return;
  const values=map.get(id)||{};
  values[stat]=(values[stat]||0)+1;map.set(id,values);
 }
 for(const play of playByPlay.plays){
  if(!int(play?.sortOrder)||seenEvent.has(play.sortOrder))
   throw Error("Duplicate/missing NHL play ordering identity");
  seenEvent.add(play.sortOrder);
  const period=play.periodDescriptor?.number,
   periodType=play.periodDescriptor?.periodType;
  if(!int(period)||!["REG","OT"].includes(periodType))continue;
  if(periodType==="REG"&&![1,2,3].includes(period))continue;
  const d=play.details||{},per=period<=3&&periodType==="REG"?
   (events.get(period)||new Map()):null;
  if(per)events.set(period,per);
  const one=(id,stat)=>{
   add(allEvents,id,stat);
   if(per)add(per,id,stat);
  };
  switch(play.typeDescKey){
   case "shot-on-goal":
    one(d.shootingPlayerId,"shotsOnGoal");
    one(d.goalieInNetId,"saves");break;
   case "goal":
    one(d.scoringPlayerId,"shotsOnGoal");
    one(d.scoringPlayerId,"goals");
    one(d.scoringPlayerId,"points");
    for(const aid of [d.assist1PlayerId,d.assist2PlayerId]){
     one(aid,"assists");one(aid,"points");
    }
    one(d.goalieInNetId,"goalsAgainst");
    break;
   case "blocked-shot":one(d.blockingPlayerId,"blockedShots");break;
   case "hit":one(d.hittingPlayerId,"hits");break;
   case "faceoff":one(d.winningPlayerId,"faceoffsWon");break;
   default:break;
  }
 }
 const shiftByPeriod=new Map(),shiftFull=new Map(),seenShifts=new Set();
 for(const shift of shifts){
  if(shift.gameId!==gameId||!int(shift.id)||seenShifts.has(shift.id)||
   !int(shift.playerId)||!int(shift.period)||shift.period<1)
   throw Error("Invalid NHL shift identity");
  seenShifts.add(shift.id);
  if(shift.typeCode!==517)continue; // shift (not administrative item)
  const s=seconds(shift.duration);
  if(s===null||s<0||s>1200)throw Error("Invalid official NHL shift duration");
  const full=shiftFull.get(shift.playerId)||0;
  shiftFull.set(shift.playerId,full+s);
  if(shift.period>=1&&shift.period<=3){
   const key=shift.period+"|"+shift.playerId;
   shiftByPeriod.set(key,(shiftByPeriod.get(key)||0)+s);
  }
 }
 const quarantined=[],matchStatus=new Map();
 for(const [id,p] of official){
  const errors=new Set(),actual=allEvents.get(id)||{};
  for(const [market,field] of Object.entries(STAT_FIELDS)){
   if(marketRole[market]!=="either"&&marketRole[market]!==p.type)continue;
   const expected=p[field];
   const reconstructed=field==="timeOnIceSeconds"?
    shiftFull.get(id):actual[field]||0;
   if(!int(expected)||!Number.isFinite(reconstructed)||expected!==reconstructed){
    errors.add(market);
    quarantined.push({playerId:id,market,reason:!int(expected)?
     "final_official_market_stat_missing":
     "event_or_shift_total_disagrees_with_official_final",
     official:int(expected)?expected:null,reconstructed:
      Number.isFinite(reconstructed)?reconstructed:null});
   }
  }
  matchStatus.set(id,errors);
 }
 const rows=[];
 for(const [playerId,p] of official)for(const period of [1,2,3]){
  const ice=shiftByPeriod.get(period+"|"+playerId);
  // Missing shift or zero TOI does not establish a valid period pick,
  // even if a player had no recorded event in that period.
  if(!int(ice)||ice<=0)continue;
  const counts=events.get(period)?.get(playerId)||{},errors=matchStatus.get(playerId);
  const stats={};
  for(const market of PERIOD_MARKETS){
   if(marketRole[market]!=="either"&&marketRole[market]!==p.type)continue;
   stats[market]=errors.has(market)?null:
    market==="timeOnIceSeconds"?ice:(counts[market]||0);
  }
  rows.push({gameId,gameDate:playByPlay.gameDate,playerId,
   type:p.type,period,playedInPeriod:true,timeOnIceSeconds:ice,
   stats,quarantinedMarkets:[...errors],
   periodCompleted:true,source:"NHL_GC_PLAY_BY_PLAY_AND_STATS_REST_SHIFTS",
   platformSettlementVerified:false});
 }
 return {schemaVersion:1,gameId,gameDate:playByPlay.gameDate,
  completedPeriods:[1,2,3],source:"official_NHL_final_event_and_shifts",
  sourceMatchedOfficialFinalGamecenter:true,shiftTotalRecords:shifts.length,
  eventTotalRecords:playByPlay.plays.length,
  sharedShiftRows:sharedShiftEvidence(shifts,officialPlayers),shotAttemptRows:shotAttemptEvidence(playByPlay,officialPlayers),playerPeriodRows:rows,quarantined,quarantinedCount:quarantined.length,
  exactPeriodPlayerParticipationFromShifts:true,
  originalPrizePicksOrUnderdogSettlementVerified:false,
  modelCalibrated:false,
  note:"NHL official period event results only. Source disagreements null out the affected player and stat. Time on ice derived from official shifts; platform period rules and actual settlement are separately verified."};
}
module.exports={PERIOD_MARKETS,officialPbpUrl,officialShiftsUrl,seconds,
 validateShiftPages,normalizeOfficialPeriods,shotAttemptEvidence,sharedShiftEvidence};
