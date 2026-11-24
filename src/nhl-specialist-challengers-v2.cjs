"use strict";
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {smoothProbability}=require("./nhl-learned-matchup-v1.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const finite=Number.isFinite,count=x=>Number.isInteger(x)&&x>=0,mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const per=(a,k)=>mean(a.map(x=>x[k]));
function push(map,key,v,max=30){const a=map.get(key)||[];a.push(v);map.set(key,a.slice(-max));}
function stats(a,k){return a.length?per(a,k):null;}
function score(out,key,game,day,y,line,base,candidate){
 if(![base,candidate].every(p=>finite(p)&&p>=0&&p<=1))return;
 const b=out[key]??={n:0,base:0,fit:0,groups:new Map(),dates:new Set()};
 const z=Number(y>line),d=(candidate-z)**2-(base-z)**2,g=b.groups.get(game)||{n:0,diff:0};g.n++;g.diff+=d;b.groups.set(game,g);b.n++;b.base+=(base-z)**2;b.fit+=(candidate-z)**2;b.dates.add(day);
}
function finish(out){return Object.fromEntries(Object.entries(out).map(([k,b])=>[k,{thresholds:b.n,games:b.groups.size,dates:b.dates.size,baselineBrier:b.base/b.n,challengerBrier:b.fit/b.n,gameClusterCI:bootstrapGameBrierDifference([...b.groups.values()]),promoted:false}]));}
const rate=(x,ref,n)=>finite(x)&&ref>0?clamp((x/ref-1)*n/(n+20),-.30,.30):0;
function periodBoth(history,schedule,fullRows){
 const idx=scheduleIndex(schedule),days=new Map(),identity=new Map(fullRows.map(g=>[g.gameId+"|"+g.playerId,g])),players=new Map(),team=new Map(),league=new Map(),out={};
 const fields=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","saves","goalsAgainst"];
 for(const [id,periods] of Object.entries(history?.players||{}))for(const p of [1,2,3])for(const g of periods[String(p)]||[]){
  const x=identity.get(g.gameId+"|"+id);if(!x||x.gameDate!==g.gameDate||g.playedInPeriod!==true||g.period!==p)continue;
  const opp=canonical(scheduledOpponent(x,idx)),own=canonical(x.team);if(!own||!opp)continue;const a=days.get(g.gameDate)||[];a.push({...g,playerId:Number(id),team:own,opp,type:x.type});days.set(g.gameDate,a);
 }
 for(const [day,rows] of [...days].sort()){
  const grouped=new Map();
  for(const g of rows){for(const m of fields){if(!count(g[m]))continue;const k=g.playerId+"|"+g.period+"|"+m,h=players.get(k)||[],own=team.get(g.team+"|"+g.period+"|"+m)||[],opp=team.get(g.opp+"|"+g.period+"|"+m)||[],lg=league.get(g.period+"|"+m)||[];
    if(h.length<8||own.length<5||opp.length<5||lg.length<20)continue;
    const vals=h.slice(-20),base=mean(vals),oa=rate(stats(own,"own"),stats(lg,"own"),own.length),ob=rate(stats(opp,"opp"),stats(lg,"opp"),opp.length),mu=base*clamp(1+.35*oa+.35*ob,.82,1.18);
    for(const line of m==="saves"?[3.5,6.5,9.5]:[.5,1.5,2.5])score(out,g.period+"|"+m,g.gameId,day,g[m],line,smoothProbability(vals,base,line),smoothProbability(vals,mu,line));
   }
   const k=g.gameId+"|"+g.period,a=grouped.get(k)||[];a.push(g);grouped.set(k,a);
  }
  for(const a of grouped.values()){
   const clubs=[...new Set(a.map(g=>g.team))];if(clubs.length!==2)continue;
   const groups=clubs.map(t=>a.filter(g=>g.team===t&&g.type==="skater"));if(groups.some(g=>g.length<12))continue;
   const total=(g,m)=>g.every(x=>count(x[m]))?sum(g.map(x=>x[m])):null;
   for(let i=0;i<2;i++)for(const m of fields){
    const x=groups[i],y=groups[1-i];let own,opp;
    if(m==="blockedShots"||m==="saves"||m==="goalsAgainst"){const f=m==="goalsAgainst"?"goals":"shotsOnGoal";own=total(y,f);opp=total(x,f);if(m==="blockedShots"&&count(own)&&count(opp)){const bx=total(x,"blockedShots"),by=total(y,"blockedShots");own=count(bx)?own+bx:null;opp=count(by)?opp+by:null;}}
    else if(m==="faceoffsWon"){const u=total(x,m),v=total(y,m);own=opp=count(u)&&count(v)?u+v:null;}
    else {own=total(x,m);opp=total(y,m);}
    if(!count(own)||!count(opp))continue;const key=a[0].period+"|"+m,v={own,opp};push(team,clubs[i]+"|"+key,v,20);push(league,key,v,700);
   }
  }
  for(const g of rows)for(const m of fields)if(count(g[m]))push(players,g.playerId+"|"+g.period+"|"+m,g[m],30);
 }
 return {byPeriodMarket:finish(out),method:"separate regulation period own-team and opponent opportunity factors; only past dates",syntheticThresholds:true};
}
function goalies(history,schedule){
 const idx=scheduleIndex(schedule),days=new Map(),past=new Map(),teams=new Map(),lg=[],out={},combos={},joint=[],crossJoint=[];
 // Need two exact opposing starting goalies with complete full-game
 // counts; relief goalies are not treated as guaranteed starters.
 for(const g of uniqueRows(history)){if(g.type!=="goalie"||g.goalieStarted!==true||!count(g.saves)||!count(g.goalsAgainst)||!count(g.shotsAgainst)||g.shotsAgainst!==g.saves+g.goalsAgainst||g.timeOnIceSeconds<=0)continue;const o=canonical(scheduledOpponent(g,idx)),t=canonical(g.team);if(!o||!t)continue;const a=days.get(g.gameDate)||[];a.push({...g,own:t,opp:o});days.set(g.gameDate,a);}
 const forecast=g=>{
  const a=past.get(g.playerId)||[],own=teams.get(g.own)||[],opp=teams.get(g.opp)||[];
  if(a.length<8||own.length<5||opp.length<5||lg.length<20)return null;
  const prior=a.slice(-20),recent=prior.slice(-10),sf=per(recent,"shotsAgainst"),leagueShots=per(lg,"shotsAgainst"),ownShots=per(own,"shotsAgainst"),oppShots=per(opp,"shotsFor");
  const shots=.6*sf+.2*ownShots+.2*oppShots,sv=(sum(prior.map(x=>x.saves))+90)/(sum(prior.map(x=>x.shotsAgainst))+100),leagueSV=sum(lg.map(x=>x.saves))/sum(lg.map(x=>x.shotsAgainst));
  const svAdj=clamp(.85*sv+.15*leagueSV,.75,.98),ga=shots*(1-svAdj),saves=shots*svAdj;
  const official=prior.filter(x=>[0,1].includes(x.goalieOfficialWins)&&[0,1].includes(x.goalieOfficialShutouts)),ownW=own.filter(x=>[0,1].includes(x.goalieOfficialWins)),oppW=opp.filter(x=>[0,1].includes(x.goalieOfficialWins));
  const win=official.length>=8&&ownW.length>=5&&oppW.length>=5?clamp(.6*(sum(official.map(x=>x.goalieOfficialWins))+2)/(official.length+4)+.2*(sum(ownW.map(x=>x.goalieOfficialWins))+2)/(ownW.length+4)+.2*(1-(sum(oppW.map(x=>x.goalieOfficialWins))+2)/(oppW.length+4)),.05,.95):null;
  const shutout=official.length>=8?clamp(.6*(sum(official.map(x=>x.goalieOfficialShutouts))+.5)/(official.length+5)+.4*Math.exp(-ga),0,.5):null;
  return {prior,saves,ga,win,shutout,expectedShots:shots,baseSaves:per(prior,"saves")};
 };
 const pair=(a,b,pa,pb,pool,key,day)=>{
  if(!pa||!pb||pool.length<20)return;const va=pa.prior.map(x=>x.saves),vb=pb.prior.map(x=>x.saves),observed=a.saves+b.saves,m=pa.saves+pb.saves;
  const totals=[];for(const x of va)for(const y of vb)totals.push(x+y);
  const residualJoint=pool.slice(-250).map(x=>x.residual),center=mean(residualJoint);
  for(const l of [39.5,49.5,59.5]){const base=smoothProbability(totals,mean(totals),l),jointP=(1+residualJoint.filter(x=>Math.max(0,m+x-center)>l).length)/(residualJoint.length+2),candidate=.65*smoothProbability(totals,m,l)+.35*jointP;score(combos,key,a.gameId,day,observed,l,base,candidate);}
 };
 for(const [day,rs] of [...days].sort()){
  const games=new Map(),pred=new Map();for(const g of rs){const a=games.get(g.gameId)||[];a.push(g);games.set(g.gameId,a);pred.set(g.playerId,forecast(g));}
  const starts=[...games.values()].filter(a=>a.length===2&&a[0].own===a[1].opp&&a[1].own===a[0].opp).sort((a,b)=>a[0].gameId-b[0].gameId);
  for(const g of rs){const p=pred.get(g.playerId);if(!p||p.win===null||p.shutout===null)continue;
   for(const [key,w,so,s,ga] of [["prizePicksGoalieFantasyScore",10,10,.3,-2],["underdogGoalieFantasyScore",6,0,.6,-3]]){
    const vals=p.prior.filter(x=>finite(x[key])).map(x=>x[key]);if(vals.length<8||!finite(g[key]))continue;
    const mu=w*p.win+so*p.shutout+s*p.saves+ga*p.ga,base=mean(vals);
    for(const line of [10.5,15.5,20.5])score(out,key,g.gameId,day,g[key],line,smoothProbability(vals,base,line),smoothProbability(vals,.6*base+.4*mu,line));
   }
  }
  for(const [a,b] of starts)pair(a,b,pred.get(a.playerId),pred.get(b.playerId),joint,"saves_same_game_opposing_starters",day);
  // Deterministic historical synthetic cross-game pairs; no archived provider
  // member identities, and no repeated game within a pair.
  const pendingCross=[];for(let i=0;i+1<starts.length;i+=2){const a=starts[i].slice().sort((a,b)=>a.playerId-b.playerId)[0],b=starts[i+1].slice().sort((a,b)=>a.playerId-b.playerId)[0],pa=pred.get(a.playerId),pb=pred.get(b.playerId);pair(a,b,pa,pb,crossJoint,"saves_cross_game_starters",day);if(pa&&pb)pendingCross.push({residual:a.saves+b.saves-pa.saves-pb.saves});}
  crossJoint.push(...pendingCross);if(crossJoint.length>500)crossJoint.splice(0,crossJoint.length-500);
  for(const [a,b] of starts){const pa=pred.get(a.playerId),pb=pred.get(b.playerId);if(pa&&pb)joint.push({residual:a.saves+b.saves-pa.saves-pb.saves});if(joint.length>500)joint.shift();
   for(const [g,o] of [[a,b],[b,a]]){const v={...g,shotsFor:o.shotsAgainst};push(teams,g.own,v,30);lg.push(v);if(lg.length>1000)lg.shift();}
  }
  for(const g of rs)push(past,g.playerId,g,30);
 }
 return {fantasy:{byMarket:finish(out),components:["expected shots faced","save fraction","goals against","official win","official shutout"],jointHistoricalDistribution:true,platformRulesIndependentlyVerified:false},goalieCombos:{byMarket:finish(combos),sameGameResiduals:joint.length,crossGameResiduals:crossJoint.length,exactSourceMemberOffersVerified:false,syntheticThresholds:true}};
}
module.exports={periodBoth,goalies};
