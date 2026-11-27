'use strict';
// Shadow-only decoration of new pregame forecasts. Existing revisions and scores
// are never rewritten. No native outcome source is contacted by this module.
const {compareByGame}=require('./prospective-game-comparison.cjs');
const {statRows,archive}=require('./report-native-workload-matchup.cjs');
const {forecast,settings,revision}=require('../src/native-workload-matchup-challenger.cjs');
const dt=Date.parse,finite=Number.isFinite;
const team=(sport,t)=>sport==='NFL'?({JAC:'JAX',WSH:'WAS',LA:'LAR',AZ:'ARI'}[t]||t):t;
const arms=['workload','defense','workloadDefense','matchup'];
const metricBySport={NHL:{shotsOnGoal:'sog',points:'points'},NFL:{receiving_yards:'receiving_yards',receptions:'receptions'},
 NBA:{points:'points',rebounds:'rebounds',assists:'assists',threePointersMade:'threePointersMade'}};

function attachNativeContext(root,rows,clock,sportOverride=null){
 if(!rows.length)return rows;
 const asOf=dt(clock),source=new Map();
 if(!finite(asOf))return rows;
 return rows.map(p=>{
  const sport=sportOverride??p.sport,metric=metricBySport[sport]?.[p.market],start=dt(p.gameStartAt??p.startAt);
  if(!metric||!p.playerId||!p.gameId||!p.team||!p.opponent||p.modelApproved!==false||
   !finite(start)||start-asOf<=900000||!(dt(p.sourceObservedAt)<=asOf))return p;
  let season,week;
  if(sport==='NFL'){
   const m=/^(20\d{2})_(\d{2})_[A-Z]{2,3}_[A-Z]{2,3}$/.exec(String(p.gameId));
   if(!m||+m[2]<1||+m[2]>18)return p;
   season=+m[1];week=+m[2];
  }
  const selected=p.rawSelectedEstimate??p.reviewedHistoryPair?.existing;
  const side=p.offeredSide??p.side;
  if(!['Higher','Lower'].includes(side)||!finite(selected)||selected<0||selected>1)return p;
  if(!source.has(sport)){
   try{
    const data=statRows(sport,archive(root,sport,asOf)),byPlayer=new Map();
    for(const row of data.rows){const a=byPlayer.get(row.id)||[];a.push(row);byPlayer.set(row.id,a);}
    source.set(sport,{byPlayer,sides:data.sides});
   }catch{
    console.warn(sport+' native supplemental context archive unavailable');
    source.set(sport,null);
   }
  }
  const data=source.get(sport);if(!data)return p;
  const pair=forecast({
   target:{sport,season,week,event:String(p.gameId),id:String(p.playerId),team:team(sport,p.team),opponent:team(sport,p.opponent),start},
   playerRows:data.byPlayer.get(String(p.playerId))||[],leagueSides:data.sides,metric,line:p.line,asOf,
   incumbentHigher:side==='Higher'?selected:1-selected});
  if(!pair||!arms.some(a=>pair[a]!==null))return p;
  const out={...pair,metric};
  if(side==='Lower')for(const a of [...arms,'incumbent','priorEmpirical'])if(out[a]!==null)out[a]=1-out[a];
  return {...p,nativeContextPair:out};
 });
}

function scores(rows){
 const result={};
 for(const arm of arms){
  const pairs=rows.filter(x=>{
   const p=x.nativeContextPair;
   return p?.revision===revision&&p.modelApproved===false&&Array.isArray(p.sourceDigests)&&p.sourceDigests.length>0&&
    p.sourceDigests.every(d=>/^[a-f0-9]{64}$/.test(d))&&finite(dt(p.latestArchiveKnownAt))&&[p[arm],p.incumbent,p.priorEmpirical,.5].every(v=>finite(v)&&v>=0&&v<=1)&&
    ['correct','incorrect'].includes(x.result);
  });
  const n=pairs.length,loss=(q,y)=>-Math.log(Math.max(.0001,y?q:1-q)),s={};
  for(const k of [arm,'incumbent','priorEmpirical','neutral']){
   let brier=0,logLoss=0;
   for(const x of pairs){const p=k==='neutral'?.5:x.nativeContextPair[k],y=Number(x.result==='correct');brier+=(p-y)**2;logLoss+=loss(p,y);}
   s[k===arm?'candidate':k]=n?{brier:brier/n,logLoss:logLoss/n}:null;
  }
  const gameEqualComparison=compareByGame(pairs.map(x=>({gameId:x.gameId,candidate:x.nativeContextPair[arm],
   benchmark:x.nativeContextPair.incumbent,outcome:Number(x.result==='correct')})));
  result[arm]={decisions:n,distinctGames:new Set(pairs.map(x=>String(x.gameId))).size,scores:s,gameEqualComparison};
 }
 return result;
}
module.exports={attachNativeContext,scores};
