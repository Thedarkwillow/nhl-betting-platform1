"use strict";
// Defensive blocks are actual official blockedShots; blockedAttempts in the
// shooter file are NOT player defensive blocks. Verify the two archives.
const {verifiedGames}=require("./nhl-official-attempt-future-v1.cjs"),{officialOutcome,provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const num=Number.isFinite,dt=Date.parse,mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),key=x=>JSON.stringify([x.gameId,x.playerId,x.market,x.line,x.tier]);
function candidate(p,games,history){
 const prior=[],opp=[],league=[];
 for(const g of games){
  for(const club of g.teams){const attempts=sum(g.rows.filter(x=>x.team!==club).map(x=>x.shotAttempts));if(attempts<=0)continue;league.push(attempts);if(g.teams.includes(p.opponent)&&club!==p.opponent)opp.push(attempts);}
  const a=g.rows.filter(x=>x.playerId===p.playerId&&x.team===p.team);if(a.length!==1)continue;
  const h=(history?.players?.[String(p.playerId)]?.games||[]).filter(x=>x.gameId===g.gameId&&x.gameDate===g.gameDate&&x.team===p.team&&x.type==="skater"&&["FINAL","OFF"].includes(x.gameState)&&Number.isInteger(x.blockedShots)&&x.blockedShots>=0&&x.timeOnIceSeconds===a[0].timeOnIceSeconds&&x.timeOnIceSeconds>0);
  if(h.length!==1)continue;
  const attempts=sum(g.rows.filter(x=>x.team!==p.team).map(x=>x.shotAttempts));if(attempts<=0||h[0].blockedShots>attempts)continue;
  prior.push({blocks:h[0].blockedShots,attempts,ice:h[0].timeOnIceSeconds});
 }
 const a=prior.slice(-20);if(a.length<8||opp.length<8||league.length<64)return null;
 const toi=.65*mean(a.slice(-10).map(x=>x.ice))+.35*mean(a.slice(-5).map(x=>x.ice));
 const base=sum(a.map(x=>x.blocks))*toi/sum(a.map(x=>x.ice)),oppMean=mean(opp.slice(-10)),ownExposure=mean(a.map(x=>x.attempts));
 const factor=Math.max(.8,Math.min(1.2,1+.5*(oppMean/ownExposure-1)*opp.length/(opp.length+12))),projection=base*factor;
 return {projection,side:projection>p.line?"Higher":projection<p.line?"Lower":null,base,priorGames:a.length,opponentGames:opp.length,opponentAttempts:oppMean,expectedIceSeconds:toi,calibrated:false,modelPromoted:false};
}
const KIND="nhl_verified_block_attempt_opportunity_v1";
function freeze(snapshot,archives,history){
 const games=verifiedGames(archives,snapshot.generatedAt),rows=[],seen=new Set();
 for(const p of snapshot.individualPropSelections||[]){
  if(p.market!=="blockedShots"||p.tier!=="Standard"||!num(p.line)||dt(p.gameStartAt)-dt(snapshot.generatedAt)<900000||!num(dt(p.capturedAt))||dt(p.capturedAt)>dt(snapshot.generatedAt)||dt(snapshot.generatedAt)-dt(p.capturedAt)>1800000||seen.has(key(p)))continue;
  const raw=(snapshot.rankedProps||[]).filter(x=>key(x)===key(p)&&x.lean===p.lean&&x.capturedAt===p.capturedAt);if(raw.length!==1)continue;
  seen.add(key(p));rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,line:p.line,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,originalSide:p.lean,model:candidate(p,games,history)});
 }
 return {kind:KIND,generatedAt:snapshot.generatedAt,rows,sourceVerifiedHistoricalGames:games.length,modelPromoted:false,calibrated:false};
}
function grade(frames,history,policyAt){
 const seen=new Set(),out={registered:0,qualified:0,decided:0,championWins:0,shadowWins:0,alwaysHigher:0,alwaysLower:0,pushes:0};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,t=s?.blockAttemptOpportunityV1;if(!num(dt(policyAt))||dt(s?.generatedAt)<=dt(policyAt)||!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||t?.kind!==KIND||t.generatedAt!==s.generatedAt||t.calibrated!==false||t.modelPromoted!==false)continue;
  for(const x of t.rows||[]){
   const p=(s.individualPropSelections||[]).filter(p=>key(p)===key(x)&&p.lean===x.originalSide&&p.capturedAt===x.capturedAt&&p.gameStartAt===x.gameStartAt);
   if(p.length!==1||seen.has(key(x))||dt(x.gameStartAt)-dt(f.firstCommittedAt)<900000)continue;
   seen.add(key(x));out.registered++;
   const m=x.model;if(!m||m.calibrated!==false||m.modelPromoted!==false||!num(m.projection)||!["Higher","Lower"].includes(m.side)||m.side!==(m.projection>x.line?"Higher":m.projection<x.line?"Lower":null))continue;
   out.qualified++;const y=officialOutcome(p[0],history);if(y.status==="push"){out.pushes++;continue;}if(y.status!=="decided")continue;
   out.decided++;out.championWins+=Number(y.side===x.originalSide);out.shadowWins+=Number(y.side===m.side);out.alwaysHigher+=Number(y.side==="Higher");out.alwaysLower+=Number(y.side==="Lower");
  }
 }
 return {...out,kind:KIND,originalFrozenOnly:true,modelPromoted:false,calibrated:false};
}
module.exports={candidate,freeze,grade};
