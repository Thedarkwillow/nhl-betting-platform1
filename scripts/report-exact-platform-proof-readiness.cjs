"use strict";
const fs=require("node:fs"),path=require("node:path");
const {coverage}=require("../src/exact-offer-payout-settlement-proof-v1.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const optional=p=>fs.existsSync(path.join(root,p))?read(p):null;
function main(){
 const ledger=optional("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
    !Array.isArray(ledger.records))throw Error("Private original NHL ledger required");
 // Never create self-attested app receipts from a partner source, screenshot,
 // final NHL stats or informational payout rule URLs. No live trusted app
 // attestation collector is currently authorized.
 const evidence=optional("outputs/verification/independently-authenticated-app-attestations.json");
 const trusted=evidence?.kind==="trusted_external_authentication_attestation_v1"&&
  evidence.independentPlatformVerifierCryptographicSignatureValidated===true;
 const attest=trusted?evidence:{originals:[],appOffers:[],entryQuotes:[],settlements:[]};
 const audit=coverage(attest);
 const eligible=ledger.records.filter(r=>r.tier==="Standard"||
    r.tier==="Goblin"||r.tier==="Demon");
 const out={kind:"private_prizepicks_underdog_platform_proof_funnel_v1",
  originalGitFrozenNhlResearchSelections:eligible.length,
  firstGitResearchIsNotAuthenticAppOffer:true,
  availableTrustedAppAttestations:trusted,
  ...audit,originalSourceOfferIdsCannotBeReconstructedFromModelHash:true,
  liveExactVerifiedAppMatches:audit.authenticatedExactAppOffers,
  currentEntryPayoutsVerified:audit.authenticatedExactPayoutQuotes,
  finalPlatformSettlementsVerified:audit.authenticatedFinalSettlements,
  independentSportsbookSameThresholdNotAppQuote:true,
  helpCenterPublicBaseMultipliersNotEntryTerms:true,
  citationPages:{
   prizePicksPayouts:"https://www.prizepicks.com/help-center/payouts",
   prizePicksDnp:"https://www.prizepicks.com/help-center/dnps-reboots-and-ties",
   underdogStandardFlex:"https://help.underdogsports.com/en/articles/13780101-pick-em-standard-flex-entry-payouts",
   underdogVoids:"https://help.underdogsports.com/en/articles/13161362-pick-em-flex-flexed-payouts"
  },
  modelApproved:false,payoutAdjustedEV:null,automaticLineupsApproved:false,
  realEntriesRecorded:0,paidRequests:0};
 const rel="outputs/health/platform-quote-settlement-readiness-latest.json";
 const current=optional(rel);
 const strip=x=>x&&((({generatedAt,...v})=>v)(x));
 if(!current||JSON.stringify(strip(current))!==JSON.stringify(out)){
  fs.writeFileSync(path.join(root,rel),JSON.stringify({...out,
   generatedAt:new Date().toISOString()},null,2)+"\n");
 }
 console.log(JSON.stringify({report:rel,
  researchRows:eligible.length,verifiedAppOffers:out.liveExactVerifiedAppMatches,
  verifiedPayouts:out.currentEntryPayoutsVerified,
  verifiedSettlements:out.finalPlatformSettlementsVerified,
  quoteEV:null,picksPromoted:0,providerCalls:0}));
 return out;
}
if(require.main===module)try{main()}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={main};
