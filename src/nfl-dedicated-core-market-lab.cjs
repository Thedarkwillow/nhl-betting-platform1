"use strict";
// Dedicated historical target policies, not a live recommendation engine.
// Prior opportunities determine role. Full week withheld before any update.
const SPEC={
 passing_attempts:{target:"attempts",exposure:"attempts",kind:"volume",role:"QB",min:10,lines:[24.5,29.5,34.5]},
 passing_completions:{target:"completions",exposure:"attempts",kind:"conversion",role:"QB",min:10,prior:.63,lines:[14.5,19.5,24.5]},
 passing_yards:{target:"passing_yards",exposure:"attempts",kind:"rate",role:"QB",min:10,prior:7,lines:[199.5,249.5,299.5]},
 passing_touchdowns:{target:"passing_tds",exposure:"attempts",kind:"rare_conversion",role:"QB",min:10,prior:.045,lines:[.5,1.5,2.5]},
 interceptions_thrown:{target:"interceptions",exposure:"attempts",kind:"rare_conversion",role:"QB",min:10,prior:.025,lines:[.5,1.5]},
 rushing_attempts:{target:"carries",exposure:"carries",kind:"volume",min:3,lines:[7.5,12.5,17.5]},
 rushing_yards:{target:"rushing_yards",exposure:"carries",kind:"rate",min:3,prior:4.3,lines:[39.5,59.5,79.5]},
 rushing_touchdowns:{target:"rushing_tds",exposure:"carries",kind:"rare_conversion",min:3,prior:.03,lines:[.5,1.5]},
 receiving_targets:{target:"targets",exposure:"targets",kind:"volume",min:2,lines:[3.5,5.5,7.5]},
 receptions:{target:"receptions",exposure:"targets",kind:"conversion",min:2,prior:.64,lines:[2.5,4.5,6.5]},
 receiving_yards:{target:"receiving_yards",exposure:"receptions",kind:"rate",roleExposure:"targets",min:2,prior:11,lines:[29.5,49.5,69.5]},
 receiving_touchdowns:{target:"receiving_tds",exposure:"targets",kind:"rare_conversion",min:2,prior:.05,lines:[.5,1.5]},
 completion_pct:{target:"completions",exposure:"attempts",kind:"percentage",role:"QB",min:10,prior:.63,lines:[59.5,64.5,69.5]}
};
const num=x=>typeof x==="number"&&Number.isFinite(x),count=x=>Number.isInteger(x)&&x>=0;
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const compatible=(r,s)=>num(r[s.target])&&count(r[s.exposure])&&(!s.role||r.position===s.role)&&((s.kind==="rate")||count(r[s.target]))&&(!["conversion","rare_conversion","percentage"].includes(s.kind)||r[s.target]<=r[s.exposure]);
function actual(r,s){if(!compatible(r,s))return null;return s.kind==="percentage"?(r[s.exposure]>0?100*r[s.target]/r[s.exposure]:null):r[s.target];}
function pmfBinomial(n,p,line,scale=1){
 let great=0;for(let k=0;k<=n;k++){let c=1;for(let j=1;j<=k;j++)c*= (n-j+1)/j;if(k*scale>line)great+=c*p**k*(1-p)**(n-k);}return Math.min(1,Math.max(0,great));
}
function model(prior,s){
 const a=prior.filter(r=>compatible(r,s)&&actual(r,s)!==null&&count(r[s.roleExposure||s.exposure])).slice(-20);
 if(a.length<8||avg(a.slice(-5).map(r=>r[s.roleExposure||s.exposure]))<s.min)return null;
 const last=a.slice(-10),values=a.map(r=>actual(r,s)),base=.5*avg(values.slice(-5))+.3*avg(values.slice(-10))+.2*avg(values);
 const ex=last.map(r=>r[s.exposure]),volume=.65*avg(ex.slice(-3))+.35*avg(ex);
 const total=a.reduce((t,r)=>t+r[s.exposure],0),target=a.reduce((t,r)=>t+r[s.target],0);
 if(s.kind!=="volume"&&total<=0)return null;
 const rate=(target+20*(s.prior??0))/(total+20);
 const p=Math.max(0,Math.min(1,rate)),estimate=s.kind==="percentage"?100*p:s.kind==="volume"?volume:rate*volume;
 const empirical=(mu,line)=>{const center=avg(values),hits=values.filter(v=>{const x=s.kind==="percentage"?Math.min(100,Math.max(0,v-center+mu)):Math.round(v-center+mu);return (s.kind==="rate"?x:Math.max(0,x))>line;}).length;return (hits+1)/(values.length+2);};
 function prob(line){
  if(["conversion","rare_conversion","percentage"].includes(s.kind)){
   const eligible=ex.filter(n=>s.kind!=="percentage"||n>0);
   if(!eligible.length)return null;
   const q=avg(eligible.map(n=>pmfBinomial(n,p,line,s.kind==="percentage"?100/n:1)));
   return .98*q+.01;
  }
  return empirical(estimate,line);
 }
 return {base,estimate,baseProb:l=>empirical(base,l),prob};
}
function unique(rows,key){const map=new Map(),dup=new Set();for(const r of rows){const k=key(r);if(map.has(k))dup.add(k);else map.set(k,r);}for(const k of dup)map.delete(k);return [...map.values()];}
function study(rows,schedule){
 const key=(...x)=>x.join("|"),games=new Map();
 for(const g of unique(schedule,x=>x.game_id)){if(g.game_type!=="REG"||!num(g.home_score)||!num(g.away_score))continue;for(const t of [g.home_team,g.away_team]){const k=key(g.season,g.week,t);games.set(k,games.has(k)?null:g.game_id);}}
 const weeks=new Map(),prior=new Map(),out={};
 for(const r of unique(rows,x=>key(x.season,x.week,x.player_id))){const t=r.recent_team||r.team,g=games.get(key(r.season,r.week,t));if(!g||!r.player_id||Number(r.week)<1||Number(r.week)>18||r.season_type&&r.season_type!=="REG")continue;const k=key(r.season,String(r.week).padStart(2,"0"));const a=weeks.get(k)||[];a.push({...r,team:t,game:g});weeks.set(k,a);}
 for(const [,batch] of [...weeks].sort(([a],[b])=>a.localeCompare(b))){
  for(const r of batch){
   const old=(prior.get(r.player_id)||[]).filter(x=>x.team===r.team);
   if(Number(r.season)<2025||![r.attempts,r.carries,r.targets].some(x=>count(x)&&x>0))continue;
   for(const [m,s] of Object.entries(SPEC)){const y=actual(r,s),f=model(old,s);if(y===null||!f)continue;
    const k=key(r.season,m),a=out[k]??={n:0,games:new Set(),raw:0,model:0,rawLoss:0,modelLoss:0,rawMae:0,modelMae:0,t:0};a.n++;a.games.add(r.game);a.rawMae+=Math.abs(y-f.base);a.modelMae+=Math.abs(y-f.estimate);
    for(const line of s.lines){let p=f.baseProb(line),q=f.prob(line),hit=Number(y>line);if(!num(q))continue;a.t++;a.raw+=(p-hit)**2;a.model+=(q-hit)**2;a.rawLoss-=Math.log(hit?p:1-p);a.modelLoss-=Math.log(hit?q:1-q);}
   }
  }
  for(const r of batch){const a=prior.get(r.player_id)||[];a.push(r);prior.set(r.player_id,a);}
 }
 return {kind:"nfl_dedicated_core_synthetic_market_lab_v1",marketPolicies:Object.keys(SPEC),bySeasonMarket:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{appearances:a.n,distinctGames:a.games.size,thresholds:a.t,baselineBrier:a.t?a.raw/a.t:null,dedicatedBrier:a.t?a.model/a.t:null,baselineLogLoss:a.t?a.rawLoss/a.t:null,dedicatedLogLoss:a.t?a.modelLoss/a.t:null,baselineMAE:a.rawMae/a.n,dedicatedMAE:a.modelMae/a.n}])),conditionalOnObservedOffensiveOpportunity:true,actualOfferLines:false,calibrated:false,modelPromoted:false};
}
module.exports={SPEC,model,study};
