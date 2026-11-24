"use strict";
const {study}=require("./bounded-sportsbook-consensus.cjs"),{candidateRows,sameEvent}=require("./archived-prop-market-benchmark.cjs");
const dt=Date.parse,norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),key=q=>JSON.stringify([q.sport,q.eventId,q.player,q.market,q.period,q.line]);
function quoteTiming(p,t,commit){
 const cap=dt(p.capturedAt),freeze=dt(p.committedAt),start=dt(p.gameStart);
 if(![cap,freeze,start,t,commit].every(Number.isFinite)||cap>freeze||t>commit+1000||freeze>=start||commit>=start||t>=start||Math.abs(cap-t)>8*3600000)return null;
 // The sportsbook quote must have been Git-committed BEFORE the original
 // prediction was even captured, not merely before its later Git freeze.
 if(commit<=cap&&commit<=freeze&&t<=cap&&cap-t<=1800000)return "beforeFreeze";
 if(freeze<=t&&t-cap<=1800000)return "afterFreezeWithin30m";
 return "laterPrematch";
}
function validTimingForComparison(p,t,commit){
 const mode=quoteTiming(p,t,commit);
 if(mode===null)return false;
 // A quote already committed before the original prediction is desirable.
 // Later captured sportsbook quotes are merely retrospective benchmarks.
 return mode==="beforeFreeze"||(dt(p.committedAt)<=t&&dt(p.capturedAt)<=t);
}
function audit(archives,frames){
 const props=[...candidateRows("NHL",frames.NHL),...candidateRows("NFL",frames.NFL)],groups=new Map(),counts={},seen=new Set(),timing={beforeFreeze:0,afterFreezeWithin30m:0,laterPrematch:0,ambiguous:0,conditionallyMatchedBeforeFreeze:0,conditionallyMatchedAfterFreeze:0},captureSkewBuckets={within10m:0,within30m:0,within2h:0,within8h:0,noExactThreshold:0};
 const add=(s,k)=>{const a=counts[s]??={};a[k]=(a[k]||0)+1;};
 for(const entry of archives||[]){
  const a=entry.archive,t=dt(a?.generatedAt),commit=dt(entry.firstCommittedAt);
  if(entry.gitHistoryCount!==1||!Number.isFinite(t)||!Number.isFinite(commit)||commit<Math.floor(t/1000)*1000||commit-t>900000||seen.has(a.generatedAt))continue;seen.add(a.generatedAt);
  for(const q of study(a,{now:a.generatedAt,includePrivateBookBreakdown:true}).groups){
   add(q.sport,"native");const events=props.filter(p=>p.sport===q.sport&&sameEvent(p,q,a));
   const names=events.filter(p=>p.sourceName===norm(q.player)),markets=names.filter(p=>p.market===q.market),lines=markets.filter(p=>p.line===q.line),pregame=lines.filter(p=>validTimingForComparison(p,t,commit));
   const stage=!events.length?"no_event":!names.length?"no_exact_name":!markets.length?"no_market":!lines.length?"no_same_threshold":!pregame.length?"no_preexisting_frame":new Set(pregame.map(p=>JSON.stringify([p.playerId,p.gameId]))).size!==1?"ambiguous_identity":"conditional_match";
   add(q.sport,stage);
   if(stage==="conditional_match"){
    if(pregame.some(p=>quoteTiming(p,t,commit)==="beforeFreeze"))timing.conditionallyMatchedBeforeFreeze++;
    else timing.conditionallyMatchedAfterFreeze++;
   }
   const eligible=lines.filter(p=>quoteTiming(p,t,commit)!==null);
   if(!eligible.length)captureSkewBuckets.noExactThreshold++;else{const skew=Math.min(...eligible.map(p=>Math.abs(dt(p.capturedAt)-t)));captureSkewBuckets[skew<=600000?"within10m":skew<=1800000?"within30m":skew<=7200000?"within2h":"within8h"]++;}
   if(new Set(eligible.map(p=>JSON.stringify([p.playerId,p.gameId]))).size>1)timing.ambiguous++;
   else if(eligible.length){if(eligible.some(p=>quoteTiming(p,t,commit)==="beforeFreeze"))timing.beforeFreeze++;else if(eligible.some(p=>quoteTiming(p,t,commit)==="afterFreezeWithin30m"))timing.afterFreezeWithin30m++;else timing.laterPrematch++;}
   const k=key(q),v=groups.get(k)||[];v.push({at:t,commit,start:dt(q.commenceTime),p:q.higher,books:q.books,bookPrices:q.bookHigherPrivate});groups.set(k,v);
  }
 }
 const close={pairedNativeLines:0,nearStartPairs:0,earlierPairs:0,meanAbsoluteProbabilityMove:null,sameBookPairs:0,sameBookNearStartPairs:0,meanAbsoluteSameBookProbabilityMove:null};let moves=0,sameBookMoves=0;
 for(const a of groups.values()){
  const v=a.filter(x=>x.at<x.start&&x.commit<x.start&&x.at<=x.commit+1000).sort((x,y)=>x.at-y.at);if(v.length<2||v[0].at===v.at(-1).at)continue;
  const first=v[0],last=v.at(-1);close.pairedNativeLines++;moves+=Math.abs(last.p-first.p);
  if(last.start-last.at<=1800000&&last.start-last.at>=0)close.nearStartPairs++;else close.earlierPairs++;
  const common=Object.keys(first.bookPrices||{}).filter(k=>Number.isFinite(first.bookPrices[k])&&Number.isFinite(last.bookPrices?.[k]));if(common.length>=2&&first.start===last.start){const p=common.reduce((s,k)=>s+first.bookPrices[k],0)/common.length,q=common.reduce((s,k)=>s+last.bookPrices[k],0)/common.length;close.sameBookPairs++;sameBookMoves+=Math.abs(q-p);if(last.start-last.at<=1800000)close.sameBookNearStartPairs++;}
 }
 close.meanAbsoluteProbabilityMove=close.pairedNativeLines?moves/close.pairedNativeLines:null;
 close.meanAbsoluteSameBookProbabilityMove=close.sameBookPairs?sameBookMoves/close.sameBookPairs:null;
 return {kind:"sportsbook_exact_threshold_match_funnel_and_native_price_movement_v1",archives:seen.size,bySport:counts,timing,captureSkewBuckets,close,authenticatedClosingLine:false,sharedPlayerIdVerified:false,newPaidRequests:0,modelPromoted:false};
}
module.exports={audit,quoteTiming,validTimingForComparison};