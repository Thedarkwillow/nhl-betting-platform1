"use strict";
// Paired OFFENSE and DEFENSE context. No target-day observations enter a
// prediction. Complete two-team boxscores only, per-market missingness stays null.
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {mass}=require("./nhl-recent-rate-forward-v1.cjs");
const MARKET_LINES={shotsOnGoal:[1.5,2.5,3.5],goals:[.5,1.5],assists:[.5,1.5],points:[.5,1.5],blockedShots:[.5,1.5,2.5],hits:[.5,1.5,2.5],faceoffsWon:[4.5,7.5,10.5],powerPlayPoints:[.5,1.5],saves:[19.5,24.5,29.5,34.5],goalsAgainst:[1.5,2.5,3.5],timeOnIce:[14.5,17.5,20.5,23.5]};
const raw=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","powerPlayPoints"],count=x=>Number.isInteger(x)&&x>=0;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function total(rows,k){return rows.every(r=>count(r[k]))?rows.reduce((s,r)=>s+r[k],0):null;}
function context(own,opp){
 const a=Object.fromEntries(raw.map(m=>[m,total(own,m)])),b=Object.fromEntries(raw.map(m=>[m,total(opp,m)]));
 const add=(x,y)=>x===null||y===null?null:x+y;
 const ownAttemptsProxy=add(a.shotsOnGoal,b.blockedShots),oppAttemptsProxy=add(b.shotsOnGoal,a.blockedShots),faceoffs=add(a.faceoffsWon,b.faceoffsWon);
 return {
  shotsOnGoal:[a.shotsOnGoal,b.shotsOnGoal],
  goals:[a.goals,b.goals],assists:[a.assists,b.assists],points:[a.points,b.points],
  powerPlayPoints:[a.powerPlayPoints,b.powerPlayPoints],
  blockedShots:[oppAttemptsProxy,ownAttemptsProxy], // defensive workload, not actual Corsi
  hits:[a.hits,b.hits],faceoffsWon:[faceoffs,faceoffs],
  saves:[b.shotsOnGoal,a.shotsOnGoal],goalsAgainst:[b.goals,a.goals],
  timeOnIce:[oppAttemptsProxy,ownAttemptsProxy]
 };
}
function updateTeams(rows,teams,league){
 const events=new Map();
 for(const g of rows)if(g.type==="skater"){const a=events.get(g.gameId)||[];a.push(g);events.set(g.gameId,a);}
 for(const rs of events.values()){
  const keys=[...new Set(rs.map(g=>canonical(g.team)))];
  if(keys.length!==2||keys.some(t=>!t||rs.filter(g=>canonical(g.team)===t).length!==18))continue;
  const groups=keys.map(t=>rs.filter(g=>canonical(g.team)===t));
  for(let i=0;i<2;i++){
   const team=teams.get(keys[i])||{};const signals=context(groups[i],groups[1-i]);
   for(const [m,v] of Object.entries(signals)){
    if(!v.every(Number.isFinite))continue;
    const z=team[m]??=[];z.push(v);if(z.length>30)z.shift();
    const l=league[m]??=[];l.push(v);if(l.length>1000)l.shift();
   }teams.set(keys[i],team);
  }
 }
}
function signal(m,own,opp,lg){
 if(own.length<5||opp.length<5||lg.length<20)return null;
 // offense markets: our production, opponent's conceded production.
 // workload markets: our defensive workload and opposing offensive activity.
 const special=["blockedShots","saves","goalsAgainst","timeOnIce"].includes(m);
 const x=own.slice(-15),y=opp.slice(-15),ref=lg.slice(-800);
 const ownRef=mean(ref.map(v=>v[0])),oppRef=mean(ref.map(v=>v[1]));
 if(!(ownRef>0&&oppRef>0))return null;
 const shrink=(v,n)=>clamp((v-1)*n/(n+20),-.2,.2);
 return {own:shrink(mean(x.map(v=>v[0]))/ownRef,x.length),opp:shrink(mean(y.map(v=>v[1]))/oppRef,y.length),ownN:x.length,oppN:y.length,role:special?"defensive_workload_and_opposing_attack":m==="faceoffsWon"?"total_faceoff_opportunities":m==="hits"?"physical_play_proxy":"own_attack_and_opponent_concession"};
}
function actual(g,m){return m==="timeOnIce"?g.type==="skater"?g.timeOnIceSeconds/60:null:g.type===(["saves","goalsAgainst"].includes(m)?"goalie":"skater")&&count(g[m])?g[m]:null;}
function predict(m,prior,own,opp,lg){
 const a=prior.filter(g=>Number.isFinite(actual(g,m))).slice(-20);if(a.length<8)return null;
 const ten=a.slice(-10),five=a.slice(-5),base=m==="timeOnIce"?.65*mean(ten.map(g=>actual(g,m)))+.35*mean(five.map(g=>actual(g,m))):a.reduce((s,g)=>s+actual(g,m),0)*(.65*mean(ten.map(g=>g.timeOnIceSeconds))+.35*mean(five.map(g=>g.timeOnIceSeconds)))/a.reduce((s,g)=>s+g.timeOnIceSeconds,0);
 if(!Number.isFinite(base)||base<0)return null;
 const f=signal(m,own,opp,lg);if(!f)return null;
 // TOI has conservative sensitivity; no inferred PP role and no full Corsi claims.
 const w=m==="timeOnIce"?.10:m==="hits"||m==="faceoffsWon"?.25:.50;
 const single=base*clamp(1+2*w*f.opp,.8,1.2),combined=base*clamp(1+w*(f.own+f.opp),.8,1.2);
 return {base,single,combined,signal:f,values:a.map(g=>actual(g,m)),count:a.length};
}
function probability(m,p,mu,line){
 if(m!=="timeOnIce")return mass(p.values,mu,line)?.higher??null;
 const center=mean(p.values);return (1+p.values.filter(v=>Math.max(0,v-center+mu)>line).length)/(p.values.length+2);
}
function maps(history,schedule,cutoff,reportFrom){
 const idx=scheduleIndex(schedule),teams=new Map(),league={},players=new Map(),days=new Map(),by={};
 for(const g of uniqueRows(history)){if(g.gameDate>=cutoff)continue;const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 for(const [d,rows] of days){
  if(d>=reportFrom)for(const g of rows){
   const own=canonical(g.team),opp=canonical(scheduledOpponent(g,idx));if(!own||!opp)continue;
   for(const [m,lines] of Object.entries(MARKET_LINES)){
    const y=actual(g,m);if(!Number.isFinite(y))continue;
    const p=predict(m,players.get(g.playerId)||[],teams.get(own)?.[m]||[],teams.get(opp)?.[m]||[],league[m]||[]);if(!p)continue;
    const a=by[m]??={n:0,k:0,games:new Set(),dates:new Set(),models:Object.fromEntries(["base","single","combined"].map(k=>[k,{mae:0,brier:0}]))};
    a.n++;a.games.add(g.gameId);a.dates.add(d);
    for(const k of Object.keys(a.models)){a.models[k].mae+=Math.abs(p[k]-y);for(const l of lines){const q=probability(m,p,p[k],l);a.models[k].brier+=(q-Number(y>l))**2;}}
    a.k+=lines.length;
   }
  }
  for(const g of rows){const a=players.get(g.playerId)||[];a.push(g);players.set(g.playerId,a.slice(-40));}
  updateTeams(rows,teams,league);
 }
 return {teams,league,players,idx,byMarket:Object.fromEntries(Object.entries(by).map(([m,a])=>[m,{playerGames:a.n,thresholds:a.k,distinctGames:a.games.size,distinctDates:a.dates.size,models:Object.fromEntries(Object.entries(a.models).map(([k,v])=>[k,{mae:v.mae/a.n,brier:v.brier/a.k}]))}]))};
}
function freeze(snapshot,c){
 const cutoff=String(snapshot.generatedAt||"");
 const found=[],seen=new Set(),players=snapshot.rankedProps||[];
 // Original offers only. No newly manufactured bets, no retroactive archive.
 for(const p of snapshot.individualPropSelections||[]){
  const m=p.market==="timeOnIceSeconds"?"timeOnIce":p.market;
  if(!MARKET_LINES[m]||!Number.isFinite(p.line)||Date.parse(p.gameStartAt)<=Date.parse(cutoff)+900000)continue;
  const key=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.lean]);
  const raw=players.filter(r=>r.gameId===p.gameId&&r.playerId===p.playerId&&r.market===p.market&&r.line===p.line&&r.tier===p.tier&&r.lean===p.lean&&r.capturedAt===p.capturedAt);
  const official=scheduledOpponent({gameId:p.gameId,gameDate:c.idx.get(p.gameId)?.gameDate,team:p.team},c.idx),id=c.idx.get(p.gameId);
  if(seen.has(key)||raw.length!==1||!id||canonical(official)!==canonical(p.opponent)||Date.parse(id.startTimeUTC)!==Date.parse(p.gameStartAt))continue;
  const x=predict(m,c.players.get(p.playerId)||[],c.teams.get(canonical(p.team))?.[m]||[],c.teams.get(canonical(p.opponent))?.[m]||[],c.league[m]||[]);if(!x)continue;
  const line=p.market==="timeOnIceSeconds"?p.line/60:p.line;
  const q=probability(m,x,x.combined,line);if(!Number.isFinite(q))continue;
  seen.add(key);found.push({gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,originalSide:p.lean,gameStartAt:p.gameStartAt,capturedAt:p.capturedAt,ownTeam:p.team,opponent:p.opponent,neutralProjection:x.base,opponentOnlyProjection:x.single,combinedProjection:x.combined,projectionUnits:m==="timeOnIce"?"minutes":"count",researchHigher:q,signals:x.signal,forecastConditionalOnAppearance:true,modelPromoted:false});
 }
 return found;
}
module.exports={MARKET_LINES,context,signal,predict,maps,freeze,updateTeams,actual,probability};
