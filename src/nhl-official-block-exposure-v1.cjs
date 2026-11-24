"use strict";
/** Exact official NHL final game PBP + shift defensive-zone starts.
 * No side is marked verified unless active skaters reconcile to boxscore TOI.
 * This output is historical only, never a retrospective pregame freeze.
 */
const {seconds}=require("./nhl-official-period-events.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const valid=x=>Number.isInteger(x)&&x>=0;
function zoneStarts(pbp,shifts,players){
 const gameId=pbp?.id,skaters=(players||[]).filter(x=>x.type==="skater");
 if(!Number.isInteger(gameId)||!["OFF","FINAL"].includes(pbp.gameState)||
  !Array.isArray(pbp.plays)||!Array.isArray(shifts)||skaters.length<20)
  return {status:"invalid_official_final_or_skater_coverage",rows:[]};
 const home=pbp.homeTeam,away=pbp.awayTeam;
 if(!Number.isInteger(home?.id)||!Number.isInteger(away?.id)||
  canonical(home.abbrev)===canonical(away.abbrev)||!canonical(home.abbrev)||
  !canonical(away.abbrev))return {status:"unverified_team_identity",rows:[]};
 const teams=new Map([[home.id,canonical(home.abbrev)],[away.id,canonical(away.abbrev)]]);
 const byId=new Map(skaters.map(x=>[x.playerId,x]));
 if(byId.size!==skaters.length||
   skaters.some(x=>x.gameId!==gameId||!valid(x.timeOnIceSeconds)||
     ![...teams.values()].includes(canonical(x.team))))
  return {status:"invalid_final_player_identity",rows:[]};
 const byShift=new Map(),bad=new Set(),seen=new Set();
 for(const sh of shifts){
  if(sh.typeCode!==517)continue;
  const sk=byId.get(sh.playerId);
  if(!sk)continue;
  const a=seconds(sh.startTime),b=seconds(sh.endTime),length=seconds(sh.duration);
  if(!valid(sh.id)||seen.has(sh.id)||sh.gameId!==gameId||
    !Number.isInteger(sh.period)||sh.period<1||a===null||b===null||
    b<=a||b-a!==length){bad.add(sh.playerId);continue;}
  seen.add(sh.id);
  const v=byShift.get(sh.playerId)||[];
  v.push({period:sh.period,start:a,end:b});byShift.set(sh.playerId,v);
 }
 for(const [id,intervals] of byShift){
  intervals.sort((a,b)=>a.period-b.period||a.start-b.start);
  const total=intervals.reduce((s,x)=>s+x.end-x.start,0);
  if(total!==byId.get(id).timeOnIceSeconds||
    intervals.some((x,i)=>i>0&&intervals[i-1].period===x.period&&
     intervals[i-1].end>x.start))bad.add(id);
 }
 if(bad.size||byShift.size!==skaters.length)
  return {status:"shift_total_or_roster_coverage_unverified",rows:[]};
 const faceoffs=pbp.plays.filter(x=>x.typeDescKey==="faceoff"&&
  ["REG","OT"].includes(x.periodDescriptor?.periodType));
 let verifiedEvenStrength=0,unresolved=0;
 const counts=new Map(skaters.map(x=>[x.playerId,0]));
 for(const e of faceoffs){
  const minute=seconds(e.timeInPeriod),period=e.periodDescriptor?.number,
   owner=e.details?.eventOwnerTeamId,zone=e.details?.zoneCode;
  if(minute===null||!Number.isInteger(period)||!teams.has(owner)||
    !["D","O","N"].includes(zone)){unresolved++;continue;}
  const active=new Map([...teams.values()].map(x=>[x,[]]));
  for(const sk of skaters){
   if(byShift.get(sk.playerId).some(s=>s.period===period&&
     s.start<=minute&&minute<s.end))active.get(canonical(sk.team)).push(sk.playerId);
  }
  // Apply only to verified five-versus-five faceoffs. Other strengths and
  // ambiguous event-to-shift joins never become estimated zone starts.
  if([...active.values()].some(x=>x.length!==5))continue;
  verifiedEvenStrength++;
  if(zone==="N")continue;
  const defensive=zone==="D"?teams.get(owner):
   [...teams.values()].find(x=>x!==teams.get(owner));
  if(!defensive){unresolved++;continue;}
  for(const id of active.get(defensive))counts.set(id,counts.get(id)+1);
 }
 if(verifiedEvenStrength<10||unresolved>0)
  return {status:"faceoff_event_shift_coverage_unverified",rows:[],
   faceoffs:faceoffs.length,verifiedEvenStrength,unresolved};
 return {status:"source_verified_completed_game",verifiedEvenStrength,
  faceoffs:faceoffs.length,unresolved,rows:skaters.map(p=>({
   gameId,playerId:p.playerId,team:canonical(p.team),
   gameDate:p.gameDate,defensiveZoneStarts:counts.get(p.playerId),
   defensiveZoneStartSource:"NHL_official_shift_faceoff_onice_reconciled"
  }))};
}
function reconcileAttemptDay(puck,skaters,attempts,date){
 if(!Number.isInteger(puck?.total)||!Array.isArray(puck?.data)||
  puck.total!==puck.data.length||!/^\d{4}-\d\d-\d\d$/.test(date))
  throw Error("Incomplete official independent attempt inventory");
 const orig=new Map(),match=new Map(),seen=new Set();
 for(const p of skaters){
  if(p.type!=="skater"||p.gameDate!==date)continue;
  const k=p.gameId+"|"+p.playerId;
  if(orig.has(k))throw Error("Duplicate official original skater");
  orig.set(k,p);
 }
 for(const x of puck.data){
  if(!Number.isInteger(x.gameId)||!Number.isInteger(x.playerId))throw Error("Bad puck possession identity");
  const k=x.gameId+"|"+x.playerId;
  if(seen.has(k))throw Error("Duplicate independent attempt identity");seen.add(k);
  if(orig.has(k)&&valid(x.shotAttempts))match.set(k,x.shotAttempts);
 }
 const byGame=new Map();
 for(const p of skaters.filter(p=>p.type==="skater"&&p.gameDate===date)){
  const a=byGame.get(p.gameId)||[];a.push(p);byGame.set(p.gameId,a);
 }
 const indexed=new Map();
 for(const a of attempts||[]){
  const k=a.gameId+"|"+a.playerId;
  if(indexed.has(k))throw Error("Duplicate event shot attempts");indexed.set(k,a);
 }
 const rows=[],games=[];
 for(const [gameId,players] of byGame){
  const teams=[...new Set(players.map(x=>canonical(x.team)))];
  if(teams.length!==2||players.length<24||
    teams.some(t=>players.filter(x=>canonical(x.team)===t).length<12))continue;
  if(players.some(p=>{
   const k=gameId+"|"+p.playerId,a=indexed.get(k);
   return !a||!valid(a.shotAttempts)||a.shotAttempts!==match.get(k)||
    a.shotsOnGoal!==p.shotsOnGoal||a.gameDate!==date||
    canonical(a.team)!==canonical(p.team);
  }))continue;
  const sums=Object.fromEntries(teams.map(t=>[t,players.filter(p=>
   canonical(p.team)===t).reduce((s,p)=>s+indexed.get(gameId+"|"+p.playerId).shotAttempts,0)]));
  for(const p of players){
   const other=teams.find(t=>t!==canonical(p.team));
   rows.push({gameId,gameDate:date,playerId:p.playerId,team:canonical(p.team),
    opponentShotAttempts:sums[other],
    opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified"});
  }
  games.push(gameId);
 }
 return {rows,verifiedGames:games,source:"NHL_Gamecenter_events_independently_reconciled_to_Stats_REST_puckPossessions",candidateGames:byGame.size};
}

/**
 * Official Gamecenter shot-attempt totals by shooting team for one FINAL game.
 * Includes shot-on-goal, goal, missed-shot and blocked-shot events. NHL event
 * owner is the shooting team; final SOG must reconcile to BOTH Gamecenter
 * and the separately archived official skater boxscore before any counts pass.
 * No season-to-date rate is mislabelled as an actual per-game attempt count.
 */
function officialTeamAttemptEvidence(pbp,officialPlayers){
 const gameId=pbp?.id,home=pbp?.homeTeam,away=pbp?.awayTeam;
 const fail=(reason)=>({status:reason,rows:[]});
 if(!Number.isInteger(gameId)||!["OFF","FINAL"].includes(pbp.gameState)||
   !Array.isArray(pbp.plays)||!Number.isInteger(home?.id)||
   !Number.isInteger(away?.id)||home.id===away.id||
   !valid(home.sog)||!valid(away.sog)||
   canonical(home.abbrev)===canonical(away.abbrev))
  return fail("invalid_official_gamecenter_final_identity");
 const teams=new Map([[home.id,canonical(home.abbrev)],[away.id,canonical(away.abbrev)]]);
 const skaters=(officialPlayers||[]).filter(p=>p.type==="skater"),
  byTeam=new Map([...teams.values()].map(t=>[t,[]]));
 if(skaters.some(p=>p.gameId!==gameId||!valid(p.playerId)||
   !byTeam.has(canonical(p.team))||!valid(p.shotsOnGoal)||
   p.gameDate!==pbp.gameDate))return fail("original_skater_team_or_game_mismatch");
 for(const p of skaters)byTeam.get(canonical(p.team)).push(p);
 if([...byTeam.values()].some(a=>a.length<12||a.length>21))
  return fail("incomplete_final_skater_team_roster");
 const total=new Map([...teams.values()].map(t=>[t,{sog:0,attempts:0}])),
  ids=new Set(),periodEnds=new Set();
 for(const e of pbp.plays){
  if(e.typeDescKey==="period-end"&&e.periodDescriptor?.periodType==="REG")
   periodEnds.add(e.periodDescriptor.number);
  if(!["REG","OT"].includes(e.periodDescriptor?.periodType)||
   !["goal","shot-on-goal","missed-shot","blocked-shot"].includes(e.typeDescKey))
   continue;
  if(!Number.isInteger(e.eventId)||ids.has(e.eventId)||
   !teams.has(e.details?.eventOwnerTeamId))
   return fail("missing_or_ambiguous_shooting_team_event");
  ids.add(e.eventId);
  const t=teams.get(e.details.eventOwnerTeamId),row=total.get(t);
  row.attempts++;
  if(e.typeDescKey==="shot-on-goal"||e.typeDescKey==="goal")row.sog++;
 }
 if(![1,2,3].every(n=>periodEnds.has(n))||!ids.size)
  return fail("incomplete_regulation_or_no_shot_events");
 for(const [id,t] of teams){
  const gamecenterSOG=id===home.id?home.sog:away.sog;
  const officialSOG=byTeam.get(t).reduce((acc,p)=>acc+p.shotsOnGoal,0);
  if(officialSOG!==gamecenterSOG||total.get(t).sog!==gamecenterSOG)
   return fail("official_final_sog_and_events_do_not_reconcile");
 }
 // Separate official SOG-conceded evidence from attempted shots generated by
 // the opponent. SOG reconciles to official game/box score above.
 // Scoring concessions require an ADDITIONAL complete skater-scoring and
 // Gamecenter goal-event reconciliation. Shootout score mismatches abstain.
 const allSkaterScoring=skaters.length>=24&&skaters.every(p=>
  valid(p.goals)&&valid(p.assists)&&valid(p.points)&&p.points===p.goals+p.assists);
 const goalsInPbp=new Map([...teams.values()].map(t=>[t,0]));
 for(const e of pbp.plays){
  if(e.typeDescKey==="goal"&&["REG","OT"].includes(e.periodDescriptor?.periodType)&&
     teams.has(e.details?.eventOwnerTeamId)){
   const t=teams.get(e.details.eventOwnerTeamId);
   goalsInPbp.set(t,goalsInPbp.get(t)+1);
  }
 }
 const scoring= new Map();
 let scoringVerified=allSkaterScoring&&valid(home.score)&&valid(away.score);
 if(scoringVerified)for(const [id,t] of teams){
  const players=byTeam.get(t);
  const goals=players.reduce((s,p)=>s+p.goals,0),
   assists=players.reduce((s,p)=>s+p.assists,0),
   score=id===home.id?home.score:away.score;
  if(goals!==score||goals!==goalsInPbp.get(t)||assists>2*goals)
   scoringVerified=false;
  scoring.set(t,{goals,assists,points:goals+assists});
 }
 const rows=[];
 for(const [id,t] of teams){
  const opponent=[...teams.values()].find(x=>x!==t),
   oppAttempts=total.get(opponent).attempts,
   oppSog=total.get(opponent).sog,
   oppScoring=scoring.get(opponent);
  for(const p of byTeam.get(t))
   rows.push({gameId,gameDate:pbp.gameDate,playerId:p.playerId,
    team:t,opponentShotAttempts:oppAttempts,
    opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified",
    opponentShotsOnGoal:oppSog,
    opponentSogConcessionSource:"NHL_official_SOG_independently_reconciled",
    ...(scoringVerified?{
     opponentTeamGoals:oppScoring.goals,
     opponentTeamAssists:oppScoring.assists,
     opponentTeamPoints:oppScoring.points,
     opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
    }:{})});
 }
 return {status:"source_verified_final_official_team_attempts",rows,
  source:"NHL_Gamecenter_all_shot_events_reconciled_to_final_official_team_sog",
  officialPlayerSOGReconciled:true,eventOwnerTeamIdsVerified:true,
  opponentSogConcessionVerified:true,opponentScoringConcessionsVerified:scoringVerified};
}
module.exports={zoneStarts,reconcileAttemptDay,officialTeamAttemptEvidence};