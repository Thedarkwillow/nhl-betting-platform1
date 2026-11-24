"use strict";
const {scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const MARKETS=new Set(["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","powerPlayPoints","saves","goalsAgainst"]);
const dt=Date.parse,finite=Number.isFinite,valid=x=>Number.isInteger(x)&&x>=0,mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
function empirical(prior,line,n){const a=prior.slice(-n);return a.length>=8?(1+a.filter(x=>x>line).length)/(2+a.length):null;}
function candidate(raw,p10,p20){if(![raw,p10,p20].every(x=>finite(x)&&x>=0&&x<=1))return null;
 // Fixed a priori, not selected on the current holdout. Strong disagreement
 // triggers abstention, and all forecasts are shrunken toward no information.
 const p=.25*raw+.375*p10+.375*p20,q=.5+.75*(p-.5);
 return {higher:q,direction:q>=.5?"Higher":"Lower",agree:Math.sign(raw-.5)===Math.sign(p10-.5)&&Math.sign(p10-.5)===Math.sign(p20-.5),selected:Math.abs(q-.5)>=.06&&Math.sign(raw-.5)===Math.sign(p10-.5)&&Math.sign(p10-.5)===Math.sign(p20-.5)};
}
function freeze(snapshot,history,schedule,now,cutoff){
 if(!snapshot||!finite(dt(now))||!(dt(snapshot.generatedAt)<=dt(now))||dt(now)-dt(snapshot.generatedAt)>1800000)return [];
 const idx=scheduleIndex(schedule),seen=new Set(),out=[];
 for(const o of snapshot.individualPropSelections||[]){
  if(o.tier!=="Standard"||!MARKETS.has(o.market)||!finite(o.line)||o.line%1!==.5||!["Higher","Lower"].includes(o.lean)||seen.has(key(o))||!Number.isInteger(o.gameId)||!Number.isInteger(o.playerId))continue;
  const g=idx.get(o.gameId);if(!g||!finite(dt(g.startTimeUTC))||!finite(dt(o.gameStartAt))||Math.abs(dt(g.startTimeUTC)-dt(o.gameStartAt))>300000||canonical(scheduledOpponent({gameId:o.gameId,gameDate:g.gameDate,team:o.team},idx))!==canonical(o.opponent)||!finite(dt(o.capturedAt))||dt(o.capturedAt)>dt(snapshot.generatedAt)||dt(now)-dt(o.capturedAt)>1800000||dt(o.gameStartAt)-dt(now)<900000)continue;
  const raw=(snapshot.rankedProps||[]).filter(p=>key(p)===key(o)&&p.lean===o.lean&&p.capturedAt===o.capturedAt);
  if(raw.length!==1||!finite(raw[0].probabilities?.higher)||!finite(raw[0].probabilities?.lower)||Math.abs(raw[0].probabilities.higher+raw[0].probabilities.lower-1)>1e-4)continue;
  const role=["saves","goalsAgainst"].includes(o.market)?"goalie":"skater";
  const prior=(history.players[String(o.playerId)]?.games||[]).filter(x=>x.gameDate<cutoff&&x.gameId!==o.gameId&&canonical(x.team)===canonical(o.team)&&x.type===role&&["OFF","FINAL"].includes(x.gameState)&&x.timeOnIceSeconds>0&&valid(x[o.market])&&(role!=="goalie"||x.goalieStarted===true)).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-20);
  if(prior.length<10||new Set(prior.map(x=>x.gameId)).size!==prior.length)continue;
  const x=prior.map(v=>v[o.market]),p10=empirical(x,o.line,10),p20=empirical(x,o.line,20),p=raw[0].probabilities.higher,q=candidate(p,p10,p20);if(!q)continue;
  const originalSide=o.lean,offeredSame=q.direction===originalSide;
  seen.add(key(o));out.push({gameId:o.gameId,playerId:o.playerId,market:o.market,line:o.line,tier:o.tier,gameStartAt:o.gameStartAt,capturedAt:o.capturedAt,originalSide,rawHigher:p,last10Higher:p10,last20Higher:p20,challengerHigher:q.higher,challengerDirection:q.direction,selected:q.selected&&offeredSame,observations:prior.length,latestPriorGameDate:prior.at(-1).gameDate,oppositeSideOfferedUnverified:true,researchOnly:true});
 }
 return out;
}
function grade(records,history){
 const seen=new Set(),out={};
 for(const r of records){const k=key(r);if(seen.has(k))continue;seen.add(k);
  const a=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId&&["OFF","FINAL"].includes(g.gameState)&&g.type===(["saves","goalsAgainst"].includes(r.market)?"goalie":"skater")&&g.timeOnIceSeconds>0&&valid(g[r.market]));
  for(const tag of ["all","market:"+r.market,...(r.selected?["selected","selected:"+r.market]:[])]){
   const b=out[tag]??={registered:0,n:0,games:new Set(),dates:new Set(),hit:{model:0,challenger:0,alwaysHigher:0,alwaysLower:0,last10:0,last20:0},brier:{model:0,challenger:0,last10:0,last20:0},groups:{higher:new Map(),lower:new Map(),last10:new Map(),model:new Map()}};
   b.registered++;if(a.length!==1)continue;
   const y=Number(a[0][r.market]>r.line),hits={model:Number((r.originalSide==="Higher")===Boolean(y)),challenger:Number((r.challengerDirection==="Higher")===Boolean(y)),alwaysHigher:y,alwaysLower:1-y,last10:Number((r.last10Higher>=.5)===Boolean(y)),last20:Number((r.last20Higher>=.5)===Boolean(y))};
   b.n++;b.games.add(r.gameId);b.dates.add(a[0].gameDate);for(const [x,v] of Object.entries(hits))b.hit[x]+=v;
   for(const [x,p] of Object.entries({model:r.rawHigher,challenger:r.challengerHigher,last10:r.last10Higher,last20:r.last20Higher}))b.brier[x]+=(p-y)**2;
   for(const [x,base] of Object.entries({higher:hits.alwaysHigher,lower:hits.alwaysLower,last10:hits.last10,model:hits.model})){const g=b.groups[x].get(r.gameId)||{diff:0,n:0};g.diff+=base-hits.challenger;g.n++;b.groups[x].set(r.gameId,g);}
  }
 }
 return Object.fromEntries(Object.entries(out).map(([k,b])=>{const ci=Object.fromEntries(Object.entries(b.groups).map(([t,g])=>[t,bootstrapGameBrierDifference([...g.values()])]));const rates=Object.fromEntries(Object.entries(b.hit).map(([t,v])=>[t,b.n?v/b.n:null])),brier=Object.fromEntries(Object.entries(b.brier).map(([t,v])=>[t,b.n?v/b.n:null]));return [k,{registered:b.registered,decided:b.n,pending:b.registered-b.n,distinctGames:b.games.size,distinctDates:b.dates.size,hitRates:rates,brier,baselineMinusChallengerAccuracyCI:ci,reviewEligible:b.n>=200&&b.games.size>=60&&b.dates.size>=20&&Object.values(ci).every(v=>v&&v.upper<0)&&brier.challenger<brier.model&&brier.challenger<brier.last10&&brier.challenger<brier.last20,calibrationApproved:false,modelPromoted:false}];}));
}
module.exports={candidate,freeze,grade,key};
