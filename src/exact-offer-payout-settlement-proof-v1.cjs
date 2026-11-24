"use strict";
/**
 * Three completely separate evidence requirements:
 * 1. Original first-Git direction/line  2. independently authenticated
 * platform entry quote and payout  3. authenticated finalized settlement.
 * Official box scores, provider boards and public help pages are NOT (2)/(3).
 * No imported provider keys, account data or wagers are required.
 */
const KIND="private_exact_offer_payout_settlement_proof_v1";
const PLATFORMS=new Set(["PrizePicks","Underdog"]);
const entryType=Object.freeze({PrizePicks:new Set(["power","flex"]),
 Underdog:new Set(["standard","flex"])});
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const n=x=>typeof x==="number"&&Number.isFinite(x);
const same=(a,b)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();
const METHODS=new Set(["verified_app_export","authenticated_platform_receipt"]);
// Sport-specific identity types must not silently exclude real NFL GSIS IDs or
// accept loosely matched player names instead of an exact game and person key.
function identityValid(o){
 if(!o)return false;
 if(o.sport==="NFL")
  return /^20\d{2}_(?:[1-9]|1[0-9]|2[0-2])_[A-Z]{2,3}_[A-Z]{2,3}$/.test(o.gameId||"")&&
   /^00-\d{7}$/.test(o.playerId||"");
 if(o.sport==="NBA")
  return (Number.isInteger(o.gameId)||/^00\d{8}$/.test(o.gameId||""))&&
   Number.isInteger(o.playerId)&&o.playerId>0;
 // NHL and MLB currently use exact official numeric IDs. Unsupported esports
 // native identity is not guessed from display names or third-party offer IDs.
 return Number.isInteger(o.gameId)&&o.gameId>0&&
  Number.isInteger(o.playerId)&&o.playerId>0;
}
function fail(reason){
 return {kind:KIND,verified:false,reason,originalAppOfferVerified:false,
  entrySpecificPayoutVerified:false,platformSettlementVerified:false,
  payoutAdjustedExpectedValue:null,automaticWagersAuthorized:false};
}
function originalValid(o){
 return !!o&&PLATFORMS.has(o.platform)&&["NHL","NFL","NBA","MLB","Esports"].includes(o.sport)&&
  typeof o.period==="string"&&!!o.period&&!!o.originalSourceOfferId&&
  !!o.originalModelSelectionId&&identityValid(o)&&
  !!o.market&&!!o.team&&!!o.opponent&&
  ["Higher","Lower"].includes(o.originalSide)&&
  ["Standard","Goblin","Demon"].includes(o.tier)&&n(o.line)&&o.line>=0&&
  [at(o.capturedAt),at(o.firstGitCommittedAt),at(o.gameStartAt)].every(Number.isFinite)&&
  at(o.capturedAt)<=at(o.firstGitCommittedAt)&&
  at(o.firstGitCommittedAt)<=at(o.gameStartAt)-900000;
}
function authentic(e){
 return !!e&&METHODS.has(e.verificationMethod)&&
  e.verifiedByIndependentAppAccess===true&&e.signedOrAuthenticatedReceiptVerified===true&&
  typeof e.receiptId==="string"&&e.receiptId.length>=8;
}
function exactOffer(original,app){
 if(!originalValid(original))return fail("invalid_original_pregame_line_or_git_timing");
 if(!authentic(app)||app.originalSourceOfferId!==original.originalSourceOfferId)
  return fail("no_independently_authenticated_original_platform_offer");
 const keys=["platform","sport","gameId","playerId","team","opponent","market",
  "period","tier","line"];
 for(const k of keys){
  if(!same(original[k],app[k]))
   return fail("exact_player_game_market_period_tier_line_mismatch");
 }
 if(!Array.isArray(app.availableSides)||!app.availableSides.includes(original.originalSide))
  return fail("original_side_not_proven_available_in_app");
 const observed=at(app.observedAt),start=at(original.gameStartAt),git=at(original.firstGitCommittedAt);
 if(!Number.isFinite(observed)||observed>start-900000||
    observed>git+300000||observed<at(original.capturedAt)-24*3600000)
  return fail("app_offer_timestamp_not_point_in_time_precommit");
 return {kind:KIND,verified:true,originalAppOfferVerified:true,
  originalSourceOfferId:original.originalSourceOfferId,
  appReceiptId:app.receiptId,appObservedAt:app.observedAt,
  platform:original.platform,originalSide:original.originalSide,
  onlyAuthenticatedSides:true,entrySpecificPayoutVerified:false,
  platformSettlementVerified:false,payoutAdjustedExpectedValue:null,
  automaticWagersAuthorized:false};
}
const sameOriginalReceiptFields=(original,receipt)=>[
 "platform","sport","gameId","playerId","team","opponent",
 "market","period","tier","line","originalSourceOfferId"
].every(k=>same(original?.[k],receipt?.[k]));
function payout(original,app,quote){
 const e=exactOffer(original,app);
 if(!e.verified)return e;
 if(!authentic(quote)||quote.platform!==original.platform||
  !sameOriginalReceiptFields(original,quote)||
  !Array.isArray(quote.availableSides)||
  !quote.availableSides.includes(original.originalSide)||
  !entryType[quote.platform]?.has(quote.entryType)||
  !Number.isInteger(quote.pickCount)||quote.pickCount<2||quote.pickCount>6||
  quote.entryType==="flex"&&quote.pickCount<3||
  !n(quote.entryFee)||quote.entryFee<=0||!n(quote.maximumMultiplier)||
  quote.maximumMultiplier<=0||!quote.entryId||!quote.payoutTableId||
  !Array.isArray(quote.includesOriginalSelectionIds)||
  !quote.includesOriginalSelectionIds.includes(original.originalModelSelectionId)||
  new Set(quote.includesOriginalSelectionIds).size!==quote.includesOriginalSelectionIds.length||
  !Number.isFinite(at(quote.observedAt))||
  at(quote.observedAt)>at(original.gameStartAt)-900000||
  at(quote.observedAt)<at(original.capturedAt)-24*3600000)
  return {...e,verified:false,reason:"missing_authenticated_entry_specific_payout_and_rules"};
 return {...e,verified:true,entrySpecificPayoutVerified:true,
  entryType:quote.entryType,pickCount:quote.pickCount,
  payoutQuoteReceiptId:quote.receiptId,payoutTableId:quote.payoutTableId,
  entryId:quote.entryId,platformSettlementVerified:false,
  payoutAdjustedExpectedValue:null};
}
function settlement(original,app,quote,settled){
 const e=payout(original,app,quote);
 if(!e.verified)return e;
 if(!authentic(settled)||settled.entryId!==quote.entryId||
    settled.platform!==original.platform||
    !sameOriginalReceiptFields(original,settled)||
    settled.payoutTableId!==quote.payoutTableId||
    settled.status!=="final"||
    !n(settled.netPayout)||settled.netPayout<0||
    !Number.isFinite(at(settled.settledAt))||
    at(settled.settledAt)<=at(original.gameStartAt))
  return {...e,verified:false,reason:"no_authenticated_final_platform_settlement"};
 return {...e,verified:true,platformSettlementVerified:true,
  finalSettlementReceiptId:settled.receiptId,
  // A single verified settlement is not a calibrated probability or EV.
  payoutAdjustedExpectedValue:null,automaticWagersAuthorized:false};
}
function coverage({originals=[],appOffers=[],entryQuotes=[],settlements=[]}={}){
 let original=0,appMatched=0,payoutMatched=0,settled=0,invalidOriginal=0;
 const appIds=new Set(),quoteIds=new Set(),settlementIds=new Set();
 for(const o of originals){
  if(!originalValid(o)){invalidOriginal++;continue;}original++;
  const a=appOffers.filter(x=>x.originalSourceOfferId===o.originalSourceOfferId);
  if(a.length!==1||appIds.has(a[0].receiptId)||!exactOffer(o,a[0]).verified)continue;
  appIds.add(a[0].receiptId);appMatched++;
  const qs=entryQuotes.filter(x=>x.includesOriginalSelectionIds?.includes(o.originalModelSelectionId)&&x.platform===o.platform);
  if(qs.length!==1||quoteIds.has(qs[0].receiptId)||!payout(o,a[0],qs[0]).verified)continue;
  quoteIds.add(qs[0].receiptId);payoutMatched++;
  const ss=settlements.filter(x=>x.entryId===qs[0].entryId&&x.platform===o.platform);
  if(ss.length!==1||settlementIds.has(ss[0].receiptId)||!settlement(o,a[0],qs[0],ss[0]).verified)continue;
  settlementIds.add(ss[0].receiptId);settled++;
 }
 return {kind:"private_original_app_quote_payout_reconciliation_coverage_v1",
  sourceOriginals:original,invalidOriginal,authenticatedExactAppOffers:appMatched,
  authenticatedExactPayoutQuotes:payoutMatched,authenticatedFinalSettlements:settled,
  sourceOnlyCannotEstablishPlatformBookability:true,
  publicReferencePayoutTablesNotSpecificEntryQuotes:true,
  roiApproved:false,calibratedProbabilities:false,
  modelPromoted:false,automaticWagers:0};
}
module.exports={KIND,identityValid,exactOffer,payout,settlement,coverage};
