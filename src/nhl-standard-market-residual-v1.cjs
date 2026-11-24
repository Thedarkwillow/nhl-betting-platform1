"use strict";
// Chronological market-level residual correction. Exploratory, never promotion.
const finite=Number.isFinite;
function correction(prior,market,p){
 const a=prior.filter(x=>x.market===market&&finite(x.p)&&[0,1].includes(x.y));
 if(a.length<30||new Set(a.map(x=>x.gameId)).size<10)return null;
 const residual=a.reduce((s,x)=>s+x.y-x.p,0)/(a.length+100);
 return Math.max(.025,Math.min(.975,p+.5*residual));
}
function evaluate(records,history){
 const rows=[],seen=new Set();
 for(const r of records){
  const key=[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
  if(seen.has(key)||r.tier!=="Standard"||!finite(r.challengerHigher)||r.challengerHigher<=0||r.challengerHigher>=1||r.line%1!==.5)continue;
  const games=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId&&["OFF","FINAL"].includes(g.gameState)&&g.timeOnIceSeconds>0&&Number.isInteger(g[r.market])&&g[r.market]>=0&&(!["saves","goalsAgainst"].includes(r.market)||g.goalieStarted===true));
  if(games.length!==1)continue;
  const day=games[0].gameDate;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  seen.add(key);rows.push({gameId:r.gameId,day,market:r.market,p:r.challengerHigher,y:Number(games[0][r.market]>r.line)});
 }
 const out={};const counts=(k)=>out[k]??={n:0,baseWins:0,candidateWins:0,higherWins:0,lowerWins:0,baseBrier:0,candidateBrier:0};
 const prior=[];
 for(const day of [...new Set(rows.map(r=>r.day))].sort()){
  const batch=rows.filter(r=>r.day===day);
  for(const x of batch){const p=correction(prior,x.market,x.p);if(p===null)continue;
   for(const k of ["all",x.market]){const z=counts(k);z.n++;z.baseWins+=Number((x.p>.5)===Boolean(x.y));z.candidateWins+=Number((p>.5)===Boolean(x.y));z.higherWins+=x.y;z.lowerWins+=1-x.y;z.baseBrier+=(x.p-x.y)**2;z.candidateBrier+=(p-x.y)**2;}
  }prior.push(...batch);
 }
 for(const z of Object.values(out)){z.baseBrier/=z.n;z.candidateBrier/=z.n;}
 return {kind:"nhl_standard_market_residual_walkforward_v1",inputRows:rows.length,groups:out,priorDatesOnly:true,retrospectiveOnly:true,prospectiveImprovementProven:false,modelPromoted:false};
}
module.exports={correction,evaluate};
