"use strict";
/**
 * No per-leg "EV" for power/flex payouts. An entry must have an authenticated
 * platform-specific P/O-Flex payout quote and a JOINT calibrated hit-count law
 * for exactly those original legs, with correlation and void/push handled.
 * No independence multiplication and no invented generic payout multipliers.
 */
const KIND="nfl_quoted_correlated_payout_ev_v1";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const num=x=>typeof x==="number"&&Number.isFinite(x);
const fail=reason=>({kind:KIND,verified:false,reason,
  netEVPerUnit:null,expectedGrossMultiplier:null,positiveEVVerified:false,
  payoutQuoteVerified:false,jointModelValidated:false,automaticWagerAllowed:false});
const sameArr=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
  [...a].sort().every((x,i)=>x===[...b].sort()[i]);
function estimate(picks,quote,joint,asOf){
 if(!Array.isArray(picks)||picks.length<2||picks.length>6||
  !Number.isFinite(at(asOf))||
  picks.some(p=>!p||typeof p.originalSelectionKey!=="string"||
   p.gameDayActive?.gameDayActiveVerified!==true||
   p.authenticatedPlatformQuote?.authenticatedExactOriginalAppOffer!==true||
   p.prospectiveCalibration?.verified!==true||
   !Number.isFinite(at(p.eventStartsAt))||at(p.eventStartsAt)-at(asOf)<15*60000)||
  new Set(picks.map(p=>p.originalSelectionKey)).size!==picks.length)
  return fail("original_market_roster_line_or_calibration_not_fully_verified");
 const ids=picks.map(p=>p.originalSelectionKey);
 if(quote?.kind!=="nfl_signed_app_entry_specific_payout_quote_v1"||
  !["PrizePicks","Underdog"].includes(quote.platform)||
  !["power","flex","standard"].includes(quote.entryType)||
  quote.pickCount!==picks.length||quote.platform==="Underdog"&&
    quote.entryType==="flex"&&quote.pickCount<3||
  quote.signedOrAuthenticatedReceiptVerified!==true||
  quote.verifiedByIndependentAppAccess!==true||
  typeof quote.receiptId!=="string"||quote.receiptId.length<8||
  quote.includesNoPromosOrPromoTermsVerifiablyInPayout!==true||
  !Number.isFinite(at(quote.observedAt))||at(quote.observedAt)>at(asOf)||
  at(asOf)-at(quote.observedAt)>5*60000||
  !sameArr(ids,quote.originalSelectionKeys)||
  picks.some(p=>p.authenticatedPlatformQuote.platform!==quote.platform))
  return fail("missing_signed_exact_entry_quote_and_terms");
 if(joint?.kind!=="nfl_original_line_calibrated_joint_hit_count_v1"||
  joint.validatedOnUntouchedFutureCohorts!==true||
  joint.independentCorrelationsVerified!==true||
  joint.marketSettlementRulesVersionVerified!==true||
  joint.allLegsHalfPointWithoutPushes!==true||
  !sameArr(ids,joint.originalSelectionKeys)||
  !Number.isFinite(at(joint.frozenAt))||at(joint.frozenAt)>at(asOf)||
  !Array.isArray(joint.probabilityByHitCount)||joint.probabilityByHitCount.length!==picks.length+1||
  joint.probabilityByHitCount.some(v=>!num(v)||v<0||v>1)||
  Math.abs(joint.probabilityByHitCount.reduce((x,y)=>x+y,0)-1)>1e-6)
  return fail("joint_hit_distribution_unvalidated_or_not_original");
 const m=quote.grossMultipliersByHitCount;
 if(!Array.isArray(m)||m.length!==picks.length+1||
  m.some(v=>!num(v)||v<0)||!num(quote.entryFee)||quote.entryFee<=0)
  return fail("authenticated_win_count_payout_table_missing");
 const expectedGross=joint.probabilityByHitCount.reduce((s,p,i)=>s+p*m[i],0);
 const ev=expectedGross-1;
 return {kind:KIND,verified:true,reason:null,
  platform:quote.platform,entryType:quote.entryType,pickCount:picks.length,
  expectedGrossMultiplier:Number(expectedGross.toFixed(6)),
  netEVPerUnit:Number(ev.toFixed(6)),positiveEVVerified:ev>0,
  quotedPayoutReceiptId:quote.receiptId,
  quoteTime:quote.observedAt,jointFrozenAt:joint.frozenAt,
  payoutQuoteVerified:true,jointModelValidated:true,
  sourceOnlyEstimateNotGuarantee:true,automaticWagerAllowed:false};
}
module.exports={KIND,estimate};
