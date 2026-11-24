"use strict";
/** Public evidence labels, separated by what was actually verified. */
const LABELS=Object.freeze({
 modelEstimate:"Estimated model probability — calibration not verified",
 independentQuote:"Observed independent provider quote — not authenticated in original app",
 retrospective:"Retrospectively reconstructed — not a prospective hit rate",
 frozenPregame:"Originally saved pregame research direction — prior to NHL event",
 officialStats:"Official NHL game statistics — NOT original fantasy settlement",
 platformSettlement:"Original platform settlement UNVERIFIED",
 tier:"Provider-indicated tier only; authentic original tier and multiplier UNVERIFIED",
 payouts:"Exact selected-line multiplier and expected value UNVERIFIED"
});
const RESPONSIBLE=Object.freeze({
 purpose:"Educational statistical research only. No wagers placed.",
 risk:"Sports betting involves financial risk. No outcome is guaranteed.",
 limits:"Set personal financial and time limits before using any external platform.",
 controls:"If research becomes stressful or compulsive, stop using the site and seek local support.",
 noPressure:true,noBettingActionOnSite:true,noAutoplacement:true,
 noWinGuarantees:true,originalPlatformAvailabilityVerified:false,
 originalPlatformSettlementVerified:false
});
function publicEvidenceLabels(){
 return {kind:"public_nhl_evidence_categories_v1",
  modelEstimate:LABELS.modelEstimate,independentQuote:LABELS.independentQuote,
  retrospective:LABELS.retrospective,frozenPregame:LABELS.frozenPregame,
  officialStats:LABELS.officialStats,platformSettlement:LABELS.platformSettlement,
  tier:LABELS.tier,payouts:LABELS.payouts};
}
function publicResponsibleResearch(){
 return {kind:"public_responsible_research_v1",...RESPONSIBLE};
}
module.exports={LABELS,RESPONSIBLE,publicEvidenceLabels,publicResponsibleResearch};
