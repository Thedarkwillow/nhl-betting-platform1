"use strict";
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const MARKETS={shotsOnGoal:[1.5,2.5,3.5],goals:[.5,1.5],assists:[.5,1.5],points:[.5,1.5,2.5],blockedShots:[.5,1.5,2.5],hits:[.5,1.5,2.5],faceoffsWon:[4.5,7.5,10.5],powerPlayPoints:[.5,1.5],saves:[19.5,24.5,29.5,34.5],goalsAgainst:[1.5,2.5,3.5],timeOnIceSeconds:[870,1050,1230,1410],prizePicksGoalieFantasyScore:[10.5,15.5,20.5],underdogGoalieFantasyScore:[10.5,15.5,20.5],plusMinus:[-.5,.5,1.5]};
const countMarkets=new Set(Object.keys(MARKETS).filter(k=>!["timeOnIceSeconds","prizePicksGoalieFantasyScore","underdogGoalieFantasyScore","plusMinus"].includes(k)));
const goalies=new Set(["saves","goalsAgainst","prizePicksGoalieFantasyScore","underdogGoalieFantasyScore"]);
const sum=a=>a.reduce((s,x)=>s+x,0),mean=a=>sum(a)/a.length,dt=Date.parse,finite=Number.isFinite,clip=p=>Math.max(.0001,Math.min(.9999,p)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const eligible=(g,m)=>["OFF","FINAL"].includes(g.gameState)&&g.timeOnIceSeconds>0&&g.timeOnIceSeconds<=3900&&g.type===(goalies.has(m)?"goalie":"skater")&&(!goalies.has(m)||g.goalieStarted===true)&&finite(g[m])&&(!countMarkets.has(m)||Number.isInteger(g[m])&&g[m]>=0);
function distribution(values,mu,line,kind){
 const a=values.slice(-30);if(a.length<8||!a.every(finite)||!finite(mu)||!finite(line))return null;
 const integer=kind==="count",center=mean(a),v=mean(a.map(x=>(x-center)**2));
 if(integer&&(mu<0||line<0||!a.every(x=>Number.isInteger(x)&&x>=0)))return null;
 const empirical=(1+a.filter(x=>x>line).length)/(2+a.length);
 // Count model evaluated on half lines; score exact integer pushes elsewhere.
 if(integer&&line%1!==.5)return null;
 const shift=(1+a.filter(x=>(integer?Math.max(0,Math.round(x-center+mu)):x-center+mu)>line).length)/(a.length+2);
 if(!integer){const spread=Math.max(Math.sqrt(v),kind==="time"?45:kind==="signed"?1:2),logistic=1/(1+Math.exp(clamp((line-mu)*1.7/spread,-30,30)));return {empirical,shifted:shift,continuousBlend:clip(.5*shift+.5*logistic)};}
 const floor=Math.floor(line);
 let p=Math.exp(-mu),cdf=p;for(let i=1;i<=floor;i++){p*=mu/i;cdf+=p;}
 const poisson=clip(1-cdf);
 // Shrunk method of moments for overdispersion; Poisson fallback near zero.
 const alpha=center>0?Math.max(0,(v-center)/(center*center))*a.length/(a.length+20):0;
 let nb=poisson;
 if(alpha>.01&&mu>0){const r=clamp(1/alpha,.25,100),q=r/(r+mu);let mass=Math.exp(r*Math.log(q)),tot=mass;for(let i=1;i<=floor;i++){mass*=(i-1+r)/i*(1-q);tot+=mass;}nb=clip(1-tot);}
 // Hurdle: smooth observed zero frequency, positive empirical distribution
 // shifted separately; never invent a zero-inflation effect from target.
 const positive=a.filter(x=>x>0);let hurdle=poisson;
 if(positive.length>=4){const hit=(positive.length+1)/(a.length+2),posMu=Math.max(1,mu/hit),posCenter=mean(positive);hurdle=clip(hit*(1+positive.filter(x=>Math.max(1,Math.round(x-posCenter+posMu))>line).length)/(positive.length+1));}
 return {empirical,shifted:shift,poisson,negativeBinomial:nb,hurdle,blend:clip(.5*shift+.5*nb)};
}
function variants(prior,m,line){const a=prior.filter(g=>eligible(g,m)).slice(-30);if(a.length<10)return null;
 const vals=a.map(g=>g[m]),kind=countMarkets.has(m)?"count":m==="timeOnIceSeconds"?"time":m==="plusMinus"?"signed":"fantasy";
 const mu=kind==="count"?sum(vals)*(.65*mean(a.slice(-10).map(g=>g.timeOnIceSeconds))+.35*mean(a.slice(-5).map(g=>g.timeOnIceSeconds)))/sum(a.map(g=>g.timeOnIceSeconds)):.65*mean(vals)+.35*mean(vals.slice(-5));
 return distribution(vals,mu,line,kind);
}
function state(){return {n:0,models:{},games:new Set(),dates:new Set()};}
function score(b,ps,y,g,date){b.n++;b.games.add(g);b.dates.add(date);for(const [m,p] of Object.entries(ps)){const o=b.models[m]??={n:0,brier:0,loss:0,hit:0,diff:new Map()};o.n++;o.brier+=(p-y)**2;o.loss-=Math.log(y?clip(p):clip(1-p));o.hit+=Number((p>=.5)===Boolean(y));const q=o.diff.get(g)||{n:0,diff:0};q.n++;q.diff+=(p-y)**2-(ps.empirical-y)**2;o.diff.set(g,q);}}
function summarize(b){return {thresholds:b.n,games:b.games.size,dates:b.dates.size,models:Object.fromEntries(Object.entries(b.models).map(([m,o])=>[m,{n:o.n,brier:o.brier/o.n,logLoss:o.loss/o.n,hitRate:o.hit/o.n,vsEmpiricalCI:bootstrapGameBrierDifference([...o.diff.values()])}]))};}
function prepare(history,schedule,{cutoff="9999-12-31",holdout="2026-07-01"}={}){
 const idx=scheduleIndex(schedule),days=new Map(),prior=new Map(),out={},train={};
 for(const g of uniqueRows(history)){if(g.gameDate>=cutoff)continue;const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 for(const [day,rs] of days){
  for(const g of rs){if(!scheduledOpponent(g,idx))continue;
   const h=(prior.get(g.playerId)||[]).filter(x=>canonical(x.team)===canonical(g.team));
   for(const [m,lines] of Object.entries(MARKETS)){if(!eligible(g,m))continue;for(const line of lines){if(g[m]===line)continue;const ps=variants(h,m,line);if(!ps)continue;const outMap=day<holdout?train:out,b=outMap[m]??=state();score(b,ps,Number(g[m]>line),g.gameId,day);}}
  }
  for(const g of rs){const a=prior.get(g.playerId)||[];a.push(g);prior.set(g.playerId,a.slice(-40));}
 }
 // Select one exploratory distribution using earlier seasons only, no
 // holdout winners retroactively selected. Never activate in production.
 const selected={};for(const [m,b] of Object.entries(train)){if(b.n<300||b.games.size<40||b.dates.size<20)continue;selected[m]=Object.keys(b.models).sort((a,z)=>b.models[a].brier/b.models[a].n-b.models[z].brier/b.models[z].n||a.localeCompare(z))[0];}
 return {prior,idx,selected,report:{training:Object.fromEntries(Object.entries(train).map(([k,v])=>[k,summarize(v)])),holdout:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,summarize(v)])),trainingSelected:selected,holdoutFrom:holdout,syntheticThresholds:true,signedAndContinuousSeparate:true,modelPromoted:false}};
}
function availability(p,approved,asOf){
 const t=dt(asOf),start=dt(p.gameStartAt),fresh=x=>finite(dt(x))&&dt(x)<=t&&dt(x)<start&&t-dt(x)<=8*3600000;
 const team=canonical(p.team),opp=canonical(p.opponent),goalie=goalies.has(p.market);
 if(!fresh(approved?.generatedAt)||!fresh(approved?.dailyFaceoff?.sourceCapturedAt))return {status:"missing_or_stale",risk:true,roleConfirmed:false};
 const d=approved.dailyFaceoff,games=(d.games||[]).filter(g=>g.gameId===p.gameId&&finite(dt(g.eventStartsAt))&&Math.abs(dt(g.eventStartsAt)-start)<=300000&&[canonical(g.home),canonical(g.away)].includes(team)&&[canonical(g.home),canonical(g.away)].includes(opp)&&team!==opp);
 if(games.length!==1)return {status:"schedule_unmatched",risk:true,roleConfirmed:false};
 if(goalie){const rows=(games[0].goalies||[]).filter(x=>x.team===team),exact=rows.filter(x=>x.playerId===p.playerId);
  if(rows.length!==1||exact.length!==1)return {status:"different_or_unknown_starter",risk:true,roleConfirmed:false};
  const x=exact[0],reported=x.status==="reported_confirmed"&&fresh(x.reportAt),official=x.originalClubStarterConfirmed===true&&fresh(x.reportAt);
  return {status:official?"official_starter":reported?"reporter_starter":"unconfirmed_starter",risk:!official,roleConfirmed:official,reportAt:x.reportAt||null,sourceAt:d.sourceCapturedAt};
 }
 const line=d.lineups?.[team];if(!fresh(line?.sourceCapturedAt)||!fresh(line?.sourceUpdatedAt)||dt(line.sourceUpdatedAt)>dt(line.sourceCapturedAt))return {status:"stale_lineup",risk:true,roleConfirmed:false};
 const rows=(line.players||[]).filter(x=>x.playerId===p.playerId&&canonical(x.team)===team);if(rows.length!==1)return {status:"player_not_unique_in_projected_lineup",risk:true,roleConfirmed:false};
 const x=rows[0],ev=(x.roles||[]).filter(z=>z.categoryIdentifier==="ev"),pp=(x.roles||[]).filter(z=>z.categoryIdentifier==="pp");
 if(x.injuryStatus||x.gameTimeDecision)return {status:"injury_or_game_time_decision",risk:true,roleConfirmed:false,sourceAt:line.sourceCapturedAt};
 const role=ev.length===1&&/^[fd][1-4]$/.test(ev[0].groupIdentifier)?ev[0].groupIdentifier:null,official=!!role&&line.clubLineupsConfirmed===true&&x.projectedOnly===false;
 return {status:official?"official_lineup":role?"projected_lineup":"role_unknown",role,pp:pp.length===1&&/^pp[12]$/.test(pp[0].groupIdentifier)?pp[0].groupIdentifier:null,risk:!official,roleConfirmed:official,sourceAt:line.sourceCapturedAt};
}
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier]);
function freeze(s,c,approved,now){const out=[],seen=new Set();if(!finite(dt(s?.generatedAt))||dt(s.generatedAt)>dt(now)||dt(now)-dt(s.generatedAt)>1800000)return out;
 for(const p of s.individualPropSelections||[]){
  if(p.tier!=="Standard"||!["Higher","Lower"].includes(p.lean)||!countMarkets.has(p.market)||p.line%1!==.5||seen.has(key(p))||!finite(dt(p.gameStartAt))||dt(p.gameStartAt)-dt(now)<900000||!finite(dt(p.capturedAt))||dt(p.capturedAt)>dt(s.generatedAt)||dt(now)-dt(p.capturedAt)>1800000)continue;
  const g=c.idx.get(p.gameId);if(!g||!finite(dt(g.startTimeUTC))||Math.abs(dt(g.startTimeUTC)-dt(p.gameStartAt))>300000||canonical(scheduledOpponent({gameId:p.gameId,gameDate:g.gameDate,team:p.team},c.idx))!==canonical(p.opponent))continue;
  const raw=(s.rankedProps||[]).filter(z=>key(z)===key(p)&&z.lean===p.lean&&z.capturedAt===p.capturedAt);if(raw.length!==1||!finite(raw[0].probabilities?.higher)||!finite(raw[0].probabilities?.lower)||raw[0].probabilities.higher<0||raw[0].probabilities.higher>1||raw[0].probabilities.lower<0||raw[0].probabilities.lower>1||Math.abs(raw[0].probabilities.higher+raw[0].probabilities.lower-1)>1e-5)continue;
  const ps=variants((c.prior.get(p.playerId)||[]).filter(x=>canonical(x.team)===canonical(p.team)),p.market,p.line);if(!ps)continue;
  const avail=availability(p,approved,now);seen.add(key(p));out.push({gameId:p.gameId,playerId:p.playerId,team:p.team,market:p.market,line:p.line,tier:p.tier,side:p.lean,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,variants:ps,champion:raw[0].probabilities.higher,trainingSelected:c.selected[p.market]||null,availability:avail,researchOnly:true});
 }return out;
}
function grade(rows,history){
 const seen=new Set(),out={},availabilityGroups={},availabilityCoverage={};let pending=0;
 for(const r of rows){if(seen.has(key(r)))continue;seen.add(key(r));const a=availabilityCoverage[r.availability.status]??={registered:0,played:0,verifiedStarter:0,pendingOrNoStats:0};a.registered++;
  const raw=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId&&["OFF","FINAL"].includes(g.gameState)&&g.timeOnIceSeconds>0);
  if(raw.length===1){a.played++;a.verifiedStarter+=Number(raw[0].goalieStarted===true);}else a.pendingOrNoStats++;
  const finals=raw.filter(g=>eligible(g,r.market));if(finals.length!==1){pending++;continue;}
  const g=finals[0],y=Number(g[r.market]>r.line),ps={...r.variants,champion:r.champion,alwaysHigher:1,alwaysLower:0,rollingEmpirical:r.variants.empirical},b=out[r.market]??=state();score(b,ps,y,g.gameId,g.gameDate);
  const k=r.market+"|"+r.availability.status,z=availabilityGroups[k]??=state();score(z,ps,y,g.gameId,g.gameDate);
 }
 return {registered:seen.size,decided:seen.size-pending,pending,byMarket:Object.fromEntries(Object.entries(out).map(([k,b])=>[k,summarize(b)])),byAvailability:Object.fromEntries(Object.entries(availabilityGroups).map(([k,b])=>[k,summarize(b)])),availabilityCoverage,modelPromoted:false,confidenceApproved:false};
}
module.exports={MARKETS,distribution,variants,prepare,availability,freeze,grade,key};
