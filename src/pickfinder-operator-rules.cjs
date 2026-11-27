"use strict";
// Public operator references, not rules asserted for an individual offer,
// account, jurisdiction, historical entry, or settled result.
const CHECKED_ON="2026-11-27";
const PRIZEPICKS_TWO_FLEX_REFERENCE="2026-10-19";
const REFERENCES=Object.freeze({
 PrizePicks:Object.freeze({
  product:"player_picks",payoutUpdatedOn:PRIZEPICKS_TWO_FLEX_REFERENCE,
  payout:"https://www.prizepicks.com/help-center/payouts",
  outcomes:"https://www.prizepicks.com/help-center/potential-outcomes",
  voids:"https://www.prizepicks.com/help-center/dnps-reboots-and-ties",
  scoring:"https://www.prizepicks.com/help-center/official-scoring-providers",
  formats:Object.freeze({power:[2,6],flex:[2,6]}),
 }),
 Underdog:Object.freeze({
  product:"fantasy_pickem",payoutUpdatedOn:"2026-09-25",
  payout:"https://help.underdogsports.com/en/articles/13780101-pick-em-standard-flex-entry-payouts",
  flex:"https://help.underdogsports.com/en/articles/13161362-pick-em-flex-flexed-payouts",
  voids:"https://help.underdogsports.com/en/articles/8974260-tied-or-voided-picks",
  esportsScoring:"https://help.underdogsports.com/en/articles/10905524-pick-em-scoring-esports",
  formats:Object.freeze({standard:[2,8],flex:[3,8]}),
 }),
});
for(const x of Object.values(REFERENCES))for(const range of Object.values(x.formats))Object.freeze(range);

function currentFormatReference(platform,size){
 const r=Object.hasOwn(REFERENCES,platform)?REFERENCES[platform]:null;
 if(!r||!Number.isSafeInteger(size))return null;
 return {
  product:r.product,checkedOn:CHECKED_ON,sourcePublishedOrUpdatedOn:r.payoutUpdatedOn,
  source:r.payout,publiclyDocumentedFormats:Object.entries(r.formats)
   .filter(([,range])=>size>=range[0]&&size<=range[1]).map(([name])=>name),
  historicalEffectiveDateVerified:false,
  eligibilityVerified:false,payoutVerified:false,settlementVerified:false,
 };
}
function supportsExactReceiptFormat(platform,format,count,observedAt){
 if(!Number.isFinite(Date.parse(observedAt))||!Number.isSafeInteger(count)||count<2||count>6)return false;
 const ref=currentFormatReference(platform,count);
 if(!ref?.publiclyDocumentedFormats.includes(format))return false;
 // Bound the revised two-pick Flex receipt path to the dated version we
 // have in hand. The page revision is not a claim about the launch date.
 if(platform==="PrizePicks"&&format==="flex"&&count===2)
  return Date.parse(observedAt)>=Date.parse(PRIZEPICKS_TWO_FLEX_REFERENCE+"T00:00:00Z");
 return true;
}
module.exports={REFERENCES,currentFormatReference,supportsExactReceiptFormat};
