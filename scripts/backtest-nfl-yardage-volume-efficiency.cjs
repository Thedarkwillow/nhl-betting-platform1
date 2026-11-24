"use strict";
// Retrospective, appearance-conditional paired yards forecasts. Fit only
// 2025; 2026 replay is not untouched prospective evidence.
const {prepare,buildRaw,weekClusterInterval}=require("./backtest-nfl-matchup-context.cjs");
const fs=require("node:fs"),path=require("node:path");
const finite=x=>typeof x==="number"&&Number.isFinite(x),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const spec={passing_yards:"attempts",receiving_yards:"targets",passing_tds:"attempts",receiving_tds:"targets"};
function predict(history,defense,league,market){
 const use=spec[market],ok=r=>finite(r[market])&&finite(r[use])&&r[use]>=0;
 const h=history.filter(ok).slice(-20),d=defense.filter(ok).slice(-8),l=league.filter(ok);
 if(h.length<8||d.length<4||l.length<32)return null;
 const base=mean(h.slice(-5).map(x=>x[market])),opps=sum(h.map(x=>x[use])),den=sum(l.map(x=>x[use])),defDen=sum(d.map(x=>x[use]));
 if(opps<=0||den<=0||defDen<=0)return null;
 const leagueRate=sum(l.map(x=>x[market]))/den,defRate=sum(d.map(x=>x[market]))/defDen;
 if(leagueRate<=0)return null;
 const usage=.6*mean(h.slice(-5).map(x=>x[use]))+.4*mean(h.slice(-12).map(x=>x[use]));
 // Regression toward league efficiency, volume independently estimated.
 const eff=(sum(h.map(x=>x[market]))+20*leagueRate)/(opps+20),adjust=cap(1+.4*(defRate/leagueRate-1)*d.length/(d.length+8),.85,1.15);
 const estimate=usage*eff;
 return {base,efficiency:estimate,blend:.5*base+.5*estimate,defense:.5*base+.5*estimate*adjust};
}
function replay(raw){
 const {weeks}=prepare(raw),player=new Map(),allowed=new Map(),league=new Map(),out={};
 const add=(m,k,r)=>{const a=m.get(k)||[];a.push(r);m.set(k,a);};
 for(const b of weeks){
  const counts=new Map();for(const r of b.players)counts.set(r.player_id,(counts.get(r.player_id)||0)+1);
  for(const r of b.players){
   if(!r.player_id||counts.get(r.player_id)!==1||!r.team||!r.opponent_team)continue;
   for(const [m,u] of Object.entries(spec)){
    if(m.startsWith("passing_")&&r.position!=="QB"||m.startsWith("receiving_")&&!["WR","TE","RB","FB"].includes(r.position))continue;
    const h=player.get(r.player_id)||[];const recent=h.filter(x=>finite(x[m])&&finite(x[u])&&x[u]>=0).slice(-5);if(!finite(r[m])||h.length<8||recent.length<5||mean(recent.map(x=>x[u]))<(m.startsWith("passing_")?10:2))continue;
    const v=predict(h,allowed.get(b.year+"|"+r.opponent_team)||[],league.get(b.year)||[],m);
    if(v&&b.year>=2025)(out[m]??=[]).push({year:b.year,week:b.week,actual:r[m],baseline:v.base,...v});
   }
  }
  for(const r of b.players)if(r.player_id&&counts.get(r.player_id)===1){add(player,r.player_id,r);}
  const tc=new Map();for(const r of b.teams)tc.set(r.team,(tc.get(r.team)||0)+1);
  for(const r of b.teams)if(tc.get(r.team)===1&&r.opponent_team){add(allowed,b.year+"|"+r.opponent_team,r);add(league,b.year,r);}
 }
 const models=["base","efficiency","blend","defense"],metric=(a,k)=>a.length?mean(a.map(r=>Math.abs(r[k]-r.actual))):null;
 return {kind:"nfl_yards_volume_efficiency_replay_v1",generatedAt:new Date().toISOString(),byMarket:Object.fromEntries(Object.entries(out).map(([m,rows])=>{const dev=rows.filter(x=>x.year===2025),test=rows.filter(x=>x.year===2026),train=Object.fromEntries(models.map(k=>[k,metric(dev,k)])),selected=dev.length>=100?models.slice().sort((a,b)=>train[a]-train[b])[0]:"base";return [m,{selected,development:dev.length,holdout:test.length,holdoutWeeks:new Set(test.map(x=>x.week)).size,trainingMAE:train,holdoutMAE:Object.fromEntries(models.map(k=>[k,metric(test,k)])),pairedWeekCI:test.length?weekClusterInterval(test,"baseline",selected):null}]})),priorWeekOnly:true,retrospectiveOnly:true,modelPromoted:false,actualLineAccuracy:null};
}
function main(){const a=replay(buildRaw());if(!Object.keys(a.byMarket).length)throw Error("empty replay");fs.writeFileSync(path.resolve(__dirname,"../outputs/nfl/backtests/yardage-volume-efficiency-latest.json"),JSON.stringify(a,null,2)+"\n");console.log(JSON.stringify(a));}
if(require.main===module)main();module.exports={predict,replay};
