"use strict";
// Frozen original research scenarios only. Published standard table is a
// uniform hypothetical reference, not an actual quoted or settled payout.
const {STANDARD}=require("./prizepicks-payouts.cjs");
function study(rows){
 const seen=new Set(),groups={},excluded={};const skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const r of [...(rows||[])].sort((a,b)=>Date.parse(a.frozenAt)-Date.parse(b.frozenAt))){
  const m=/^(power|flex)_([2-6])$/.exec(r?.formatSize||"");
  if(!m||m[1]==="flex"&&m[2]==="2"||typeof r.id!=="string"||!r.id||!Number.isFinite(Date.parse(r.frozenAt))||!/^\d{4}-\d{2}-\d{2}$/.test(r.slate||"")||!Number.isInteger(r.hits)||r.hits<0||r.hits>Number(m[2])){skip("invalid_or_unsupported");continue;}
  const key=r.formatSize+"|"+r.slate;
  if(seen.has(key)){skip("overlapping_slate_format");continue;}seen.add(key);
  const rate=STANDARD[m[1]][Number(m[2])]?.[r.hits]??0,g=groups[r.formatSize]??={entries:0,referenceGrossUnits:0,allHits:0};
  g.entries++;g.referenceGrossUnits+=rate;g.allHits+=Number(r.hits===Number(m[2]));
 }
 return {kind:"standard_reference_paper_simulation_v1",source:"https://www.prizepicks.com/help-center/payouts",byFormat:Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{...g,referenceCostUnits:g.entries,referenceNetUnits:g.referenceGrossUnits-g.entries,referenceROI:g.referenceGrossUnits/g.entries-1}])),excluded,onePerSlateFormat:true,pushVoidExcludedByUpstreamAudit:true,actualQuotedPayout:false,authenticatedPaperROI:null,verifiedCashROI:null,modelPromoted:false};
}
module.exports={study};
