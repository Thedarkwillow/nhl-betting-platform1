"use strict";
/**
 * Immutable provenance and claims firewall for NHL research exports.
 * The independent provider's Standard/Goblin/Demon labels are NOT proof
 * of original PrizePicks tiers, live availability or payout multipliers.
 */
const TIERS=Object.freeze(["Standard","Goblin","Demon"]);
const EVIDENCE=Object.freeze({
 provider:"independent_provider_indicated",
 primary:"dated_authenticated_original_platform_evidence"
});
function guardNhlOfferClaims(input={}){
 const tier=TIERS.includes(input?.tier)?input.tier:null;
 const proof=input?.proof||{};
 const verified=proof.kind===EVIDENCE.primary&&
  typeof proof.originalPlatform==="string"&&
  ["PrizePicks","Underdog"].includes(proof.originalPlatform)&&
  Number.isFinite(Date.parse(proof.observedAt))&&
  typeof proof.originalOfferId==="string"&&proof.originalOfferId.length>2&&
  typeof proof.exactMarketKey==="string"&&proof.exactMarketKey.length>2&&
  proof.tier===tier&&proof.gameId===input.gameId&&
  proof.playerId===input.playerId&&proof.market===input.market&&
  proof.line===input.line&&proof.side===input.side&&
  proof.period===input.period&&
  proof.authenticatedOriginalAppEvidence===true;
 const exactPrice=verified&&proof.payoutRuleAuthenticated===true&&
  Number.isFinite(proof.exactSelectedLineMultiplier)&&
  proof.exactSelectedLineMultiplier>0&&
  proof.payoutFormat&&["Power","Flex"].includes(proof.payoutFormat);
 return {providerIndicatedTier:tier,
  labelProvenance:verified?"authenticated_original_platform":"independent_provider_only",
  originalTierVerified:verified,
  originalPlatformLiveAvailabilityVerified:false,
  platformPriceVerified:!!exactPrice,
  exactSelectedLineMultiplier:exactPrice?proof.exactSelectedLineMultiplier:null,
  originalPlatformPayoutFormat:exactPrice?proof.payoutFormat:null,
  priceFromBookmakerOddsNotPermitted:true,
  expectedValueAvailable:false,
  rationale:verified?"Dated exact-line original-platform evidence; live current availability still unverified":
   "Independent provider tier; original platform tier and exact payout unverified"};
}
function guardNhlPublicClaim(input={}){
 const result=guardNhlOfferClaims(input);
 return {tier:result.providerIndicatedTier,
  tierEvidence:result.labelProvenance,
  originalTierVerified:result.originalTierVerified,
  originalPlatformLiveAvailabilityVerified:false,
  exactSelectedLineMultiplier:null,
  expectedValue:null,
  advertisedGuaranteedReturn:false};
}
module.exports={TIERS,EVIDENCE,guardNhlOfferClaims,guardNhlPublicClaim};
