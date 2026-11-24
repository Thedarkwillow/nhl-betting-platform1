"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {evaluate}=require("../src/goblin-quoted-lineup-research.cjs");
const now="2026-11-18T14:15:00Z",startsAt="2026-11-19T23:00:00Z";
const legs=[{id:"goblinNHL",tier:"Goblin",side:"Higher",startsAt,
 verifiedOriginalSide:true,eligibleInPlatformApp:true},
 {id:"standardNFL",tier:"Standard",side:"Lower",startsAt,
 verifiedOriginalSide:true,eligibleInPlatformApp:true}];
const quote={kind:"exact_prizepicks_entry_details_v1",
 provider:"PrizePicks",firstPartyEntryDetailsVerified:true,
 goblinSpecificMultiplierVerified:true,originalSideEligibilityVerified:true,
 format:"Power",pickCount:2,legIds:legs.map(x=>x.id),
 verifiedAt:"2026-11-18T14:12:00Z",
 quotedPayoutByHits:{"0":0,"1":0,"2":2.2},
 sourceIsStandardReferenceTable:false,feeAndBonusTermsVerified:true,
 sameGameOrRelatedPickRestrictionsVerified:true,promotionEligibilityVerified:true};
const correlation={kind:"validated_joint_hit_count_distribution",
 independentProspectiveTestPassed:true,matchesExactLineupAndQuote:true,
 probabilityByHits:[.08,.25,.67]};
t("Goblin 2-Power needs an exact verified nonstandard multiplier and distribution",()=>{
 const x=evaluate({legs,entryQuote:quote,correlation,now});
 a.equal(x.status,"research_scenario_only");
 a.equal(x.format,"Power");a.equal(x.goblinCount,1);
 a.equal(x.estimatedNetEV,.67*2.2-1);
 a.equal(x.verifiedActualPayoutEV,false);
 a.equal(x.bettingEligible,false);a.equal(x.placedWagers,0);
});
t("Goblin Flex formats 2–6 require exact entry-specific settlement table",()=>{
 for(let n=2;n<=6;n++){
  const ls=Array.from({length:n},(_,i)=>({...legs[i%2],id:"leg"+i}));
  const payouts=Object.fromEntries(Array.from({length:n+1},(_,k)=>[k,k===n?1.5:k===n-1?.4:0]));
  const corr={...correlation,probabilityByHits:Array(n+1).fill(1/(n+1))};
  const q={...quote,format:"Flex",pickCount:n,
   legIds:ls.map(x=>x.id),quotedPayoutByHits:payouts};
  const x=evaluate({legs:ls,entryQuote:q,correlation:corr,now});
  a.equal(x.status,"research_scenario_only","size="+n);
  a.equal(x.eligibleForLineupResearch,true);
  a.equal(x.recommendationsReleased,0);
 }
});
t("missing quote, standard payout reference, ineligible Goblin and bad correlations block EV",()=>{
 for(const opts of [
  {entryQuote:null},{entryQuote:{...quote,sourceIsStandardReferenceTable:true}},
  {entryQuote:{...quote,verifiedAt:"2026-11-18T12:00:00Z"}},
  {entryQuote:{...quote,quotedPayoutByHits:{"0":0,"2":2.2}}},
  {entryQuote:{...quote,legIds:["goblinNHL","wrong"]}},
  {entryQuote:{...quote,goblinSpecificMultiplierVerified:false}},
  {legs:[{...legs[0],eligibleInPlatformApp:false},legs[1]]},
  {correlation:{...correlation,independentProspectiveTestPassed:false}},
  {correlation:{...correlation,probabilityByHits:[.3,.3,.3]}}
 ]){
  const x=evaluate({legs,entryQuote:quote,correlation,now,...opts});
  a.equal(x.status,"blocked",JSON.stringify(opts));
  a.equal(x.estimatedNetEV,null);
  a.equal(x.recommendationsReleased,0);
 }
});
