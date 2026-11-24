"use strict";
// Shared descriptive player-context contract. No forecasts, ranking of picks,
// confidence percentages, payout calculations, or recommendations.
const number=x=>typeof x==="number"&&Number.isFinite(x);
const day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const id=x=>(typeof x==="string"&&x.trim()!=="")||Number.isSafeInteger(x);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const identity=r=>JSON.stringify([r.sport,r.gameId,r.playerId,r.market,r.period]);
function eligible(rows,scope){
 if(!scope||!day(scope.beforeDate)||!["NHL","NFL","NBA","MLB","CS2","Valorant","League of Legends"].includes(scope.sport)||typeof scope.market!=="string"||!scope.market||typeof scope.period!=="string"||!scope.period)return [];
 const groups=new Map();
 for(const r of rows||[]){
  if(!r||r.sport!==scope.sport||r.market!==scope.market||r.period!==scope.period||!id(r.gameId)||!id(r.playerId)||!day(r.gameDate)||r.gameDate>=scope.beforeDate)continue;
  const k=identity(r),a=groups.get(k)||[];a.push(r);groups.set(k,a);
 }
 return [...groups.values()].filter(a=>a.length===1).map(a=>a[0]).filter(r=>r.officialFinal===true&&r.participated===true&&number(r.value)).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||String(a.gameId).localeCompare(String(b.gameId)));
}
function summarize(rows,line){
 const values=rows.map(r=>r.value),n=values.length,above=values.filter(v=>v>line).length,below=values.filter(v=>v<line).length,push=n-above-below;
 return {n,above,below,push,average:mean(values),aboveRate:n?above/n:null,belowRate:n?below/n:null,decidedAboveRate:above+below?above/(above+below):null};
}
function playerProfile(rows,scope){
 if(!number(scope?.line)||!id(scope.playerId)||!id(scope.season))return null;
 const all=eligible(rows,scope).filter(r=>r.playerId===scope.playerId);
 const filtered=all.filter(r=>(!scope.opponent||r.opponent===scope.opponent)&&(!scope.venue||r.venue===scope.venue));
 const recent=filtered.slice(-15),season=filtered.filter(r=>r.season===scope.season),h2h=scope.matchupOpponent?all.filter(r=>r.opponent===scope.matchupOpponent):[];
 const streak=side=>{let n=0;for(const r of [...filtered].reverse()){if(side==="above"?r.value<=scope.line:r.value>=scope.line)break;n++;}return n;};
 const windows={last5:summarize(filtered.slice(-5),scope.line),last10:summarize(filtered.slice(-10),scope.line),last15:summarize(recent,scope.line),season:summarize(season,scope.line),headToHead:scope.matchupOpponent?summarize(h2h,scope.line):null,home:summarize(all.filter(r=>r.season===scope.season&&r.venue==="home"),scope.line),away:summarize(all.filter(r=>r.season===scope.season&&r.venue==="away"),scope.line)};
 const seasonKeys=[...new Set(filtered.map(r=>r.season).filter(id))];
 const bySeason=Object.fromEntries(seasonKeys.map(k=>[k,summarize(filtered.filter(r=>r.season===k),scope.line)]));
 // Fixed recency summary across archived seasons, calendar-day half-life.
 // It is a descriptive mean, not a fitted model or calibrated probability.
 const weighted=filtered.map(r=>({v:r.value,w:Math.pow(.5,(Date.parse(scope.beforeDate)-Date.parse(r.gameDate))/86400000/60)}));
 const total=weighted.reduce((s,r)=>s+r.w,0);
 const recentMean=windows.last10.average;
 return {kind:"descriptive_player_context_v1",windows,bySeason,recencyWeightedAverage:total>0?weighted.reduce((s,r)=>s+r.v*r.w,0)/total:null,recencyHalfLifeDays:60,line:scope.line,last10AverageMinusLine:recentMean===null?null:recentMean-scope.line,consecutiveAbove:streak("above"),consecutiveBelow:streak("below"),gameLog:recent.map(r=>({gameDate:r.gameDate,value:r.value,opponent:r.opponent??null,venue:r.venue??null})),historicalRatesAreForecasts:false,asOfHistoricalSourceAvailabilityVerified:false,recommendation:null,confidence:null};
}
// Opponent conceded value per qualifying opposing player appearance;
// equal denominator definition across teams, with complete-game evidence
// asserted by the adapter. Ranks are withheld for partial league coverage.
function opponentPositionTable(rows,scope){
 if(!id(scope?.season)||!scope.position||!Array.isArray(scope.leagueTeams)||scope.leagueTeams.length<2||new Set(scope.leagueTeams).size!==scope.leagueTeams.length)return null;
 const teams=new Set(scope.leagueTeams),games=new Map();
 for(const r of eligible(rows,scope)){
  if(r.season!==scope.season||r.position!==scope.position||r.completeGame!==true||!teams.has(r.opponent)||!teams.has(r.team)||r.team===r.opponent)continue;
  const key=JSON.stringify([r.opponent,r.gameId]),a=games.get(key)||[];a.push(r);games.set(key,a);
 }
 const grouped=new Map(scope.leagueTeams.map(t=>[t,[]]));
 for(const a of games.values())grouped.get(a[0].opponent).push({date:a[0].gameDate,gameId:a[0].gameId,values:a.map(r=>r.value),exposureSeconds:a.every(r=>number(r.exposureSeconds)&&r.exposureSeconds>0)?a.reduce((s,r)=>s+r.exposureSeconds,0):null});
 const metric=(team,n)=>{const a=grouped.get(team).sort((x,y)=>x.date.localeCompare(y.date)||String(x.gameId).localeCompare(String(y.gameId)));const g=n?a.slice(-n):a,v=g.flatMap(r=>r.values);const seconds=g.length&&g.every(x=>number(x.exposureSeconds)&&x.exposureSeconds>0)?g.reduce((s,x)=>s+x.exposureSeconds,0):null;return {games:g.length,appearances:v.length,allowedPerAppearance:mean(v),allowedPer60:seconds?3600*v.reduce((s,x)=>s+x,0)/seconds:null,rank:null,per60Rank:null};};
 const result=Object.fromEntries(scope.leagueTeams.map(t=>[t,{season:metric(t,0),last20:metric(t,20),last10:metric(t,10),last5:metric(t,5)}]));
 for(const [label,min] of [["season",5],["last20",20],["last10",10],["last5",5]]){
  const a=Object.values(result).map(r=>r[label]);
  if(a.some(r=>r.games<min||r.allowedPerAppearance===null))continue;
  for(const r of a)r.rank=1+a.filter(x=>x.allowedPerAppearance<r.allowedPerAppearance).length;
  if(a.every(r=>r.allowedPer60!==null))for(const r of a)r.per60Rank=1+a.filter(x=>x.allowedPer60<r.allowedPer60).length;
 }
 return {kind:"descriptive_position_allowed_v1",definition:"opponent conceded stat per qualifying opposing player appearance; rank 1 lowest",position:scope.position,market:scope.market,period:scope.period,teams:result,asOfHistoricalSourceAvailabilityVerified:false};
}
module.exports={eligible,summarize,playerProfile,opponentPositionTable};
