"use strict";
// Offline audit of previously archived provider candidate evidence. No vendor calls,
// no raw offer logging, no invented availability, no production eligibility.
const fs=require("node:fs"),path=require("node:path");
const {modelCoverage}=require("../src/underdog-private-research-intake.cjs");
function conflictingNormalizedPlayerCrosswalk(candidates){
 const bySource=new Map(),byRoster=new Map();
 for(const row of candidates){
  const source=String(row.sourcePlayerId??""),roster=String(row.playerId??"");
  if(!source||!roster)return true;
  if(bySource.has(source)&&bySource.get(source)!==roster||
     byRoster.has(roster)&&byRoster.get(roster)!==source)return true;
  bySource.set(source,roster);byRoster.set(roster,source);
 }
 return false;
}
function audit(docs){
 const report={NHL:{archives:0,samples:0,candidateSides:0,modelFamilySides:0,priorRosterCandidates:0,unresolvedMarketRows:0},NFL:{archives:0,samples:0,candidateSides:0,modelFamilySides:0,priorRosterCandidates:0,unresolvedMarketRows:0}};
 const seen=new Set();let rejected=0;
 for(const d of docs){
  const r=d?.report,s=report[d?.league];if(!s||d.kind!=="private_underdog_bounded_candidate_observation_v1"||d.completeBoardVerified!==false||d.productionEligible!==false||d.publicRedistribution!==false||r?.league!==d.league||!Number.isFinite(Date.parse(d.generatedAt))||r.generatedAt!==d.generatedAt||!Number.isInteger(r.returned)||r.returned<1||r.returned>5||!Array.isArray(d.candidates)||d.candidates.length>2*r.returned||d.candidates.some(x=>x.league!==d.league||x.productionEligible!==false||x.researchOnly!==true||x.marketContractVerified!==false)||conflictingNormalizedPlayerCrosswalk(d.candidates)||seen.has(d.league+"|"+d.generatedAt)){rejected++;continue;}
  const c=modelCoverage(d.candidates);if(c.candidateSides!==d.candidates.length||c.candidateSides!==r.modelCoverage?.candidateSides||c.existingMarketResearchCandidates!==r.modelCoverage?.existingMarketResearchCandidates){rejected++;continue;}
  seen.add(d.league+"|"+d.generatedAt);s.archives++;s.samples+=r.returned;s.candidateSides+=c.candidateSides;s.modelFamilySides+=c.existingMarketResearchCandidates;
  const n=r.identityMarketResearch?.priorRosterCandidates;if(Number.isInteger(n)&&n>=0&&n<=r.returned)s.priorRosterCandidates+=n;
  const u=r.identityMarketResearch?.rejectionCounts?.unrecognized_exact_market_period;if(Number.isInteger(u)&&u>=0&&u<=r.returned)s.unresolvedMarketRows+=u;
 }
 return {kind:"private_underdog_offline_candidate_archive_audit_v1",bySport:report,rejectedArchives:rejected,unknownRejectedRawRowsWereNotArchived:true,countsAreObservationsNotDistinctOffers:true,paidRequests:0,publicRows:0,productionEligible:false};
}
if(require.main===module){const dir=path.resolve(process.env.RESEARCH_ARCHIVE_ROOT||path.resolve(__dirname,".."),"outputs/research/underdog-bounded-candidates");const files=fs.readdirSync(dir).filter(n=>/^\d{8}T\d{9}Z-(NHL|NFL)\.json$/.test(n));const out=audit(files.map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8"))));if(!out.bySport.NHL.archives||!out.bySport.NFL.archives||out.rejectedArchives)throw Error("Archived evidence incomplete");console.log(JSON.stringify(out));}
module.exports={audit,conflictingNormalizedPlayerCrosswalk};
