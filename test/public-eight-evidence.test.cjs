"use strict";
const t=require("node:test"),a=require("node:assert/strict"),{intake}=require("../scripts/public-eight-evidence.cjs");
const offer={title:"CS2",platform:"PrizePicks",offerId:"fixture",playerId:"p",teamId:"t1",opponentId:"t2",seriesId:"s",market:"kills",tier:"Standard",maps:[1,2],line:22.5,sides:["Higher","Lower"],ruleset:"test",ruleVersion:"test",sourceId:"fixture",sourceUrl:"https://www.prizepicks.com/example",capturedAt:"2026-01-01T00:00:00Z",seriesStartAt:"2026-01-01T03:00:00Z",identityVerified:true,scopeVerified:true,originalPlatformOfferVerified:true,authorizedExportVerified:true};
t("esports intake rejects references, late Git capture, duplicate exports, and missing entitlement",()=>{
 const first="2026-01-01T00:01:00Z";
 const x=intake([offer,offer,{...offer,offerId:"r",sourceUrl:"https://example.test/x"},{...offer,offerId:"u",authorizedExportVerified:false}],first);
 a.equal(x.accepted,1);a.equal(x.excluded,3);a.equal(x.counts.CS2.PrizePicks,1);
 a.equal(intake([offer],"2026-01-01T04:00:00Z").accepted,0);
});
