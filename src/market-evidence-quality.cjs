"use strict";
// Private evidence audit. No wagering automation, payout inference, or
// production selection changes. Same-threshold market benchmark only.
// Calibration records describe genuine original frozen selections.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const num=x=>typeof x==="number"&&Number.isFinite(x);
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function reliability(rows){
 const buckets={},seen=new Map();
 for(const r of rows||[]){if(!rowValid(r)||!num(r.estimatedProbability)||r.estimatedProbability<0||r.estimatedProbability>1)continue;const a=seen.get(r.id)||[];a.push(r);seen.set(r.id,a);}
 for(const a of seen.values()){
  if(a.length!==1)continue;
  const r=a[0],k=r.market+"|"+r.tier+"|"+r.selectedSide;
  const b=buckets[k]??={registered:0,resolved:0,decided:0,hits:0,pushes:0,brier:0,loss:0,confidence:0,games:new Set(),dates:new Set(),bins:Array.from({length:10},()=>({n:0,sum:0,hits:0}))};
  b.registered++;if(r.selectionStatus==="pending_official_player_stats")continue;
  const p=r.estimatedProbability,y=Number(r.selectionStatus==="correct"),clipped=Math.max(.000001,Math.min(.999999,p));
  b.resolved++;b.decided+=Number(r.selectionStatus!=="push");b.hits+=y;b.pushes+=Number(r.selectionStatus==="push");b.brier+=(p-y)**2;b.loss-=Math.log(y?clipped:1-clipped);b.confidence+=p;b.games.add(r.gameId);b.dates.add(r.gameStartAt.slice(0,10));
  const bin=b.bins[Math.min(9,Math.floor(p*10))];bin.n++;bin.sum+=p;bin.hits+=y;
 }
 return Object.fromEntries(Object.entries(buckets).map(([k,b])=>[k,{registered:b.registered,resolved:b.resolved,pending:b.registered-b.resolved,decided:b.decided,pushes:b.pushes,distinctGames:b.games.size,distinctDates:b.dates.size,strictHitRate:b.resolved?b.hits/b.resolved:null,decidedHitRate:b.decided?b.hits/b.decided:null,brier:b.resolved?b.brier/b.resolved:null,logLoss:b.resolved?b.loss/b.resolved:null,meanEstimatedProbability:b.resolved?b.confidence/b.resolved:null,reliability:b.bins.map((x,i)=>({from:i/10,to:(i+1)/10,n:x.n,meanEstimate:x.n?x.sum/x.n:null,observedStrictHitRate:x.n?x.hits/x.n:null})),minimumEvidenceReached:b.resolved>=100&&b.games.size>=30&&b.dates.size>=10,calibrated:false}]));
}
// Exact opposing quote pair, same identified market, line, event and book,
// observed together and before start. Proportional normalization is a
// conditional no-push benchmark, not a true probability or pick'em payout.
function noVig(pair,{asOf}={}){
 if(!Array.isArray(pair)||pair.length!==2)return null;
 const [a,b]=pair,keys=["book","gameId","playerId","market","line","period","observedAt","eventStartsAt"];
 if(keys.some(k=>a?.[k]===undefined||a[k]===null||a[k]!==b?.[k])||!num(a.line)||!["Higher","Lower"].includes(a.side)||!["Higher","Lower"].includes(b.side)||a.side===b.side||!num(a.decimalOdds)||!num(b.decimalOdds)||a.decimalOdds<=1||b.decimalOdds<=1||!(dt(a.observedAt)<=dt(asOf)&&dt(asOf)<dt(a.eventStartsAt)))return null;
 const p=1/a.decimalOdds,q=1/b.decimalOdds,total=p+q;
 return {higher:(a.side==="Higher"?p:q)/total,lower:(a.side==="Lower"?p:q)/total,overround:total-1,conditionalOnNoPush:true,benchmarkOnly:true};
}
// Paper accounting requires an actual observed hypothetical entry quote,
// versioned terms and independently recorded settlement. Missing payouts
// NEVER become zero. This is a ledger calculation, not a stake suggestion.
function paperReturns(rows){
 const seen=new Map();for(const r of rows||[]){if(typeof r?.id!=="string"||!r.id)continue;const a=seen.get(r.id)||[];a.push(r);seen.set(r.id,a);}
 let n=0,cost=0,returned=0,excluded=0;
 for(const a of seen.values()){const r=a[0];
  if(a.length!==1||r.paperOnly!==true||r.termsAuthenticated!==true||r.settlementAuthenticated!==true||typeof r.termsVersion!=="string"||!r.termsVersion||!num(r.paperStake)||r.paperStake<=0||!num(r.officialPaperReturn)||r.officialPaperReturn<0||!(dt(r.quoteAt)<=dt(r.frozenAt)&&dt(r.frozenAt)<dt(r.firstEventStart)&&dt(r.firstEventStart)<dt(r.settledAt))){excluded+=a.length;continue;}
  n++;cost+=r.paperStake;returned+=r.officialPaperReturn;
 }
 return {settledPaperEntries:n,excluded,cost,returned,paperROI:n?(returned-cost)/cost:null,realizedCashROI:null,verifiedProfitability:false};
}
module.exports={reliability,noVig,paperReturns};
