"use strict";
// Independent benchmark comparison on original first-Git frozen lines only.
// Conditional sportsbook matches are not authenticated platform offers.
const dt=Date.parse,n=Number.isFinite,key=r=>JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);
function study(frames,history){
 const seen=new Set(),out={};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(f.gitHistoryCount!==1||!s||!(dt(s.generatedAt)<=dt(f.firstCommittedAt))||s.matchupContextReviewV1?.generatedAt!==s.generatedAt)continue;
  for(const r of s.matchupContextReviewV1.rows||[]){
   const k=key(r),b=r.context?.benchmark;
   if(seen.has(k)||!n(dt(r.gameStartAt))||dt(r.gameStartAt)-dt(f.firstCommittedAt)<900000||!b||b.conditionalNameTeamGameLine!==true||b.books<2||!n(b.higher)||b.higher<0||b.higher>1||!(dt(b.observedAt)<=dt(s.generatedAt))||!n(r.originalHigher)||r.originalHigher<0||r.originalHigher>1||r.line%1!==.5)continue;
   const matches=(s.individualPropSelections||[]).filter(x=>key(x)===k&&x.capturedAt===r.capturedAt&&x.lean===r.side),raw=(s.rankedProps||[]).filter(x=>key(x)===k&&x.capturedAt===r.capturedAt&&x.lean===r.side);
   if(matches.length!==1||raw.length!==1||raw[0].probabilities?.higher!==r.originalHigher)continue;
   seen.add(k);const a=(history.players[String(r.playerId)]?.games||[]).filter(x=>x.gameId===r.gameId&&x.playerId===r.playerId&&["OFF","FINAL"].includes(x.gameState)&&x.timeOnIceSeconds>0&&Number.isInteger(x[r.market])&&x[r.market]>=0);if(a.length!==1)continue;
   const y=Number(a[0][r.market]>r.line),v=r.originalHigher,p=b.higher,j=r.market+"|"+r.tier,g=out[j]??={n:0,games:new Set(),modelBrier:0,benchmarkBrier:0,modelWins:0,benchmarkWins:0,alwaysHigher:0};
   g.n++;g.games.add(r.gameId);g.modelBrier+=(v-y)**2;g.benchmarkBrier+=(p-y)**2;g.modelWins+=Number((v>=.5)===!!y);g.benchmarkWins+=Number((p>=.5)===!!y);g.alwaysHigher+=y;
  }
 }
 return {kind:"conditional_external_benchmark_original_line_v1",byMarketTier:Object.fromEntries(Object.entries(out).map(([k,x])=>[k,{n:x.n,games:x.games.size,modelBrier:x.modelBrier/x.n,benchmarkBrier:x.benchmarkBrier/x.n,modelWins:x.modelWins,benchmarkWins:x.benchmarkWins,alwaysHigher:x.alwaysHigher,alwaysLower:x.n-x.alwaysHigher}])),exactSharedPlayerIdentityVerified:false,modelPromoted:false};
}
module.exports={study};