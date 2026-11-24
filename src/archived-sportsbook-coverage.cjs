"use strict";
// Historical archive coverage audit, no requests or live availability claim.
const {compare}=require("./archived-prop-market-benchmark.cjs");
const {study}=require("./bounded-sportsbook-consensus.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function audit(archives,frames){
 const distinct=new Set(),matched=new Set(),fresh=new Set(),bySport={NHL:{native:0,conditional:0,matched30:0},NFL:{native:0,conditional:0,matched30:0}};
 let accepted=0,rejected=0,ambiguous=0,raw=0;
 for(const entry of archives||[]){
  const a=entry.archive,stamp=dt(a?.generatedAt),commit=dt(entry.firstCommittedAt);
  if(entry.gitHistoryCount!==1||!Number.isFinite(stamp)||!Number.isFinite(commit)||Math.floor(stamp/1000)>Math.floor(commit/1000)||commit-stamp>=15*60000||distinct.has(a.generatedAt)){rejected++;continue;}
  distinct.add(a.generatedAt);accepted++;
  const native=study(a,{now:a.generatedAt});raw+=Array.isArray(a.rows)?a.rows.length:0;
  for(const q of native.groups)if(bySport[q.sport])bySport[q.sport].native++;
  const result=compare(a,frames);ambiguous+=result.ambiguous;
  for(const p of result.matches){
   const k=JSON.stringify([p.sport,p.gameId,p.playerId,p.market,p.line,p.tier,p.side]);
   if(!matched.has(k)){matched.add(k);bySport[p.sport].conditional++;}
   if(p.comparisonClass==="within_30_minutes"&&!fresh.has(k)){fresh.add(k);bySport[p.sport].matched30++;}
  }
 }
 return {kind:"immutable_sportsbook_archive_coverage_v1",acceptedArchives:accepted,rejectedArchives:rejected,archivedBookPairs:raw,uniqueConditionalPropSides:matched.size,uniqueWithin30Minutes:fresh.size,ambiguousNameMatches:ambiguous,bySport,sharedProviderIdentityVerified:false,liveAvailabilityVerified:false,newProviderRequests:0,modelPromoted:false};
}
module.exports={audit};
