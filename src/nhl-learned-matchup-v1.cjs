"use strict";
// Market-specific learned two-team model. Every held-out day is predicted
// before that day's update; season archives must preserve exact dates.
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {MARKET_LINES,updateTeams,actual,predict}=require("./nhl-two-team-matchup-research.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,dt=Date.parse;
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-25,25)));
const sum=a=>a.reduce((s,x)=>s+x,0);
const valid=x=>Number.isFinite(x);
const role=x=>({C:"C",L:"W",R:"W",LW:"W",RW:"W",F:"F",D:"D",G:"G"})[String(x?.position||x?.positionCode||"").toUpperCase()]||null;
function smoothProbability(values,mu,line){
 if(!values?.length||!values.every(valid)||!valid(mu)||!valid(line))return null;
 // Interpolated empirical threshold rather than discontinuous rounded counts.
 const center=mean(values),cut=Number.isInteger(line)?line+.5:line;
 return (1+sum(values.map(v=>clamp(v-center+mu-cut+.5,0,1))))/(values.length+2);
}
function playerContext(m,prior,team){
 const p=prior.filter(g=>canonical(g.team)===team&&valid(actual(g,m))).slice(-20);
 if(p.length<8)return null;
 const current=p.slice(-5),others=p.slice(0,-5);
 const recentIce=mean(current.map(g=>g.timeOnIceSeconds)),longIce=mean(p.map(g=>g.timeOnIceSeconds));
 const pp=p.filter(g=>Number.isFinite(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds>=0&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds);
 const ppShare=pp.length>=8?sum(pp.map(g=>g.powerPlayTimeOnIceSeconds))/sum(pp.map(g=>g.timeOnIceSeconds)):null;
 const ppRecent=current.filter(g=>Number.isFinite(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds>=0&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds);
 const ppShift=ppShare!==null&&ppRecent.length===5?clamp(sum(ppRecent.map(g=>g.powerPlayTimeOnIceSeconds))/sum(ppRecent.map(g=>g.timeOnIceSeconds))-ppShare,-.2,.2):null;
 return {ppShift,position:role(p.at(-1)),iceShift:clamp(recentIce/longIce-1,-.4,.4),ppShare,historicalPPObserved:ppShare!==null,priorSameTeam:p.length};
}
function fitState(){return {w:[0,0,0,0,0,0],games:new Set(),days:new Set()};}
function vector(p,ctx,positionFactor=0){return [1,p.signal.own,p.signal.opp,ctx?.iceShift??0,positionFactor,ctx?.ppShift??0];}
function modelMean(p,w,x){return p.base*clamp(Math.exp(sum(w.map((v,i)=>v*x[i]))),.75,1.25);}
function update(f,batch){
 if(!batch.length)return;
 const games=new Map();
 for(const r of batch){const a=games.get(r.id)||[];a.push(r);games.set(r.id,a);}
 const grad=Array(f.w.length).fill(0);
 for(const a of games.values())for(const r of a){const e=clamp((r.mu-r.y)/(r.base+1),-2,2);for(let i=0;i<grad.length;i++)grad[i]+=e*r.x[i]/a.length/games.size;}
 const eta=.15/Math.sqrt(1+f.days.size/30);
 f.w=f.w.map((x,i)=>clamp(x-eta*(grad[i]+.08*x),i===0?-.15:-1.5,i===0?.15:1.5));
 for(const r of batch){f.games.add(r.id);f.days.add(r.day);}
}
function study(history,schedule,{cutoff="9999-12-31",evaluationFrom="2026-07-01",sourceIndex=null,freezeWeightsFrom=null,trainFrom=null,snapshot=null,approved=null,now=null}={}){
 const idx=sourceIndex||scheduleIndex(schedule),teams=new Map(),lg={},players=new Map(),days=new Map(),fits=Object.fromEntries(Object.keys(MARKET_LINES).map(m=>[m,fitState()])),pos=new Map(),out={};
 const positionSignal=(m,t,p)=>{const a=pos.get([m,t,p].join("|"))||[],b=pos.get([m,"LEAGUE",p].join("|"))||[];return a.length>=8&&b.length>=40&&mean(b)>0?clamp((mean(a.slice(-15))/mean(b.slice(-500))-1)*a.length/(a.length+30),-.3,.3):0;};
 for(const r of uniqueRows(history)){if(r.gameDate>=cutoff)continue;const a=days.get(r.gameDate)||[];a.push(r);days.set(r.gameDate,a);}
 for(const [day,rows] of days){
  const pending=Object.fromEntries(Object.keys(fits).map(m=>[m,[]]));
  for(const g of rows){
   const own=canonical(g.team),opp=canonical(scheduledOpponent(g,idx));if(!own||!opp)continue;
   const prior=players.get(g.playerId)||[];
   for(const [m,lines] of Object.entries(MARKET_LINES)){
    const y=actual(g,m);if(!valid(y))continue;
    const p=predict(m,prior,teams.get(own)?.[m]||[],teams.get(opp)?.[m]||[],lg[m]||[]);if(!p)continue;
    const c=playerContext(m,prior,own),posFactor=c?.position?positionSignal(m,opp,c.position):0,x=vector(p,c,posFactor),f=fits[m],mu=modelMean(p,f.w,x);
    if(day>=evaluationFrom&&f.games.size>=30&&f.days.size>=10){
     const a=out[m]??={n:0,k:0,games:new Set(),dates:new Set(),positionRows:0,ppRows:0,iceRows:0,group:new Map(),models:Object.fromEntries(["base","opponentOnly","fixedBoth","learned"].map(k=>[k,{mae:0,brier:0,loss:0}]))};
     a.n++;a.games.add(g.gameId);a.dates.add(day);a.positionRows+=Number(!!c?.position);a.ppRows+=Number(c?.historicalPPObserved===true);a.iceRows+=Number(!!c);const pred={base:p.base,opponentOnly:p.single,fixedBoth:p.combined,learned:mu},gdiff=a.group.get(g.gameId)||{diff:0,n:0};
     for(const [k,value] of Object.entries(pred)){const z=a.models[k];z.mae+=Math.abs(value-y);for(const l of lines){const q=smoothProbability(p.values,value,l),hit=Number(y>l),b=(q-hit)**2;z.brier+=b;z.loss-=Math.log(clamp(hit?q:1-q,1e-8,1));if(k==="learned"){gdiff.diff+=b-(smoothProbability(p.values,p.base,l)-hit)**2;gdiff.n++;}}}
     a.k+=lines.length;a.group.set(g.gameId,gdiff);
    }
    pending[m].push({id:g.gameId,day,x,mu,y,base:p.base});
   }
  }
  if((!trainFrom||day>=trainFrom)&&(!freezeWeightsFrom||day<freezeWeightsFrom))for(const [m,b] of Object.entries(pending))update(fits[m],b);
  // Position groups use observed historical role, never the target's final role.
  const events=new Map();
  for(const g of rows){const a=players.get(g.playerId)||[];a.push(g);players.set(g.playerId,a.slice(-40));if(g.type==="skater"){const v=events.get(g.gameId)||[];v.push(g);events.set(g.gameId,v);}}
  for(const rs of events.values()){const clubs=[...new Set(rs.map(g=>canonical(g.team)))];if(clubs.length!==2||clubs.some(t=>rs.filter(g=>canonical(g.team)===t).length!==18))continue;for(const g of rs){const p=role(g),opp=canonical(scheduledOpponent(g,idx));if(!p||!opp)continue;for(const m of Object.keys(MARKET_LINES)){const y=actual(g,m);if(!valid(y))continue;for(const t of [opp,"LEAGUE"]){const k=[m,t,p].join("|"),a=pos.get(k)||[];a.push(y);pos.set(k,a.slice(-600));}}}}
  updateTeams(rows,teams,lg);
 }
 const frozen=[];
 if(snapshot&&now&&dt(snapshot.generatedAt)<=dt(now)&&dt(now)-dt(snapshot.generatedAt)<1800000){
  const seen=new Set(),fresh=t=>Number.isFinite(dt(t))&&dt(t)<=dt(now)&&dt(now)-dt(t)<=8*3600000;
  for(const o of snapshot.individualPropSelections||[]){
   const m=o.market,own=canonical(o.team),opp=canonical(o.opponent),id=idx.get(o.gameId),k=JSON.stringify([o.gameId,o.playerId,m,o.line,o.tier]);
   if(!MARKET_LINES[m]||!id||canonical(scheduledOpponent({gameId:o.gameId,gameDate:id.gameDate,team:own},idx))!==opp||seen.has(k)||!Number.isFinite(o.line)||dt(o.gameStartAt)<=dt(now)+900000||Math.abs(dt(id.startTimeUTC)-dt(o.gameStartAt))>300000)continue;
   const raw=(snapshot.rankedProps||[]).filter(p=>p.gameId===o.gameId&&p.playerId===o.playerId&&p.market===m&&p.line===o.line&&p.tier===o.tier&&p.lean===o.lean&&p.capturedAt===o.capturedAt);
   if(raw.length!==1||!fresh(o.capturedAt)||dt(o.capturedAt)>dt(snapshot.generatedAt))continue;
   const prior=players.get(o.playerId)||[],p=predict(m,prior,teams.get(own)?.[m]||[],teams.get(opp)?.[m]||[],lg[m]||[]),f=fits[m],c=playerContext(m,prior,own);
   if(!p||f.games.size<30||f.days.size<10)continue;
   const posFactor=c?.position?positionSignal(m,opp,c.position):0,x=vector(p,c,posFactor),mu=modelMean(p,f.w,x);
   const teamLine=approved?.dailyFaceoff?.lineups?.[own];let projectedRole=null;
   if(fresh(approved?.generatedAt)&&fresh(teamLine?.sourceCapturedAt)&&fresh(teamLine?.sourceUpdatedAt)&&dt(teamLine.sourceUpdatedAt)<=dt(teamLine.sourceCapturedAt)){
    const matches=(teamLine.players||[]).filter(z=>z.playerId===o.playerId&&canonical(z.team)===own&&!z.injuryStatus&&!z.gameTimeDecision);
    if(matches.length===1){const role=matches[0].roles||[],ev=role.filter(z=>z.categoryIdentifier==="ev"),pp=role.filter(z=>z.categoryIdentifier==="pp");if(ev.length===1&&/^[fd][1-4]$/.test(ev[0].groupIdentifier))projectedRole={line:ev[0].groupIdentifier,powerPlay:pp.length===1?pp[0].groupIdentifier:null,sourceAt:teamLine.sourceCapturedAt,projectedOnly:true};}
   }
   // Live projected lines have no matched training provenance; attach as
   // separate risk evidence. Never infer a confirmed role or force a boost.
   seen.add(k);frozen.push({gameId:o.gameId,playerId:o.playerId,market:m,line:o.line,tier:o.tier,side:o.lean,gameStartAt:o.gameStartAt,capturedAt:o.capturedAt,base:p.base,learned:mu,higher:smoothProbability(p.values,mu,o.line),originalHigher:raw[0].probabilities?.higher??null,priorRole:c,projectedRole,positionFactor:posFactor,weights:f.w,researchOnly:true,calibrated:false});
  }
 }
 const byMarket=Object.fromEntries(Object.entries(out).map(([m,a])=>[m,{playerGames:a.n,thresholds:a.k,games:a.games.size,dates:a.dates.size,positionRows:a.positionRows,iceRows:a.iceRows,ppHistoryRows:a.ppRows,weightNames:["intercept","ownTeam","opponent","iceShift","positionContext","historicalPPShift"],models:Object.fromEntries(Object.entries(a.models).map(([k,v])=>[k,{mae:v.mae/a.n,brier:v.brier/a.k,logLoss:v.loss/a.k}])),pairedGameCI:bootstrapGameBrierDifference([...a.group.values()]),weights:fits[m].w,trainingGames:fits[m].games.size,trainingDates:fits[m].days.size}]));
 return {kind:"nhl_learned_two_team_walkforward_v1",byMarket,syntheticThresholds:true,trainingEachDayAfterEvaluation:true,weightsFrozenFrom:freezeWeightsFrom,trainFrom,frozenRows:frozen,gameIdentitySource:sourceIndex?'source_reported_exact_two_team_game':'official_schedule',positionFromPriorPlayerGames:true,confirmedFutureLinesNotUsed:true,historicalPPShiftUsedWhenObserved:true,sourcePublicationClocksVerified:false,modelPromoted:false};
}
module.exports={study,smoothProbability,playerContext,fitState,update,modelMean,vector};
