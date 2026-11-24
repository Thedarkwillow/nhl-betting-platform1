"use strict";
// Retrospective box scores only. Never infer pregame availability from final DNP.
const finite=Number.isFinite,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const normTeam=x=>({GS:"GSW",NY:"NYK",NO:"NOP",SA:"SAS",UTAH:"UTA",WSH:"WAS",PHO:"PHX",BKN:"BKN"}[x]||x);
const validDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&finite(Date.parse(x))&&new Date(Date.parse(x)).toISOString().slice(0,10)===x;
const validId=x=>typeof x==="string"&&/^\d+$/.test(x);
const pos=x=>["G","F","C"].includes(x)?x:null;
const stats=["points","rebounds","assists","threePointersMade","pra"];
const integer=x=>Number.isInteger(x)&&x>=0;
function normalizeGame(raw,id,at){
 const d=raw?.data,g=d?.game;
 if(!validId(id)||g?.game_id!==id||g.season!==2026||g.season_type!=="regular"||g.status!=="final"||!validDate(g.date)||!finite(Date.parse(g.starts_at))||!finite(Date.parse(at))||Date.parse(g.starts_at)>=Date.parse(at)||!validId(g.home?.team_id)||!validId(g.away?.team_id)||g.home.team_id===g.away.team_id||!Array.isArray(d.players)||!Array.isArray(d.team_stats)||d.team_stats.length!==2)throw Error("unverified game identity");
 const sides=[g.home,g.away],teams={},seen=new Set(),rows=[];
 for(const t of sides){
  if(!/^[A-Z]{2,4}$/.test(t.abbrev)||!integer(t.score))throw Error("invalid team");
  const a=d.team_stats.filter(x=>x.team_id===t.team_id);if(a.length!==1||a[0].pts!==t.score||!["fga","fta","oreb","tov"].every(k=>integer(a[0][k])))throw Error("invalid team totals");
  teams[t.team_id]={abbrev:normTeam(t.abbrev),points:t.score,possessionsProxy:a[0].fga+.44*a[0].fta-a[0].oreb+a[0].tov};
 }
 for(const p of d.players){
  if(!validId(p.player_id)||seen.has(p.player_id)||!teams[p.team_id]||typeof p.did_not_play!=="boolean"||typeof p.starter!=="boolean")throw Error("invalid player identity");seen.add(p.player_id);
  const base={id:p.player_id,teamId:p.team_id,position:pos(p.position),starter:p.starter,played:!p.did_not_play};
  if(p.did_not_play){if(p.starter)throw Error("inconsistent DNP");rows.push({...base,minutes:null});continue;}
  if(!finite(p.minutes)||p.minutes<=0||p.minutes>70||!["pts","reb","ast","tpm","fga","fta","tov"].every(k=>integer(p[k])))throw Error("incomplete player statistics");
  rows.push({...base,minutes:p.minutes,points:p.pts,rebounds:p.reb,assists:p.ast,threePointersMade:p.tpm,pra:p.pts+p.reb+p.ast,usageProxy:(p.fga+.44*p.fta+p.tov)/p.minutes});
 }
 if(!Number.isInteger(g.overtime_periods)||g.overtime_periods<0||g.overtime_periods>8)throw Error("invalid overtime");
 const expected=240+25*g.overtime_periods;
 for(const t of sides){
  const p=rows.filter(x=>x.teamId===t.team_id&&x.played);
  if(p.length<5||p.filter(x=>x.starter).length!==5||p.reduce((s,x)=>s+x.points,0)!==t.score||Math.abs(p.reduce((s,x)=>s+x.minutes,0)-expected)>p.length*.51)throw Error("incomplete team box score");
 }
 return {kind:"nba_dunk_rotation_box_v1",source:"DunkAPI",capturedAt:at,id,date:g.date,startAt:g.starts_at,teams,rows,finalParticipationOnly:true,completeDnpRosterVerified:false};
}
function priorBoxes(boxes,cut){
 if(!validDate(cut))throw Error("invalid cutoff");const seen=new Set();
 return boxes.filter(x=>x.kind==="nba_dunk_rotation_box_v1"&&x.date<cut).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>{if(seen.has(x.id))throw Error("duplicate box");seen.add(x.id);return x;});
}
function roleSplits(boxes,playerId,cut){
 const games=priorBoxes(boxes,cut),pairs=new Map();
 for(const g of games){
  const p=g.rows.find(x=>x.id===playerId&&x.played);if(!p)continue;
  for(const t of g.rows.filter(x=>x.teamId===p.teamId&&x.id!==p.id)){
   const key=JSON.stringify([p.teamId,t.id]),a=pairs.get(key)||{teamId:p.teamId,teammateId:t.id,with:[],without:[]};
   a[t.played?"with":"without"].push(p);pairs.set(key,a);
  }
 }
 const out=[];for(const a of pairs.values()){
  const summarize=b=>({games:b.length,minutes:mean(b.map(x=>x.minutes)),usageProxy:mean(b.map(x=>x.usageProxy)),...Object.fromEntries(stats.map(k=>[k,mean(b.map(x=>x[k]))]))});
  const w=summarize(a.with),wo=summarize(a.without);
  out.push({teamId:a.teamId,teammateId:a.teammateId,with:w,without:wo,minSampleMet:w.games>=5&&wo.games>=5,minutesDelta:w.games>=5&&wo.games>=5?wo.minutes-w.minutes:null,usageDelta:w.games>=5&&wo.games>=5?wo.usageProxy-w.usageProxy:null,retrospectiveOnly:true});
 }
 return out;
}
function positionDefense(boxes,cut,opponent,position,market){
 if(!pos(position)||!stats.includes(market))return null;
 const all=priorBoxes(boxes,cut),target=[],league=[];
 for(const g of all)for(const [defId,d] of Object.entries(g.teams)){
  const a=g.rows.filter(x=>x.teamId!==defId&&x.played&&x.position===position);
  const other=g.rows.filter(x=>x.teamId!==defId&&x.played);
  // Unknown/multi-position entries make position denominators incomplete.
  if(!a.length||other.some(x=>!x.position))continue;
  const minutes=a.reduce((s,x)=>s+x.minutes,0);
  if(minutes<12)continue;
  const row={id:g.id,team:d.abbrev,stat:a.reduce((s,x)=>s+x[market],0),minutes};
  (d.abbrev===normTeam(opponent)?target:league).push(row);
 }
 const rate=a=>a.reduce((s,x)=>s+x.stat,0)/a.reduce((s,x)=>s+x.minutes,0)*36;
 if(target.length<5||new Set(league.map(x=>x.id)).size<15||new Set(league.map(x=>x.team)).size<8)return null;
 const baseline=rate(league);if(!(baseline>0))return null;
 const value=rate(target),shrink=target.length/(target.length+10);
 return {position,market,opponent:normTeam(opponent),games:target.length,comparisonGames:new Set(league.map(x=>x.id)).size,allowedPer36:value,comparisonPer36:baseline,shrunkRatio:Math.max(.85,Math.min(1.15,1+shrink*(value/baseline-1))),sampleOnly:true,matchupAssignmentVerified:false};
}
function priorPosition(boxes,playerId,cut){
 const a=priorBoxes(boxes,cut).flatMap(g=>g.rows.filter(p=>p.id===playerId&&p.played&&p.position).map(p=>({position:p.position,teamId:p.teamId}))).slice(-5);
 if(a.length<3||new Set(a.map(x=>x.position)).size!==1||new Set(a.map(x=>x.teamId)).size!==1)return null;return a.at(-1);
}
function absenceAdjustment(splits,snapshot,cut,teamId,playerId){
 // Explicit observations from an authorized timestamped pregame source only.
 if(!snapshot||snapshot.kind!=="nba_pregame_availability_v1"||!finite(Date.parse(cut))||!finite(Date.parse(snapshot.observedAt))||Date.parse(snapshot.observedAt)>Date.parse(cut)||Date.parse(cut)-Date.parse(snapshot.observedAt)>6*3600000||!Array.isArray(snapshot.rows))return null;
 if(snapshot.rows.some(x=>x.playerId===playerId&&x.status!=="available"))return null;
 const out=snapshot.rows.filter(x=>x.team===teamId&&x.identityVerified===true&&x.status==="out"&&x.playerId!==playerId);
 if(out.length!==1||snapshot.rows.filter(x=>x.team===teamId&&x.playerId===out[0].playerId).length!==1)return null;
 // Single absence only, no additive extrapolation across correlated absences.
 const a=splits.filter(x=>x.teamId===teamId&&x.teammateId===out[0].playerId&&x.minSampleMet);
 if(a.length!==1)return null;const x=a[0];return {teammateId:x.teammateId,minutesDelta:Math.max(-5,Math.min(5,x.minutesDelta)),usageDelta:Math.max(-.15,Math.min(.15,x.usageDelta)),withGames:x.with.games,withoutGames:x.without.games,observedAt:snapshot.observedAt,associationNotCausal:true};
}
function pregameAbsenceCandidate(boxes,snapshot,target,playerId,market,threshold,priorLog,predictedMinutes){
 if(!snapshot||snapshot.kind!=="nba_pregame_availability_v1"||snapshot.gameIdNamespace!=="dunkapi:nba"||snapshot.gameId!==target.gameId||snapshot.gameDate!==target.date||snapshot.sourceUseAuthorized!==true||snapshot.sourceTimestampVerified!==true||!finite(Date.parse(snapshot.freezeAt))||!finite(Date.parse(snapshot.tipAt))||Date.parse(snapshot.tipAt)-Date.parse(snapshot.freezeAt)<900000||!stats.includes(market)||!finite(threshold)||!finite(predictedMinutes))return null;
 // The snapshot must be tied to the exact native game and pregame team, not its postgame box.
 const role=priorPosition(boxes,playerId,target.date);
 if(!role||snapshot.targetTeamId!==role.teamId||snapshot.rows?.filter(x=>x.playerId===playerId&&x.team===role.teamId&&x.identityVerified===true&&x.status==="available").length!==1)return null;
 const other=snapshot.rows.filter(x=>x.team===role.teamId&&x.playerId!==playerId);
 if(other.some(x=>!x.identityVerified||!["available","out"].includes(x.status))||snapshot.completeRosterVerified!==true)return null;
 const a=absenceAdjustment(roleSplits(boxes,playerId,target.date),snapshot,snapshot.freezeAt,role.teamId,playerId);if(!a)return null;
 const past=priorLog.filter(x=>validDate(x.date)&&x.date<target.date&&finite(x.minutes)&&x.minutes>0&&finite(x[market])).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
 if(past.length<12)return null;
 const minutes=Math.max(0,Math.min(48,predictedMinutes+a.minutesDelta));
 const adjusted=past.map(x=>x[market]/x.minutes*minutes);
 const p=(1+adjusted.filter(x=>x>threshold).length)/(2+adjusted.filter(x=>x!==threshold).length);
 return {...a,expectedMinutes:minutes,probability:p,source:snapshot.source,conditionalOnDecided:true,usageDeltaDescriptiveOnly:true};
}
module.exports={normalizeGame,roleSplits,positionDefense,priorPosition,absenceAdjustment,priorBoxes,pregameAbsenceCandidate};
