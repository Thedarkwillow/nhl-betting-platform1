"use strict";
const {review:slateReferenceReview}=require("./nhl-lineup-slate-resampling.cjs"),{audit}=require("./nhl-lineup-format-grading.cjs"),{STANDARD}=require("./prizepicks-payouts.cjs"),{pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const dt=Date.parse;
function paper(frames,history,schedule,policyAt){
 const formats=Object.fromEntries(["power","flex"].flatMap(f=>Array.from({length:f==="power"?5:4},(_,i)=>{const n=i+(f==="power"?2:3);return [f+"_"+n,{format:f,n,registered:0,decided:0,pending:0,voidOrMissing:0,gross:0,pairedEntries:0,pairedSamples:[],pairedModelGross:0,alwaysHigherGross:0,alwaysLowerGross:0,fairCoinExpectedGross:0,slates:0,allCorrect:0,hitCounts:Array(n+1).fill(0)}];})));
 const seen=new Set(),allSlates=new Set(),resolvedSlates=new Set(),skipped={};const skip=k=>skipped[k]=(skipped[k]||0)+1;
 if(!Number.isFinite(dt(policyAt)))return {formats,skipped,policyAt:null,approved:false};
 // Fixed earliest valid slate/format before inspecting results; do not swap
 // a pending or voided entry for a later one that happened to resolve.
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  if(dt(f.firstCommittedAt)<=dt(policyAt))continue;
  const snap=f.snapshot,formatted=snap?.privateFormatLineupResearch;if(!formatted)continue;
  for(const [k,b] of Object.entries(formats)){
   const l=formatted[b.format]?.[b.n];if(!l)continue;const dates=new Set((l.picks||[]).map(p=>pacificDay(p.gameStartAt)));
   if(dates.size!==1||dates.has(null)){skip("mixed_or_unknown_slate");continue;}
   const slate=[...dates][0],id=k+"|"+slate;if(seen.has(id))continue;
   const partial={...snap,privateFormatLineupResearch:{...formatted,power:b.format==="power"?{[b.n]:l}:{},flex:b.format==="flex"?{[b.n]:l}:{}}};
   const res=audit([{...f,snapshot:partial}],history,schedule,{firstPolicyCommit:policyAt}),g=res.groups[k];if(!g||g.registered!==1){skip("unverified_original_entry");continue;}
   seen.add(id);allSlates.add(slate);b.registered++;b.slates++;
   if(g.decided!==1){if(g.pending)b.pending++;else b.voidOrMissing++;continue;}
   const r=res.resolvedScenarioObservations[0];if(!r||!Number.isInteger(r.hits)){b.voidOrMissing++;continue;}
   b.decided++;resolvedSlates.add(slate);b.hitCounts[r.hits]++;b.allCorrect+=Number(r.hits===b.n);b.gross+=STANDARD[b.format][b.n][r.hits]||0;
   const legs=l.picks.map(p=>{const g=(history.players[String(p.playerId)]?.games||[]).filter(x=>x.gameId===p.gameId&&x.playerId===p.playerId&&["FINAL","OFF"].includes(x.gameState));return g.length===1&&Number.isInteger(g[0][p.market])&&g[0][p.market]!==p.line?Number(g[0][p.market]>p.line):null;});
   if(legs.every(x=>x!==null)){const h=legs.reduce((a,x)=>a+x,0),table=STANDARD[b.format][b.n];b.pairedEntries++;b.pairedModelGross+=table[r.hits]||0;b.alwaysHigherGross+=table[h]||0;b.alwaysLowerGross+=table[b.n-h]||0;b.fairCoinExpectedGross+=require("./nhl-lineup-format-scenario.cjs").scenario(Array(b.n).fill(.5),b.format).hypotheticalGrossWeight;
    b.pairedSamples.push({slate,modelGross:table[r.hits]||0,higherGross:table[h]||0,lowerGross:table[b.n-h]||0});}
  }
 }
 for(const b of Object.values(formats)){b.hypotheticalNetUnits=b.decided?b.gross-b.decided:null;b.hypotheticalReferenceROI=b.decided?b.gross/b.decided-1:null;b.actualROI=null;b.independentSlateReview={minimumResolvedSlates:50,resolvedSlates:b.decided,remainingToMinimum:Math.max(0,50-b.decided),minimumMet:b.decided>=50,correlationValidated:false,payoutVerified:false,approval:false};b.baselineComparison={pairedEntries:b.pairedEntries,pairedModelReferenceROI:b.pairedEntries?b.pairedModelGross/b.pairedEntries-1:null,modelMinusAlwaysHigher:b.pairedEntries?(b.pairedModelGross-b.alwaysHigherGross)/b.pairedEntries:null,modelMinusAlwaysLower:b.pairedEntries?(b.pairedModelGross-b.alwaysLowerGross)/b.pairedEntries:null,modelMinusFairCoin:b.pairedEntries?(b.pairedModelGross-b.fairCoinExpectedGross)/b.pairedEntries:null,alwaysHigherReferenceROI:b.pairedEntries?b.alwaysHigherGross/b.pairedEntries-1:null,alwaysLowerReferenceROI:b.pairedEntries?b.alwaysLowerGross/b.pairedEntries-1:null,fairCoinIndependentExpectedROI:b.pairedEntries?b.fairCoinExpectedGross/b.pairedEntries-1:null,counterfactualSidesNotVerifiedOffered:true,notCashROI:true};}
 for(const b of Object.values(formats)){
  b.pairedSlateUncertainty=slateReferenceReview(b.pairedSamples);
  delete b.pairedSamples; // Public aggregation must never become a raw lineup list.
 }
 return {kind:"nine_format_first_registered_reference_paper_v2",formats,skipped,policyAt,
  uniqueCalendarSlatesRegisteredAcrossFormats:allSlates.size,
  uniqueCalendarSlatesResolvedAcrossFormats:resolvedSlates.size,
  noteDistinctSlatesDoNotProveIndependence:true,referencePayoutOnly:true,oneFirstRegisteredEntryPerSlateFormat:true,voidsAndPendingNotReplaced:true,overlappingFormatsNotIndependent:true,approved:false,realWagers:0,verifiedPayout:false};
}
module.exports={paper};
