"use strict";
const {canonical}=require("./nhl-opponent-context.cjs");
const {prizePicksGoalieFantasyScore,underdogGoalieFantasyScore}=require("./nhl-four-priority-markets.cjs");
const valid=r=>Number.isInteger(r?.gameId)&&Number.isInteger(r?.playerId)&&["OFF","FINAL"].includes(r.gameState)&&["skater","goalie"].includes(r.type)&&typeof r.gameDate==="string"&&canonical(r.team)&&Number.isFinite(r.timeOnIceSeconds)&&r.timeOnIceSeconds>0;
const k=r=>r.gameId+"|"+r.playerId;
function mergeHistory(current,reports,pp=[],sh=[]){
 const map=new Map(),conflicts=new Set(),counts={current:0,prior:0,duplicates:0,conflicts:0,ppMatched:0,ppRejected:0,shMatched:0,shUnavailable:0,shRejected:0,shBackfillMatched:0,shBackfillRejected:0,prizePicksGoalieFantasy:0,underdogGoalieFantasy:0};
 function add(r,origin){if(!valid(r))return;const key=k(r),old=map.get(key);counts[origin]++;
  if(old){if(old.gameDate!==r.gameDate||canonical(old.team)!==canonical(r.team)||old.type!==r.type||["timeOnIceSeconds","shotsOnGoal","goals","assists","points","saves","goalsAgainst"].some(f=>Number.isFinite(old[f])&&Number.isFinite(r[f])&&old[f]!==r[f])){conflicts.add(key);return;}counts.duplicates++;const merged={...old};for(const [f,v] of Object.entries(r))if(merged[f]==null&&v!=null)merged[f]=v;map.set(key,merged);}
  else map.set(key,{...r});
 }
 for(const p of Object.values(current?.players||{}))for(const r of p.games||[])add(r,"current");
 for(const d of reports||[]){if(!Array.isArray(d.players)||d.errors?.length||d.scheduledGames!==d.completedGames||d.completedGames!==d.collectedGames||d.isolatedFromProductionPlayerHistory!==true)continue;for(const r of d.players)if(r.gameDate===d.requestedDate)add(r,"prior");}
 counts.conflicts=conflicts.size;for(const key of conflicts)map.delete(key);
 const seen=new Set();for(const p of pp){
  const r=map.get(k(p));
  if(seen.has(k(p))||!r||r.type!=="skater"||r.gameDate!==p.gameDate||
    r.timeOnIceSeconds!==p.timeOnIceSeconds||
    !Number.isInteger(p.powerPlayTimeOnIceSeconds)||
    p.powerPlayTimeOnIceSeconds<0||p.powerPlayTimeOnIceSeconds>r.timeOnIceSeconds){
    counts.ppRejected++;continue;
  }
  const sh=p.shortHandedTimeOnIceSeconds;
  if(sh!==undefined&&(!Number.isInteger(sh)||sh<0||
     sh+p.powerPlayTimeOnIceSeconds>r.timeOnIceSeconds||
     Number.isInteger(r.shortHandedTimeOnIceSeconds)&&
     r.shortHandedTimeOnIceSeconds!==sh)){
    counts.shRejected++;counts.ppRejected++;continue;
  }
  seen.add(k(p));r.powerPlayTimeOnIceSeconds=p.powerPlayTimeOnIceSeconds;
  r.powerPlaySource="NHL_stats_rest_skater_timeonice_exact_game";
  counts.ppMatched++;
  if(sh!==undefined){r.shortHandedTimeOnIceSeconds=sh;
    r.shortHandedSource="NHL_stats_rest_skater_timeonice_exact_game";
    counts.shMatched++;
  }else counts.shUnavailable++;
 }
 // Separate immutable backfill supplies only historical, exact-source SH
 // seconds. NEVER rewrite a previously committed PP archive in place.
 const seenSH=new Set();
 for(const p of sh){
  const key=k(p),r=map.get(key),secs=p.shortHandedTimeOnIceSeconds;
  if(seenSH.has(key)||!r||r.type!=="skater"||r.gameDate!==p.gameDate||
    r.timeOnIceSeconds!==p.timeOnIceSeconds||
    !Number.isInteger(secs)||secs<0||!Number.isInteger(r.powerPlayTimeOnIceSeconds)||
    secs+r.powerPlayTimeOnIceSeconds>r.timeOnIceSeconds||
    p.powerPlayTimeOnIceSeconds!==r.powerPlayTimeOnIceSeconds||
    Number.isInteger(r.shortHandedTimeOnIceSeconds)&&r.shortHandedTimeOnIceSeconds!==secs){
   counts.shBackfillRejected++;continue;
  }
  seenSH.add(key);r.shortHandedTimeOnIceSeconds=secs;
  r.shortHandedSource="NHL_stats_rest_skater_timeonice_exact_game_immutable_backfill";
  counts.shBackfillMatched++;
 }
 const history={players:{}};for(const r of map.values()){
  if(r.type==="goalie"){const p=prizePicksGoalieFantasyScore(r),u=underdogGoalieFantasyScore(r);r.prizePicksGoalieFantasyScore=p!==null&&r.prizePicksGoalieFantasyScore===p?p:null;r.underdogGoalieFantasyScore=u!==null&&r.underdogGoalieFantasyScore===u?u:null;counts.prizePicksGoalieFantasy+=Number(r.prizePicksGoalieFantasyScore!==null);counts.underdogGoalieFantasy+=Number(r.underdogGoalieFantasyScore!==null);}
  const p=history.players[r.playerId]??={playerId:r.playerId,type:r.type,games:[]};p.games.push(r);
 }
 for(const p of Object.values(history.players))p.games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 return {history,counts:{...counts,uniquePlayerGames:map.size,distinctDates:new Set([...map.values()].map(r=>r.gameDate)).size}};
}
function ppRows(response,expected,day){
 if(!Array.isArray(response?.data)||!Number.isInteger(response.total)||response.total!==response.data.length)throw Error("incomplete NHL timeonice response");
 const by=new Map(expected.filter(r=>r.type==="skater"&&valid(r)&&r.gameDate===day).map(r=>[k(r),r])),seen=new Set(),rows=[];let mismatch=0;
 for(const s of response.data){const id=Number(s.playerId),gid=Number(s.gameId),key=gid+"|"+id;if(!Number.isInteger(id)||!Number.isInteger(gid)||seen.has(key))throw Error("invalid or duplicate NHL timeonice identity");seen.add(key);
  const r=by.get(key),toi=s.timeOnIce,pp=s.ppTimeOnIce,sh=s.shTimeOnIce;
  if(!r||!Number.isInteger(toi)||toi!==r.timeOnIceSeconds||
    !Number.isInteger(pp)||pp<0||pp>toi||
    sh!==undefined&&(!Number.isInteger(sh)||sh<0||sh+pp>toi)){
    mismatch++;continue;
  }
  rows.push({gameId:gid,playerId:id,gameDate:day,timeOnIceSeconds:toi,
    powerPlayTimeOnIceSeconds:pp,
    ...(sh===undefined?{}:{shortHandedTimeOnIceSeconds:sh})});
 }
 return {rows,expected:by.size,mismatch};
}
module.exports={mergeHistory,ppRows};
