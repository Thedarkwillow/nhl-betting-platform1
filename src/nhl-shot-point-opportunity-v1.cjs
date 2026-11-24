"use strict";
// Fixed market opportunity challenger. Fit on earlier dates, freeze weights
// before the current season, evaluate identical targets across variants.
// All counts conditional on appearance. No live recommendation or payout.
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const selective=require("./nhl-selective-opportunity-future-v1.cjs");
const {canonical}=require("./nhl-opponent-context.cjs"),{bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const LINES={shotsOnGoal:[1.5,2.5,3.5,4.5],points:[.5,1.5,2.5]},NAMES=["empirical","rate","opportunity","pooled","position","positionPP"],dt=Date.parse,finite=Number.isFinite,count=x=>Number.isInteger(x)&&x>=0,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const clip=p=>cap(p,.005,.995),logit=p=>Math.log(clip(p)/(1-clip(p))),sig=z=>1/(1+Math.exp(-cap(z,-20,20))),role=g=>g?.position==="D"?"D":["C","L","R","LW","RW","F"].includes(g?.position)?"F":null;
const half=l=>finite(l)&&l>=0&&l%1===.5;
const pp=g=>Number.isInteger(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds>=0&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds;
const final=g=>["FINAL","OFF"].includes(g.gameState)&&g.type==="skater"&&g.timeOnIceSeconds>0&&g.timeOnIceSeconds<=3900;
function poisson(mu,line){if(!finite(mu)||mu<0||!half(line))return null;let p=Math.exp(-mu),cdf=p;for(let i=1;i<=Math.floor(line);i++){p*=mu/i;cdf+=p;}return clip(1-cdf);}
const empirical=(a,l)=>(1+a.filter(v=>v>l).length)/(2+a.length);
function add(map,k,v,max=30){const a=map.get(k)||[];a.push(v);map.set(k,a.slice(-max));}
const reg=(a,ref,n,weight=.5)=>ref>0?cap(1+weight*(a/ref-1)*n/(n+15),.75,1.25):1;
// A skater can receive at most one point per team goal. Model conditional
// point participation instead of independent goals + assists; zero-goal
// games are retained in the team scoring distribution.
function teamGoalParticipation(own,opp,share,line){
 if(!half(line)||!finite(share)||share<0||share>1||own.length<5||opp.length<5||
  own.some(x=>!count(x.goalsFor))||opp.some(x=>!count(x.goalsAllowed)))return null;
 const tail=n=>{let prob=0;for(let k=0;k<=n;k++){let choose=1;for(let i=1;i<=k;i++)choose*= (n-i+1)/i;if(k>line)prob+=choose*share**k*(1-share)**(n-k);}return prob;};
 return clip(.55*avg(own.slice(-15).map(x=>tail(x.goalsFor)))+.45*avg(opp.slice(-15).map(x=>tail(x.goalsAllowed))));
}
function teamContext(rows,idx,c){
 const games=new Map();
 for(const r of rows)if(final(r)){const a=games.get(r.gameId)||[];a.push(r);games.set(r.gameId,a);}
 for(const rs of games.values()){
  const clubs=[...new Set(rs.map(g=>canonical(g.team)))];if(clubs.length!==2||clubs.some(t=>!t))continue;
  const groups=clubs.map(t=>rs.filter(g=>canonical(g.team)===t));
  if(groups.some(g=>g.length!==18||g.some(x=>!count(x.shotsOnGoal)||!count(x.goals)||!count(x.points)||!count(x.assists)||x.points!==x.goals+x.assists)))continue;
  if(rs.some(g=>!clubs.includes(canonical(scheduledOpponent(g,idx)))))continue;
  const totals=groups.map(a=>({shots:sum(a.map(x=>x.shotsOnGoal)),goals:sum(a.map(x=>x.goals))}));
  for(let i=0;i<2;i++){const t=clubs[i],own=totals[i],opp=totals[1-i];const v={shotsFor:own.shots,shotsAllowed:opp.shots,goalsFor:own.goals,goalsAllowed:opp.goals};add(c.team,t,v,30);c.league.push(v);if(c.league.length>1000)c.league.shift();
   for(const g of groups[i]){const pos=role(g);if(!pos)continue;for(const m of Object.keys(LINES)){const den=m==="shotsOnGoal"?own.shots:own.goals;if(den>=g[m]){add(c.playerShare,m+"|"+g.playerId,{team:t,y:g[m],den},30);if(den>0)add(c.roleShare,m+"|"+pos,{y:g[m],den},1000);}}}
  }
 }
}
function features(c,g,m,line){
 if(!LINES[m]||!half(line))return null;const t=canonical(g.team),o=canonical(g.opponent),h=(c.players.get(g.playerId)||[]).filter(x=>canonical(x.team)===t&&count(x[m])&&final(x)).slice(-25);
 if(h.length<10)return null;const position=role(h.at(-1));if(!position)return null;
 const own=c.team.get(t)||[],opp=c.team.get(o)||[],lg=c.league;if(own.length<5||opp.length<5||lg.length<30)return null;
 const ten=h.slice(-10),five=h.slice(-5),toi=.65*avg(ten.map(x=>x.timeOnIceSeconds))+.35*avg(five.map(x=>x.timeOnIceSeconds));
 if(toi<480)return null;
 const values=h.map(x=>x[m]),base=empirical(values.slice(-20),line),rateMu=sum(values)*toi/sum(h.map(x=>x.timeOnIceSeconds)),rateP=.7*poisson(rateMu,line)+.3*base;
 const field=m==="shotsOnGoal"?"shots":"goals",f=field+"For",a=field+"Allowed",ownRate=avg(own.slice(-15).map(x=>x[f])),oppRate=avg(opp.slice(-15).map(x=>x[a])),league=avg(lg.map(x=>x[f]));
 if(!(league>0))return null;
 const oppFactor=reg(oppRate,league,Math.min(15,opp.length)),ownFactor=reg(ownRate,league,Math.min(15,own.length));
 const hist=(c.playerShare.get(m+"|"+g.playerId)||[]).filter(x=>x.team===t).slice(-20),roleRows=c.roleShare.get(m+"|"+position)||[];
 if(hist.length<8||roleRows.length<100||sum(hist.map(x=>x.den))<=0||sum(roleRows.map(x=>x.den))<=0)return null;
 const roleShare=sum(roleRows.map(x=>x.y))/sum(roleRows.map(x=>x.den)),share=(sum(hist.map(x=>x.y))+10*roleShare)/(sum(hist.map(x=>x.den))+10);
 // Shares use real SOG/team SOG or player points/team goals; never label
 // blocked shot proxies as shot attempts. Goal+assist participation <=1.
 const volume=.55*ownRate+.45*oppRate,shareMu=volume*share,opportunityMu=.5*rateMu*oppFactor+.5*shareMu;
 const opportunity=.65*poisson(opportunityMu,line)+.35*base;
 const teamGoalTail=m==="points"?teamGoalParticipation(own,opp,share,line):null;
 const pph=h.filter(pp),pp5=five.filter(pp),pp10=ten.filter(pp);
 let ppTime=null,ppShare=null,ppEstimate=null,ppFeature=null,ppPointsRows=0;
 if(pph.length>=8&&pp5.length===5&&pp10.length>=8){
  ppTime=.65*avg(pp10.map(x=>x.powerPlayTimeOnIceSeconds))+.35*avg(pp5.map(x=>x.powerPlayTimeOnIceSeconds));ppShare=sum(pph.map(x=>x.powerPlayTimeOnIceSeconds))/sum(pph.map(x=>x.timeOnIceSeconds));
  ppFeature=cap(ppTime/toi-ppShare,-.2,.2);
  // PP points have an exact official split; non-PP includes even strength
  // AND shorthanded. SOG has no verified strength split here, so only a
  // learned PP-time change predictor enters the SOG model.
  if(m==="points"){
   const z=pph.filter(x=>count(x.powerPlayPoints)&&x.powerPlayPoints<=x.points&&(x.powerPlayTimeOnIceSeconds>0||x.powerPlayPoints===0));
   ppPointsRows=z.length;const pSecs=sum(z.map(x=>x.powerPlayTimeOnIceSeconds)),nSecs=sum(z.map(x=>x.timeOnIceSeconds-x.powerPlayTimeOnIceSeconds));
   if(z.length>=8&&pSecs>=300&&nSecs>=1800){const pRate=(sum(z.map(x=>x.powerPlayPoints))+.5)/(pSecs+300),nRate=(sum(z.map(x=>x.points-x.powerPlayPoints))+.5)/(nSecs+600);ppEstimate=pRate*ppTime+nRate*Math.max(0,toi-ppTime);}
  }
 }
 const componentPP=ppEstimate===null?opportunity: .65*poisson(.7*opportunityMu+.3*ppEstimate,line)+.35*base;
 const x=[1,logit(rateP)-logit(base),logit(opportunity)-logit(base),ownFactor-1,oppFactor-1,cap(toi/avg(h.map(v=>v.timeOnIceSeconds))-1,-.4,.4)];
 return {position,base,rateP,opportunity,teamGoalTail,rateMu,opportunityMu,x,ppX:[...x,ppFeature??0,logit(componentPP)-logit(opportunity)],ppCovered:ppTime!==null,ppPointsRows,ppTime,ppShare,history:h.length,opponentGames:opp.length,expectedIceSeconds:toi,latestPriorDate:h.at(-1).gameDate,roleShare,ownRate,opponentAllowed:oppRate};
}
const fitState=n=>({w:Array(n).fill(0),games:new Set(),days:new Set()});
function fitted(f,x,b){return clip(sig(logit(b)+sum(f.w.map((w,i)=>w*x[i]))));}
function update(f,batch){
 if(!batch.length)return;const games=new Map();for(const r of batch){const a=games.get(r.gameId)||[];a.push(r);games.set(r.gameId,a);}
 const gradient=Array(f.w.length).fill(0);
 for(const rs of games.values())for(const r of rs){const e=fitted(f,r.x,r.base)-r.y;for(let i=0;i<gradient.length;i++)gradient[i]+=e*r.x[i]/rs.length/games.size;}
 const eta=.25/Math.sqrt(1+f.days.size/50);f.w=f.w.map((v,i)=>cap(v-eta*(gradient[i]+.08*v),-1.5,1.5));for(const r of batch){f.games.add(r.gameId);f.days.add(r.day);}
}
const usable=f=>f.games.size>=30&&f.days.size>=10;
function predictions(c,m,x){
 const pooled=c.fits[m].all,pos=c.fits[m][x.position],ppFit=c.fits[m][x.position+"PP"];
 if(!usable(pooled)||!usable(pos))return null;
 const p=fitted(pooled,x.x,x.base),q=fitted(pos,x.x,x.base),weight=pos.games.size/(pos.games.size+40),roleP=weight*q+(1-weight)*p;
 const v=x.ppCovered&&usable(ppFit)?fitted(ppFit,x.ppX,x.base):null;
 return {empirical:x.base,rate:x.rateP,opportunity:x.opportunity,pooled:p,position:roleP,positionPP:v===null?null:.6*v+.4*roleP,...(finite(x.teamGoalTail)?{teamGoalParticipation:x.teamGoalTail,teamGoalBlend:.5*x.teamGoalTail+.5*x.base}:{})};
}
function addScore(out,k,r,ps,y,ppCompare){
 const b=out[k]??={n:0,games:new Set(),dates:new Set(),models:{},diff:{}};
 b.n++;b.games.add(r.gameId);b.dates.add(r.gameDate);
 for(const [name,p] of Object.entries(ps)){if(!finite(p))continue;const a=b.models[name]??={n:0,brier:0,loss:0,hits:0,matchedEmpiricalHits:0,alwaysHigher:0,alwaysLower:0,championN:0,championWins:0,challengerWins:0,championBrier:0,challengerBrier:0,matchedGames:new Set()};a.n++;a.brier+=(p-y)**2;a.loss-=Math.log(y?clip(p):1-clip(p));a.hits+=Number((p>=.5)===Boolean(y));a.matchedEmpiricalHits+=Number((ps.empirical>=.5)===Boolean(y));a.alwaysHigher+=y;a.alwaysLower+=1-y;
  if(finite(ps.champion)){a.championN++;a.matchedGames.add(r.gameId);a.championWins+=Number((ps.champion>=.5)===Boolean(y));a.challengerWins+=Number((p>=.5)===Boolean(y));a.championBrier+=(ps.champion-y)**2;a.challengerBrier+=(p-y)**2;}
  const ref=name==="positionPP"&&ppCompare?ps.position:ps.empirical;if(!finite(ref))continue;const d=b.diff[name]??=new Map(),g=d.get(r.gameId)||{diff:0,n:0};g.n++;g.diff+=(p-y)**2-(ref-y)**2;d.set(r.gameId,g);
 }
}
function summarize(out){return Object.fromEntries(Object.entries(out).map(([k,b])=>[k,{thresholds:b.n,games:b.games.size,dates:b.dates.size,models:Object.fromEntries(Object.entries(b.models).map(([m,v])=>[m,{n:v.n,brier:v.brier/v.n,logLoss:v.loss/v.n,hitRate:v.hits/v.n,matchedEmpiricalRate:v.matchedEmpiricalHits/v.n,alwaysHigherRate:v.alwaysHigher/v.n,alwaysLowerRate:v.alwaysLower/v.n,matchedOriginalChampion:{n:v.championN,games:v.matchedGames.size,championHitRate:v.championN?v.championWins/v.championN:null,challengerHitRate:v.championN?v.challengerWins/v.championN:null,championBrier:v.championN?v.championBrier/v.championN:null,challengerBrier:v.championN?v.challengerBrier/v.championN:null},pairedCI:bootstrapGameBrierDifference([...b.diff[m].values()])}]))} ]));}
function prepare(history,schedule,{cutoff="9999-12-31",holdout="2026-07-01"}={}){
 const idx=scheduleIndex(schedule),days=new Map(),c={idx,players:new Map(),team:new Map(),league:[],playerShare:new Map(),roleShare:new Map(),fits:Object.fromEntries(Object.keys(LINES).map(m=>[m,{all:fitState(6),F:fitState(6),D:fitState(6),FPP:fitState(8),DPP:fitState(8)}]))},out={},ppOut={};let ppRows=0,ppPointRows=0;
 for(const r of uniqueRows(history)){if(r.gameDate>=cutoff||!final(r))continue;const a=days.get(r.gameDate)||[];a.push(r);days.set(r.gameDate,a);}
 for(const [day,rows] of days){const batch={};for(const r of rows){const opponent=scheduledOpponent(r,idx);if(!opponent)continue;
  for(const [m,lines] of Object.entries(LINES)){if(!count(r[m]))continue;for(const line of lines){const x=features(c,{...r,opponent},m,line);if(!x)continue;const y=Number(r[m]>line),ps=predictions(c,m,x);
   if(day>=holdout&&ps){const main={...ps};delete main.positionPP;for(const k of [m,m+"|"+x.position])addScore(out,k,r,main,y,false);if(ps.positionPP!==null){ppRows++;if(m==="points"&&x.ppPointsRows>=8)ppPointRows++;for(const k of [m,m+"|"+x.position])addScore(ppOut,k,r,ps,y,true);}}
   if(day<holdout){const r0={base:x.base,x:x.x,y,day,gameId:r.gameId};for(const k of ["all",x.position]) (batch[m+"|"+k]??=[]).push(r0);if(x.ppCovered)(batch[m+"|"+x.position+"PP"]??=[]).push({...r0,x:x.ppX});}
  }}
 }for(const [k,b] of Object.entries(batch)){const [m,f]=k.split("|");update(c.fits[m][f],b);}teamContext(rows,idx,c);for(const r of rows)add(c.players,r.playerId,r,40);}
 return {c,report:{holdoutFrom:holdout,trainingWeightsFrozenBeforeHoldout:true,priorGameFeaturesUpdatedAfterEachDate:true,byMarketAndPosition:summarize(out),matchedPPImpact:summarize(ppOut),ppThresholds:ppRows,ppPointComponentThresholds:ppPointRows,training:Object.fromEntries(Object.entries(c.fits).map(([m,z])=>[m,Object.fromEntries(Object.entries(z).map(([k,f])=>[k,{weights:f.w,games:f.games.size,dates:f.days.size}]))])),syntheticThresholdsOnly:true,modelPromoted:false}};
}
const key=r=>JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);
function freeze(snapshot,c,now,{selectivePolicyEligible=false}={}){
 if(!snapshot||dt(snapshot.generatedAt)>dt(now)||dt(now)-dt(snapshot.generatedAt)>1800000)return [];
 const seen=new Set(),out=[];for(const p of snapshot.individualPropSelections||[]){
  if(p.tier!=="Standard"||!LINES[p.market]||!half(p.line)||seen.has(key(p))||!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||!["Higher","Lower"].includes(p.lean)||!finite(dt(p.gameStartAt))||dt(p.gameStartAt)-dt(now)<900000||!finite(dt(p.capturedAt))||dt(p.capturedAt)>dt(snapshot.generatedAt)||dt(now)-dt(p.capturedAt)>1800000)continue;
  const g=c.idx.get(p.gameId),opp=canonical(scheduledOpponent({gameId:p.gameId,team:p.team,gameDate:g?.gameDate},c.idx));if(!g||!finite(dt(g.startTimeUTC))||Math.abs(dt(g.startTimeUTC)-dt(p.gameStartAt))>300000||opp!==canonical(p.opponent))continue;
  const raw=(snapshot.rankedProps||[]).filter(r=>key(r)===key(p)&&r.lean===p.lean&&r.capturedAt===p.capturedAt);if(raw.length!==1||!finite(raw[0].probabilities?.higher)||raw[0].probabilities.higher<0||raw[0].probabilities.higher>1||!finite(raw[0].probabilities?.lower)||raw[0].probabilities.lower<0||raw[0].probabilities.lower>1||Math.abs(raw[0].probabilities.higher+raw[0].probabilities.lower-1)>1e-5)continue;
  const x=features(c,p,p.market,p.line),ps=x&&predictions(c,p.market,x);if(!ps)continue;seen.add(key(p));
  const row={gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,side:p.lean,gameStartAt:p.gameStartAt,capturedAt:p.capturedAt,role:x.position,
   originalHigher:raw[0].probabilities.higher,variants:ps,expectedPPSeconds:x.ppTime,ppPointsRows:x.ppPointsRows,
   ppTimeEvidenceVerified:x.ppTime!==null,priorGames:x.history,opponentGames:x.opponentGames,
   expectedIceSeconds:x.expectedIceSeconds,latestPriorDate:x.latestPriorDate,researchOnly:true};
  if(selectivePolicyEligible===true)row.selective=selective.assess(row,{cutoff:selective.pacific(p.gameStartAt)});
  out.push(row);}
 return out;
}
function grade(rows,history){const seen=new Set(),out={},ppOut={};let pending=0;for(const r of rows){if(seen.has(key(r)))continue;seen.add(key(r));const matches=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId&&final(g)&&count(g[r.market]));if(matches.length!==1){pending++;continue;}const g=matches[0],y=Number(g[r.market]>r.line),ps={...r.variants,champion:r.originalHigher,alwaysHigher:1,alwaysLower:0};const main={...ps};delete main.positionPP;for(const k of ["all",r.market,r.market+"|"+r.role])addScore(out,k,g,main,y,false);if(finite(ps.positionPP))for(const k of ["all",r.market,r.market+"|"+r.role])addScore(ppOut,k,g,ps,y,true);}
 return {registered:seen.size,pending,decided:seen.size-pending,byMarketAndPosition:summarize(out),matchedPPImpact:summarize(ppOut),approved:false};}
module.exports={teamGoalParticipation,prepare,features,poisson,fitState,update,freeze,grade,key,role};
