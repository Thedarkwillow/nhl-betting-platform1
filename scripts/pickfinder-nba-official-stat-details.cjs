'use strict';

// Official full-game box-score statistics for independent retrospective checks.
// Do not infer a platform settlement, split scope or pregame availability.
const KIND='nba_official_web_final_stat_details_v1';
const SOURCE='nba.com official game box score';
const KEYS=['fieldGoalsMade','fieldGoalsAttempted','threePointersMade','threePointersAttempted',
 'freeThrowsMade','freeThrowsAttempted','reboundsOffensive','reboundsDefensive'];
const extraMetrics=Object.freeze({
 player_field_goals_made:['fieldGoalsMade','fgm'],
 player_field_goals_attempted:['fieldGoalsAttempted','fga'],
 player_free_throws_made:['freeThrowsMade','ftm'],
 player_free_throws_attempted:['freeThrowsAttempted','fta'],
 player_offensive_rebounds:['reboundsOffensive','o-reb'],
 player_defensive_rebounds:['reboundsDefensive','d-reb'],
 player_made_two_pointers:['twoPointersMade','2pm'],
 player_two_pointers_attempted:['twoPointersAttempted','2pa'],
 player_threes_attempted:['threePointersAttempted','3pa'],
 player_dunks:['dunks','dunk']
});
const STAT_KEYS=new Set(Object.values(extraMetrics).map(([key])=>key).filter(k=>k!=='dunks'));
const count=x=>Number.isSafeInteger(x)&&x>=0;
const HASH=/^[a-f0-9]{64}$/;
const CLOCK=Date.parse;
const EVENTS=new Set(['W','L']);
function playerStatistics(s){
 if(!s||!KEYS.every(k=>count(s[k]))||
    s.fieldGoalsMade>s.fieldGoalsAttempted||s.threePointersMade>s.threePointersAttempted||
    s.freeThrowsMade>s.freeThrowsAttempted||s.threePointersMade>s.fieldGoalsMade||
    s.threePointersAttempted>s.fieldGoalsAttempted||
    s.reboundsOffensive+s.reboundsDefensive!==s.reboundsTotal||
    2*s.fieldGoalsMade+s.threePointersMade+s.freeThrowsMade!==s.points)return null;
 const twoPointersMade=s.fieldGoalsMade-s.threePointersMade;
 const twoPointersAttempted=s.fieldGoalsAttempted-s.threePointersAttempted;
 if(twoPointersMade>twoPointersAttempted)return null;
 return Object.fromEntries([...STAT_KEYS].map(k=>[k,k==='twoPointersMade'?twoPointersMade:k==='twoPointersAttempted'?twoPointersAttempted:s[k]]));
}
// Count only typed made dunk shots in the completed official event log.
 // Every player's made two/three totals must reconcile to the final box score.
