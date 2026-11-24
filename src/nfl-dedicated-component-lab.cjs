"use strict";
// Dedicated exact-component, ratio and rare-event count targets from weekly
// archive; all scoring is research-only on predetermined synthetic lines.
const num=x=>typeof x==="number"&&Number.isFinite(x),count=x=>Number.isInteger(x)&&x>=0;
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const fields=(r,ks)=>ks.every(k=>num(r[k]))?ks.map(k=>r[k]):null;
const sum=(r,ks)=>{const a=fields(r,ks);return a?a.reduce((s,x)=>s+x,0):null;};
const ratio=(r,a,b)=>num(r[a])&&count(r[b])&&r[b]>0?r[a]/r[b]:null;
const SPECS={
 rush_receive_yards:{v:r=>sum(r,["rushing_yards","receiving_yards"]),u:r=>sum(r,["carries","targets"]),min:3,lines:[39.5,59.5,79.5],signed:true},
 pass_rush_yards:{v:r=>sum(r,["passing_yards","rushing_yards"]),u:r=>r.attempts,min:10,lines:[199.5,249.5,299.5],signed:true},
 rush_receive_tds:{v:r=>sum(r,["rushing_tds","receiving_tds"]),u:r=>sum(r,["carries","targets"]),min:3,lines:[.5,1.5],hurdle:true},
 anytime_td:{v:r=>{const x=sum(r,["rushing_tds","receiving_tds"]);return x===null?null:Number(x>0);},u:r=>sum(r,["carries","targets"]),min:3,lines:[.5],hurdle:true,conditionalOffenseOnly:true},
 rush_yards_per_carry:{v:r=>ratio(r,"rushing_yards","carries"),u:r=>r.carries,min:3,lines:[3.5,4.5,5.5],signed:true,ratio:true},
 sacks_taken:{v:r=>r.sacks_suffered,u:r=>r.attempts,min:10,lines:[1.5,2.5,3.5]},
 passer_rating:{v:r=>{const a=fields(r,["attempts","completions","passing_yards","passing_tds","interceptions"]);if(!a||a[0]<=0)return null;const [n,c,y,t,i]=a,cl=x=>Math.max(0,Math.min(2.375,x));return (cl((c/n-.3)*5)+cl((y/n-3)*.25)+cl(t/n*20)+cl(2.375-i/n*25))*100/6;},u:r=>r.attempts,min:10,lines:[79.5,94.5,109.5],ratio:true},
 fumbles_lost:{v:r=>sum(r,["sack_fumbles_lost","rushing_fumbles_lost","receiving_fumbles_lost"]),u:r=>sum(r,["attempts","carries","targets"]),min:4,lines:[.5],hurdle:true},
 fumbles:{v:r=>sum(r,["sack_fumbles","rushing_fumbles","receiving_fumbles"]),u:r=>sum(r,["attempts","carries","targets"]),min:4,lines:[.5,1.5],hurdle:true}
};
function forecast(prior,s,line){
 const a=prior.map(r=>({v:s.v(r),u:s.u(r)})).filter(r=>num(r.v)&&num(r.u)&&r.u>=0).slice(-20);
 if(a.length<8||avg(a.slice(-5).map(r=>r.u))<s.min)return null;
 const v=a.map(r=>r.v),base=(1+v.filter(x=>x>line).length)/(a.length+2),mean=avg(v),mu=(5*avg(v.slice(-5))+10*mean)/15;
 let p=(1+v.filter(x=>{let y=x-mean+mu;if(!s.ratio)y=Math.round(y);return (s.signed?y:Math.max(0,y))>line;}).length)/(a.length+2);
 if(s.hurdle){const positive=v.filter(x=>x>0),rate=(positive.length+1)/(v.length+2);p=line<1?rate:positive.length?rate*(1+positive.filter(x=>x>line).length)/(positive.length+2):.001;}
 return {base,candidate:Math.max(.001,Math.min(.999,p))};
}
function study(rows,schedule){
 const games=new Map(),weeks=new Map(),history=new Map(),out={};const k=(...a)=>JSON.stringify(a);
 for(const g of schedule||[])if(g.game_type==="REG"&&num(g.home_score)&&num(g.away_score)){for(const t of [g.home_team,g.away_team]){const z=k(Number(g.season),Number(g.week),t);games.set(z,games.has(z)?null:g.game_id);}}
 const seen=new Map();for(const r of rows||[]){const z=k(r.season,r.week,r.player_id);seen.set(z,seen.has(z)?null:r);}
 for(const r of seen.values()){if(!r?.player_id||r.season_type&&r.season_type!=="REG")continue;const t=r.recent_team||r.team,g=games.get(k(Number(r.season),Number(r.week),t));if(!g)continue;const w=Number(r.season)*100+Number(r.week),a=weeks.get(w)||[];a.push({...r,team:t,game:g});weeks.set(w,a);}
 for(const [,batch] of [...weeks].sort(([a],[b])=>a-b)){
  for(const r of batch){if(Number(r.season)<2025)continue;const h=history.get(k(r.player_id,r.team))||[];
   for(const [m,s] of Object.entries(SPECS)){const y=s.v(r);if(!num(y)||!(s.u(r)>0))continue;
    for(const l of s.lines){const f=forecast(h,s,l);if(!f)continue;const a=out[r.season+"|"+m]??={n:0,b:0,c:0,games:new Set()},hit=Number(y>l);a.n++;a.b+=(f.base-hit)**2;a.c+=(f.candidate-hit)**2;a.games.add(r.game);}
   }
  }
  for(const r of batch){const z=k(r.player_id,r.team),a=history.get(z)||[];a.push(r);history.set(z,a.slice(-60));}
 }
 return {kind:"nfl_component_historical_research_v1",markets:Object.keys(SPECS),bySeasonMarket:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{thresholds:a.n,distinctGames:a.games.size,baselineBrier:a.b/a.n,challengerBrier:a.c/a.n}])),offensiveComponentsOnly:true,actualPlatformRulesVerified:false,calibrated:false,modelPromoted:false};
}
module.exports={SPECS,forecast,study};
