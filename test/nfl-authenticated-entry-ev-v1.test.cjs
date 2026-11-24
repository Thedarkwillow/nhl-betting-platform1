"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {estimate}=require("../src/nfl-authenticated-entry-ev-v1.cjs");
const asOf="2026-11-22T14:50:00Z";
const ids=["kc-rice-original-48.5-higher","ten-pollard-original-3.5-lower"];
const picks=ids.map((id,i)=>({
 originalSelectionKey:id,eventStartsAt:"2026-11-22T18:00:00Z",
 gameDayActive:{gameDayActiveVerified:true},
 authenticatedPlatformQuote:{authenticatedExactOriginalAppOffer:true,platform:"PrizePicks"},
 prospectiveCalibration:{verified:true}
}));
const quote={kind:"nfl_signed_app_entry_specific_payout_quote_v1",platform:"PrizePicks",
 entryType:"power",pickCount:2,observedAt:"2026-11-22T14:48:00Z",
 signedOrAuthenticatedReceiptVerified:true,verifiedByIndependentAppAccess:true,
 receiptId:"verified-quote1",includesNoPromosOrPromoTermsVerifiablyInPayout:true,
 originalSelectionKeys:ids,grossMultipliersByHitCount:[0,0,3],entryFee:10};
const joint={kind:"nfl_original_line_calibrated_joint_hit_count_v1",
 validatedOnUntouchedFutureCohorts:true,independentCorrelationsVerified:true,
 marketSettlementRulesVersionVerified:true,allLegsHalfPointWithoutPushes:true,
 originalSelectionKeys:ids,frozenAt:"2026-11-22T14:45:00Z",
 probabilityByHitCount:[.2,.3,.5]};
test("reject missing signed platform quote and joint correlation distribution",()=>{
 assert.equal(estimate(picks,null,null,asOf).verified,false);
 assert.equal(estimate(picks,quote,null,asOf).netEVPerUnit,null);
});
test("reject model-only 20-game empirical rates without future calibration",()=>{
 const invalid=picks.map(x=>({...x,prospectiveCalibration:{verified:false}}));
 assert.equal(estimate(invalid,quote,joint,asOf).netEVPerUnit,null);
});
test("reject quote for another tier, side, line or nonmatching selection ID",()=>{
 assert.equal(estimate(picks,{...quote,originalSelectionKeys:[ids[0],"other-line"]},joint,asOf).verified,false);
});
test("reject independence-produced unvalidated joint and wrong score probability sum",()=>{
 assert.equal(estimate(picks,quote,{...joint,independentCorrelationsVerified:false},asOf).verified,false);
 assert.equal(estimate(picks,quote,{...joint,probabilityByHitCount:[.2,.3,.6]},asOf).verified,false);
});
test("reject postgame and stale payout quote before assuming EV",()=>{
 assert.equal(estimate(picks,{...quote,observedAt:"2026-11-22T14:52:00Z"},joint,asOf).verified,false);
 assert.equal(estimate(picks,{...quote,observedAt:"2026-11-22T14:40:00Z"},joint,asOf).verified,false);
});
test("only synthetic fully proven joint and payout computes 0.5 gross*3-1=+0.5",()=>{
 const r=estimate(picks,quote,joint,asOf);
 assert.equal(r.verified,true);
 assert.equal(r.netEVPerUnit,.5);
 assert.equal(r.positiveEVVerified,true);
 assert.equal(r.automaticWagerAllowed,false);
});
test("negative EV is still calculated and not relabeled positive",()=>{
 const r=estimate(picks,quote,{...joint,probabilityByHitCount:[.5,.3,.2]},asOf);
 assert.equal(r.verified,true);
 assert.equal(r.netEVPerUnit,-.4);
 assert.equal(r.positiveEVVerified,false);
});