function dunkTotals(g,pbp){
 if(String(g?.gameId)!==String(pbp?.gameId)||pbp?.source!=='hanaV3'||
    !Array.isArray(pbp.actions)||!pbp.actions.length||pbp.actions.length>2500)return null;
 const players=new Map(),actions=new Set();
 for(const t of [g.homeTeam,g.awayTeam])for(const p of t.players){
  const s=p.statistics;
  if(!Number.isSafeInteger(p.personId)||players.has(p.personId)||
     !count(s?.fieldGoalsMade)||!count(s?.threePointersMade)||s.threePointersMade>s.fieldGoalsMade)return null;
  players.set(p.personId,{team:t.teamTricode,two:0,three:0,dunks:0,wantTwo:s.fieldGoalsMade-s.threePointersMade,wantThree:s.threePointersMade});
 }
 for(const a of pbp.actions){
  if(a.actionType!=='Made Shot')continue;
  const row=players.get(a.personId);
  if(!row||a.teamTricode!==row.team||a.isFieldGoal!==1||a.shotResult!=='Made'||
     !Number.isSafeInteger(a.actionNumber)||actions.has(a.actionNumber)||
     ![2,3].includes(a.shotValue)||typeof a.subType!=='string'||!a.subType.trim())return null;
  actions.add(a.actionNumber);
  if(a.shotValue===2)row.two++;else row.three++;
  if(/\bdunk\b/i.test(a.subType)){
   if(a.shotValue!==2)return null;
   row.dunks++;
  }
 }
 if(!actions.size||[...players.values()].some(x=>x.two!==x.wantTwo||x.three!==x.wantThree))return null;
 return new Map([...players].map(([id,p])=>[id,p.dunks]));
}
function buildStatDetails(web,final,observedAt){
 const d=final?.doc,g=web?.doc?.game;
 if(!d||!validFinal(d)||
    !d.rows?.length||!g||g.gameStatus!==3||Number(g.gameId)!==d.gameId||
    !Number.isFinite(CLOCK(g.gameTimeUTC))||CLOCK(g.gameTimeUTC)!==CLOCK(d.startAt)||
    !Number.isFinite(CLOCK(observedAt))||CLOCK(observedAt)<=CLOCK(d.startAt)||
    !HASH.test(final.digest||'')||!HASH.test(web.digest||'')||web.sourceUrl!==d.sourceUrl||
    !Array.isArray(g.homeTeam?.players)||!Array.isArray(g.awayTeam?.players))return null;
 if(d.scheduleEvidence?.finalScoreAgreement&&
    (d.scheduleEvidence.finalScoreAgreement.home!==g.homeTeam.score||d.scheduleEvidence.finalScoreAgreement.away!==g.awayTeam.score))return null;
 const rows=[],dunks=dunkTotals(g,web.doc.playByPlay);
 for(const p of d.rows){
  if(p.appeared!==true||p.identityVerified!==true||p.officialGameFinalVerified!==true||!EVENTS.has(p.wl))return null;
  const team=p.home?g.homeTeam:g.awayTeam,opp=p.home?g.awayTeam:g.homeTeam;
  const actual=team.players.filter(x=>x.personId===p.playerId);
  if(actual.length!==1||team.teamTricode!==p.team||opp.teamTricode!==p.opponent||
     (team.score>opp.score?'W':'L')!==p.wl||actual[0].statistics?.points!==p.points||
     actual[0].statistics?.reboundsTotal!==p.rebounds||actual[0].statistics?.threePointersMade!==p.threePointersMade)return null;
  const stats=playerStatistics(actual[0].statistics);
  if(!stats)return null;
  if(dunks)stats.dunks=dunks.get(p.playerId);
  rows.push({playerId:p.playerId,stats});
 }
 return {kind:KIND,source:SOURCE,sourceResponseSha256:web.digest,officialFinalDigest:final.digest,
  capturedAt:observedAt,gameId:d.gameId,rows,...(dunks?{dunksReconciledAgainstFinalFGM:true}:{}),
  retrospectiveOnly:true,originalPlatformSettlementVerified:false};
}
function validFinal(d){
 return d?.kind==='nba_official_web_final_history_v1'&&d.source===SOURCE&&d.officialFinalClockVerified===true&&
  Number.isSafeInteger(d.gameId)&&Number.isFinite(CLOCK(d.startAt))&&Number.isFinite(CLOCK(d.capturedAt))&&CLOCK(d.startAt)<CLOCK(d.capturedAt)&&
  /^https:\/\/www\.nba\.com\/game\/[a-z]{3}-vs-[a-z]{3}-[0-9]{10}\/box-score$/.test(d.sourceUrl||'')&&
  HASH.test(d.sourceResponseSha256||'')&&Array.isArray(d.rows)&&d.rows.length>=10;
}
function indexDetails(documents,finals,at){
 const out=new Map(),blocked=new Set(),official=new Map(finals.filter(f=>validFinal(f.doc)&&
  Number.isFinite(CLOCK(f.first))&&CLOCK(f.doc.capturedAt)<=CLOCK(f.first)+999&&CLOCK(f.first)<=at).map(x=>[x.digest,x]));
 for(const {doc:d,digest,first} of documents){
  const f=official.get(d?.officialFinalDigest);
  if(!f||d.gameId!==f.doc.gameId||d.kind!==KIND||d.source!==SOURCE||d.retrospectiveOnly!==true||
     d.originalPlatformSettlementVerified!==false||!HASH.test(digest||'')||!HASH.test(d.sourceResponseSha256||'')||
     !Number.isFinite(CLOCK(d.capturedAt))||!Number.isFinite(CLOCK(first))||
     CLOCK(d.capturedAt)>CLOCK(first)+999||CLOCK(first)>at||CLOCK(d.capturedAt)<=CLOCK(f.doc.startAt)||
     !Array.isArray(d.rows)||d.rows.length!==f.doc.rows.length)continue;
  const native=new Map(f.doc.rows.map(p=>[p.playerId,p])),seen=new Set(),safe=[];
  const hasDunks=d.dunksReconciledAgainstFinalFGM===true;
  for(const p of d.rows){
   const original=native.get(p.playerId),s=p.stats;
   if(!original||original.appeared!==true||original.identityVerified!==true||original.officialGameFinalVerified!==true||
      !Number.isSafeInteger(p.playerId)||seen.has(p.playerId)||!s||Object.keys(s).length!==STAT_KEYS.size+Number(hasDunks)||
      hasDunks&&(!count(s.dunks)||s.dunks>s.twoPointersMade)||
      [...STAT_KEYS].some(k=>!count(s[k]))||
      s.fieldGoalsMade!==s.twoPointersMade+original.threePointersMade||
      s.fieldGoalsAttempted!==s.twoPointersAttempted+s.threePointersAttempted||
      s.twoPointersMade>s.twoPointersAttempted||s.freeThrowsMade>s.freeThrowsAttempted||
      s.threePointersAttempted<original.threePointersMade||
      s.reboundsOffensive+s.reboundsDefensive!==original.rebounds||
      2*s.fieldGoalsMade+original.threePointersMade+s.freeThrowsMade!==original.points)break;
   seen.add(p.playerId);
   safe.push([JSON.stringify([String(p.playerId),String(d.gameId)]),s]);
  }
  if(safe.length!==d.rows.length)continue;
  for(const [k,stats] of safe){
   const old=out.get(k);
   if(old&&Object.keys(stats).some(m=>old.stats[m]!=null&&old.stats[m]!==stats[m]))blocked.add(k);
   else {
    const entry=old||{stats:{},metricEvidence:{}};
    for(const [m,value] of Object.entries(stats)){
     entry.stats[m]=value;
     if(!(m in entry.metricEvidence)||CLOCK(first)<CLOCK(entry.metricEvidence[m].first))entry.metricEvidence[m]={digest,first};
    }
    out.set(k,entry);
   }
  }
 }
 for(const k of blocked)out.delete(k);
 return out;
}
module.exports={buildStatDetails,indexDetails,playerStatistics,dunkTotals,extraMetrics,KIND,SOURCE};
