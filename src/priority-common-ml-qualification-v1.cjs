"use strict";
// Fixed, matched prospective cohort. Never estimate a new prediction during grading.
const dt=Date.parse,n=Number.isFinite,prob=x=>n(x)&&x>=0&&x<=1;
const {pacificDay}=require("./forward-calibration-evidence.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const key=x=>JSON.stringify([x.gameId,x.playerId??x.historicalPlayerId,x.market,x.line,x.tier]);
const loss=(p,y)=>-Math.log(Math.max(1e-8,y?p:1-p));
function eligible(m,market,line,artifactAt,generatedAt){
 return m?.kind==="priority_common_features_logistic_shadow_v1"&&m.researchOnly===true&&m.calibrated===false&&m.modelPromoted===false&&m.market===market&&m.line===line&&line%1===.5&&prob(m.higher)&&dt(m.artifactFirstGitAt)===dt(artifactAt)&&dt(artifactAt)<=dt(generatedAt);
}
function nhl(frames,history,artifactAt){
 const out=[],seen=new Set();
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||s.source!=="partner-api.prizepicks.com"||s.boardFresh!==true||s.captureScopeComplete!==true||s.matchupContextReviewV1?.generatedAt!==s.generatedAt)continue;
  for(const r of s.matchupContextReviewV1.rows||[]){
   const id=key(r);if(seen.has(id)||r.tier!=="Standard"||r.market!=="points"||!eligible(r.commonML,"nhl_points",r.line,artifactAt,s.generatedAt)||!prob(r.originalHigher)||!["Higher","Lower"].includes(r.side)||!(dt(r.gameStartAt)-dt(f.firstCommittedAt)>=900000)||!(dt(r.capturedAt)<=dt(s.generatedAt)))continue;
   const a=(s.individualPropSelections||[]).filter(x=>key(x)===id&&x.lean===r.side&&x.capturedAt===r.capturedAt&&x.gameStartAt===r.gameStartAt),b=(s.rankedProps||[]).filter(x=>key(x)===id&&x.lean===r.side&&x.capturedAt===r.capturedAt&&x.probabilities?.higher===r.originalHigher);
   if(a.length!==1||b.length!==1)continue;seen.add(id);
   const v=(history.players?.[String(r.playerId)]?.games||[]).filter(x=>x.gameId===r.gameId&&x.playerId===r.playerId&&x.type==="skater"&&["FINAL","OFF"].includes(x.gameState)&&n(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0&&Number.isInteger(x.points)&&x.points>=0);
   out.push({sport:"NHL",market:r.market,line:r.line,gameId:r.gameId,slate:pacificDay(r.gameStartAt),p:r.commonML.higher,base:r.originalHigher,originalSide:r.side,y:v.length===1?Number(v[0].points>r.line):null});
  }
 }return out;
}
function nfl(frames,weeklyRows,schedule,artifactAt,policyAt){
 const {score,KIND}=require("./nfl-independent-forward-evidence.cjs"),{officialKickoffMatches}=require("./nfl-independent-source-preview.cjs");
 const newer=frames.filter(f=>dt(f.snapshot?.generatedAt)>=dt(artifactAt)),observed=score(newer,{weeklyRows,schedule,policyAt}).firstObservationInputs;
 const by=new Map(observed.map(r=>[r.id+"|"+dt(r.frozenAt),r])),seen=new Set(),out=[];
 for(const f of [...newer].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(s?.kind!==KIND||s.researchOnly!==true||s.calibrated!==false||s.autoPickEligible!==false||s.requestedTier!=="standard"||!provenance(s,f.firstCommittedAt,f.gitHistoryCount))continue;
  for(const r of s.rows||[]){
   const id=key(r),g=officialKickoffMatches({eventStartsAt:r.eventStartsAt,team:r.team,matchup:r.opponent},schedule);
   if(seen.has(id)||s.rows.filter(x=>key(x)===id).length!==1||r.tier!=="Standard"||!["receiving_yards","passing_attempts"].includes(r.market)||!eligible(r.commonML,"nfl_"+r.market,r.line,artifactAt,s.generatedAt)||!g||g.gameId!==r.gameId||g.season!==r.season||g.week!==r.week||dt(r.capturedAt)!==dt(s.boardAt)||!(dt(r.capturedAt)<=dt(s.generatedAt))||!(dt(r.eventStartsAt)-dt(f.firstCommittedAt)>=900000)||!["Higher","Lower"].includes(r.side)||!prob(r.probabilities?.higher)||r.probabilities.push!==0||!prob(r.probabilities?.lower)||Math.abs(r.probabilities.higher+r.probabilities.lower-1)>1e-6||r.probability<=.5||Math.abs(r.probabilities[r.side.toLowerCase()]-r.probability)>1e-6)continue;
   seen.add(id);const o=by.get(id+"|"+dt(f.firstCommittedAt));
   out.push({sport:"NFL",market:r.market,line:r.line,gameId:r.gameId,slate:pacificDay(r.eventStartsAt),p:r.commonML.higher,base:r.probabilities.higher,originalSide:r.side,y:o?[0,1].includes(o.y)?r.side==="Higher"?o.y:1-o.y:null:null});
  }
 }return out;
}
function interval(groups){
 if(groups.length<30)return null;
 let seed=28019;const a=[];
 for(let i=0;i<1000;i++){let s=0;for(let j=0;j<groups.length;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;s+=groups[Math.floor(seed/4294967296*groups.length)];}a.push(s/groups.length);}
 a.sort((a,b)=>a-b);return {lower:a[25],upper:a[974],unit:"game_cluster_equal_weight"};
}
function summarize(rows){
 const out={};for(const r of rows){const k=[r.sport,r.market,r.line].join("|"),a=out[k]??={registered:0,pending:0,decided:0,mlWins:0,originalWins:0,alwaysHigher:0,alwaysLower:0,mlBrier:0,originalBrier:0,mlLoss:0,originalLoss:0,pSum:0,ySum:0,games:new Map(),slates:new Set(),bins:Array.from({length:10},()=>({count:0,p:0,y:0}))};a.registered++;if(r.y===null){a.pending++;continue;}const y=r.y,p=r.p,b=r.base;a.decided++;a.mlWins+=Number((p>=.5)===!!y);a.originalWins+=Number((r.originalSide==="Higher")===!!y);a.alwaysHigher+=y;a.alwaysLower+=1-y;a.mlBrier+=(p-y)**2;a.originalBrier+=(b-y)**2;a.mlLoss+=loss(p,y);a.originalLoss+=loss(b,y);a.pSum+=p;a.ySum+=y;a.slates.add(r.slate);const g=a.games.get(r.gameId)||{n:0,diff:0};g.n++;g.diff+=(p-y)**2-(b-y)**2;a.games.set(r.gameId,g);const bin=a.bins[Math.min(9,Math.floor(p*10))];bin.count++;bin.p+=p;bin.y+=y;}
 return Object.fromEntries(Object.entries(out).map(([k,a])=>{
 const v=a.decided,ci=interval([...a.games.values()].map(g=>g.diff/g.n)),enough=v>=250&&a.games.size>=50&&a.slates.size>=20,beats=a.mlWins>Math.max(a.originalWins,a.alwaysHigher,a.alwaysLower)&&a.mlBrier<a.originalBrier&&a.mlLoss<a.originalLoss&&ci?.upper<0;
 const calibrationGap=v?(a.pSum-a.ySum)/v:null;
 return [k,{registered:a.registered,pending:a.pending,decided:v,distinctGames:a.games.size,distinctSlates:a.slates.size,mlWins:a.mlWins,originalWins:a.originalWins,alwaysHigher:a.alwaysHigher,alwaysLower:a.alwaysLower,mlHitRate:v?a.mlWins/v:null,originalHitRate:v?a.originalWins/v:null,mlBrier:v?a.mlBrier/v:null,originalBrier:v?a.originalBrier/v:null,mlLogLoss:v?a.mlLoss/v:null,originalLogLoss:v?a.originalLoss/v:null,meanProbability:v?a.pSum/v:null,observedHigherRate:v?a.ySum/v:null,calibrationGap,reliabilityBins:a.bins.map((b,i)=>({low:i/10,high:(i+1)/10,count:b.count,meanProbability:b.count?b.p/b.count:null,observedRate:b.count?b.y/b.count:null})),gameCluster95:ci,minimumEvidenceMet:enough,beatsMatchedBaselines:!!beats,eligibleForIndependentReview:!!(enough&&beats&&Math.abs(calibrationGap)<=.05),modelPromoted:false,calibrationApproved:false}];
 }));
}
module.exports={nhl,nfl,summarize,eligible};