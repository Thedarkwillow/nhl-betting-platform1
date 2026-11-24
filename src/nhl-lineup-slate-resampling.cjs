"use strict";
/* Research-only uncertainty for one FIRST registered paper scenario per slate.
 * Different Power/Flex formats can share picks/slates; never treat them as
 * nine independent bankrolls or a verified platform payout.
 */
const finite=Number.isFinite;
function review(samples,{replicates=1800}={}){
 const fail=why=>({status:why,pairedDistinctSlates:0,
  modelMinusAlwaysLowerReferenceGross:null,modelMinusAlwaysHigherReferenceGross:null,
  modelVsLowerSlateBootstrap95:null,formatApproval:false,verifiedPayoutROI:null,
  independentLineupProbability:null});
 if(!Array.isArray(samples)||!Number.isInteger(replicates)||
    replicates<100||replicates>10000)return fail("invalid_reference_slate_data");
 const seen=new Set();const clean=[];
 for(const row of samples){
  if(typeof row?.slate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.slate)||
    seen.has(row.slate)||![row.modelGross,row.higherGross,row.lowerGross].every(v=>
      finite(v)&&v>=0&&v<=100))
   return fail("duplicate_or_unverified_paired_slate");
  seen.add(row.slate);clean.push(row);
 }
 if(!clean.length)return fail("no_resolved_original_paper_slate");
 const n=clean.length,mean=f=>clean.reduce((s,r)=>s+f(r),0)/n;
 const lower=mean(r=>r.modelGross-r.lowerGross);
 const higher=mean(r=>r.modelGross-r.higherGross);
 let ci=null;
 if(n>=10){
  let seed=0x8d1252b7;const diffs=[];
  for(let i=0;i<replicates;i++){
   let draw=0;
   for(let j=0;j<n;j++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const x=clean[Math.floor(seed/4294967296*n)];
    draw+=x.modelGross-x.lowerGross;
   }
   diffs.push(draw/n);
  }
  diffs.sort((a,b)=>a-b);
  ci={lower:diffs[Math.floor(.025*(replicates-1))],
   upper:diffs[Math.ceil(.975*(replicates-1))],
   units:"reference_gross_units_per_first_registered_slate",
   direction:"original_model_minus_always_lower",
   respectsOneOriginalEntryPerSlate:true,
   replicates};
 }
 return {status:"paired_slate_reference_only",pairedDistinctSlates:n,
  modelMinusAlwaysLowerReferenceGross:lower,
  modelMinusAlwaysHigherReferenceGross:higher,
  modelVsLowerSlateBootstrap95:ci,
  sampleGateMet:n>=50,
  gameCorrelationAcrossSlatesNotProvenIndependent:true,
  modelBetterThanAlwaysLowerProspectivelyProven:false,
  baselineOppositeOfferAuthenticated:false,
  confirmedPlatformPayoutTerms:false,
  formatApproval:false,verifiedPayoutROI:null,
  independentLineupProbability:null};
}
module.exports={review};
