"use strict";
// Internal comparison contract only. Both sources must be normalized independently.
// Never compare fantasy scoring, multipliers or offer types from a market label alone.
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function compare(prizePicks,underdog,now){
 const at=dt(now),key=r=>JSON.stringify([r.league,r.gameId,r.playerId,r.market,r.period,r.tier,r.side,r.marketScoringFingerprint]);
 const group=(rows,expectedPlatform)=>{const m=new Map();for(const r of rows||[]){
  if(r?.platform!==expectedPlatform||!String(r.sourceOfferId??"").trim()||
    !String(r.marketScoringFingerprint??"").trim()||
    !["NHL","NFL"].includes(r?.league)||r.identityMethod!=="independent_roster_and_schedule"||!r.gameId||!r.playerId||typeof r.market!=="string"||!r.market||r.period!=="full_game"||r.tier!=="Standard"||!["higher","lower"].includes(r.side)||!Number.isFinite(r.line)||r.available!==true||!Number.isFinite(dt(r.observedAt))||dt(r.observedAt)>at||at-dt(r.observedAt)>1800000||!(dt(r.eventStartsAt)>at)||r.marketContractVerified!==true)continue;
  const a=m.get(key(r))||[];a.push(r);m.set(key(r),a);
 }return m;};
 if(!Number.isFinite(at))return {matched:0,sameThreshold:0,ambiguous:0,comparisons:[],researchOnly:true,productionEligible:false};
 const pp=group(prizePicks,"PrizePicks"),ud=group(underdog,"Underdog"),comparisons=[];let ambiguous=0;
 for(const [k,a] of pp){const b=ud.get(k);if(!b)continue;
  if(a.length!==1||b.length!==1){ambiguous++;continue;}const [p]=a,[u]=b;
  if(Math.abs(dt(p.eventStartsAt)-dt(u.eventStartsAt))>300000||Math.abs(dt(p.observedAt)-dt(u.observedAt))>1800000)continue;
  comparisons.push({league:p.league,gameId:p.gameId,playerId:p.playerId,market:p.market,period:p.period,tier:"Standard",side:p.side,prizePicksLine:p.line,underdogLine:u.line,sameThreshold:p.line===u.line,observedClockSkewSeconds:Math.abs(dt(p.observedAt)-dt(u.observedAt))/1000,originalAppQuoteAuthenticated:false,authenticatedPayoutTerms:false,payoutComparable:false,platformAvailabilityVerified:false,researchOnly:true});
 }
 return {matched:comparisons.length,sameThreshold:comparisons.filter(x=>x.sameThreshold).length,ambiguous,comparisons,researchOnly:true,productionEligible:false,rawPublicationAllowed:false};
}
module.exports={compare};
