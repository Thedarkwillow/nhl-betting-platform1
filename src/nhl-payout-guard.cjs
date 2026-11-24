"use strict";
// Never infer PrizePicks or Underdog payouts from a tier label.
function assessPayout({platform,tier,pickCount,payoutTable,verifiedAt}={}){
 const valid=["PrizePicks","Underdog"].includes(platform)&&["Standard","Goblin","Demon"].includes(tier)&&Number.isInteger(pickCount)&&pickCount>=2&&pickCount<=6;
 if(!valid)return {verified:false,payoutMultiplier:null,expectedValue:null,reason:"invalid_or_unsupported_platform_tier_or_pick_count"};
 const entry=payoutTable?.[platform]?.[tier]?.[String(pickCount)];
 if(!entry||!Number.isFinite(entry.multiplier)||entry.multiplier<=0||!entry.source||!verifiedAt)return {verified:false,payoutMultiplier:null,expectedValue:null,reason:"verified_payout_terms_unavailable"};
 return {verified:true,payoutMultiplier:entry.multiplier,expectedValue:null,verifiedAt,source:entry.source,reason:"Payout is verified but joint lineup probability is not calibrated"};
}
module.exports={assessPayout};
