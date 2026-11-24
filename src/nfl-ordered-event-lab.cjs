"use strict";
// Research-only exact event sequencing, conditional on observed participation.
// No missing first event becomes zero. Require full game count/yardage reconciliation.
const {reconcile}=require("./nfl-dedicated-period-lab.cjs");
const n=x=>typeof x==="number"&&Number.isFinite(x),integer=x=>Number.isInteger(x),id=x=>typeof x==="string"&&x.length>0,k=(...x)=>JSON.stringify(x),sum=a=>a.reduce((s,x)=>s+x,0),avg=a=>sum(a)/a.length;
const flags=(rows,f)=>rows.every(x=>[0,1].includes(x[f]))?rows.map(x=>x[f]):null;
const ys=(rows,f)=>rows.every(x=>integer(x[f]))?rows.map(x=>x[f]):null;
const first=(a,n)=>a&&a.length>=n?sum(a.slice(0,n)):null;
const max=a=>a?.length?Math.max(...a):null;
const filterFlag=(a,f)=>flags(a,f)?a.filter(x=>x[f]===1):null;
const countFlag=(a,f)=>{const v=flags(a,f);return v?sum(v):null;};
const countYards=(a,f,l)=>{const v=ys(a,f);return v?v.filter(x=>x>=l).length:null;};
const zone=a=>a.every(x=>n(x.yardline_100)&&x.yardline_100>=0&&x.yardline_100<=100)?a.filter(x=>x.yardline_100<=20).length:null;
const specs={
 longest_completion:["passing", [14.5,24.5,34.5],a=>max(ys(filterFlag(a,"complete_pass")||[],"passing_yards"))],
 passing_first_downs:["passing",[7.5,10.5,13.5],a=>countFlag(a,"first_down_pass")],
 completions_20_plus:["passing",[.5,1.5,2.5],a=>{const c=filterFlag(a,"complete_pass");return c?countYards(c,"passing_yards",20):null;}],
 first_completion_yards:["passing",[4.5,9.5,14.5],a=>{const c=filterFlag(a,"complete_pass");return c?first(ys(c,"passing_yards"),1):null;}],
 first_5_attempt_completions:["passing",[1.5,2.5,3.5],a=>first(flags(a,"complete_pass"),5)],
 completions_first_10_pass_attempts:["passing",[4.5,5.5,6.5],a=>first(flags(a,"complete_pass"),10)],
 first_attempt_completion:["passing",[.5],a=>first(flags(a,"complete_pass"),1)],
 first_passing_td_yards:["passing",[4.5,14.5,24.5],a=>{const c=filterFlag(a,"pass_touchdown");return c?first(ys(c,"passing_yards"),1):null;}],
 longest_rush:["rushing",[9.5,14.5,19.5],a=>max(ys(a,"rushing_yards"))],
 rushing_yards_first_5_attempts:["rushing",[14.5,19.5,24.5],a=>first(ys(a,"rushing_yards"),5)],
 first_rush_attempt_yards:["rushing",[1.5,3.5,5.5],a=>first(ys(a,"rushing_yards"),1)],
 rushes_10_plus:["rushing",[.5,1.5,2.5],a=>countYards(a,"rushing_yards",10)],
 red_zone_rush_attempts:["rushing",[.5,1.5,2.5],zone],
 longest_reception:["receiving",[9.5,19.5,29.5],a=>{const c=filterFlag(a,"complete_pass");return c?max(ys(c,"receiving_yards")):null;}],
 receiving_yards_first_2:["receiving",[9.5,14.5,19.5],a=>{const c=filterFlag(a,"complete_pass");return c?first(ys(c,"receiving_yards"),2):null;}],
 first_reception_yards:["receiving",[4.5,9.5,14.5],a=>{const c=filterFlag(a,"complete_pass");return c?first(ys(c,"receiving_yards"),1):null;}],
 receptions_20_plus:["receiving",[.5,1.5],a=>{const c=filterFlag(a,"complete_pass");return c?countYards(c,"receiving_yards",20):null;}],
 red_zone_targets:["receiving",[.5,1.5,2.5],zone],
 receiving_first_downs:["receiving",[.5,1.5,2.5],a=>countFlag(a,"first_down_pass")]
};
const FAMILIES={passing:{usage:"passing_attempts",yard:"passing_yards",complete:"passing_completions",min:10},rushing:{usage:"rushing_attempts",yard:"rushing_yards",min:3},receiving:{usage:"receiving_targets",yard:"receiving_yards",complete:"receptions",min:2}};
function derive(input){
 const verified=reconcile(input),groups=new Map(),bad=new Set(),seen=new Set(),rows=[],excluded={};
 for(const e of input.events||[]){
  if(!id(e.game_id)||!n(e.play_id))continue;
  const key=k(e.game_id,e.play_id);if(seen.has(key)){bad.add(e.game_id);continue;}seen.add(key);
  if(e.season_type!=="REG"||e.play_type==="no_play"||!id(e.posteam)||!integer(e.qtr)||e.qtr<1||e.qtr>5)continue;
  const put=(f,p)=>{if(!id(p))return;const z=k(e.game_id,e.posteam,p,f),a=groups.get(z)||[];a.push(e);groups.set(z,a);};
  if(e.pass_attempt===1&&e.sack!==1){put("passing",e.passer_player_id);put("receiving",e.receiver_player_id);}
  if(e.rush_attempt===1)put("rushing",e.rusher_player_id);
 }
 for(const r of verified.rows){
  if(r.kicker||bad.has(r.gameId))continue;
  const values={},usage={};
  for(const [family,s] of Object.entries(FAMILIES)){
   const a=(groups.get(k(r.gameId,r.team,r.player,family))||[]).sort((x,y)=>x.play_id-y.play_id),u=r.full[s.usage]?.value;
   if(!integer(u)||u<=0||u!==a.length||!n(r.full[s.yard]?.value))continue;
   const c=family==="rushing"?a:filterFlag(a,"complete_pass");
   if(!c||s.complete&&r.full[s.complete]?.value!==c.length)continue;
   const y=ys(c,s.yard);if(!y||sum(y)!==r.full[s.yard].value)continue;
   usage[family]=u;
   for(const [m,[f,,fn]] of Object.entries(specs))if(f===family){
    const v=fn(a);if(n(v))values[m]=v;else excluded[m]=(excluded[m]||0)+1;
   }
  }
  if(Object.keys(values).length)rows.push({season:r.season,week:r.week,gameId:r.gameId,player:r.player,team:r.team,usage,values});
 }
 return {rows,excluded,reconciliationExclusions:verified.reject};
}
function study(input){
 const {rows,excluded,reconciliationExclusions}=derive(input),weeks=new Map(),history=new Map(),out={};
 for(const r of rows){const z=r.season*100+r.week,a=weeks.get(z)||[];a.push(r);weeks.set(z,a);}
 for(const [,batch] of [...weeks].sort(([a],[b])=>a-b)){
  for(const r of batch){if(r.season<2025)continue;const prior=history.get(k(r.player,r.team))||[];
   for(const [m,[family,lines]] of Object.entries(specs)){
    const y=r.values[m],a=prior.filter(x=>n(x.values[m])&&n(x.usage[family])).slice(-20);
    if(!n(y)||a.length<8||avg(a.slice(-5).map(x=>x.usage[family]))<FAMILIES[family].min)continue;
    const vals=a.map(x=>x.values[m]),recent=vals.slice(-5),center=avg(vals),mu=.65*avg(recent)+.35*center;
    const z=out[r.season+"|"+m]??={n:0,b:0,c:0,bl:0,cl:0,games:new Set()};
    for(const l of lines){const hit=Number(y>l),p=(1+vals.filter(x=>x>l).length)/(vals.length+2);
     // Recency-weighted empirical distribution preserves signed ranges and
     // bounded first-attempt counts without shifted impossible observations.
     const weights=vals.map((_,i)=>1+i/vals.length),q=(1+sum(vals.map((x,i)=>x>l?weights[i]:0)))/(2+sum(weights));
     z.n++;z.b+=(p-hit)**2;z.c+=(q-hit)**2;z.bl-=Math.log(hit?p:1-p);z.cl-=Math.log(hit?q:1-q);z.games.add(r.gameId);}
   }
  }
  for(const r of batch){const z=k(r.player,r.team),a=history.get(z)||[];a.push(r);history.set(z,a.slice(-60));}
 }
 return {kind:"nfl_ordered_event_historical_lab_v1",markets:Object.keys(specs),reconciledPlayerGameRows:rows.length,bySeasonMarket:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,{thresholds:v.n,distinctGames:v.games.size,baselineBrier:v.b/v.n,challengerBrier:v.c/v.n,baselineLogLoss:v.bl/v.n,challengerLogLoss:v.cl/v.n}])),excluded,reconciliationExclusions,conditionalOnObservedRequiredEvents:true,zeroFromMissingEvent:false,actualPlatformSettlementVerified:false,syntheticThresholds:true,calibrated:false,modelPromoted:false};
}
module.exports={specs,derive,study};
