"use strict";
const {REFERENCES}=require("./pickfinder-operator-rules.cjs");
const {payout:SOURCE,payoutUpdatedOn:UPDATED}=REFERENCES.PrizePicks;
const STANDARD=Object.freeze({
 power:Object.freeze({2:{2:3},3:{3:6},4:{4:10},5:{5:20},6:{6:37.5}}),
 flex:Object.freeze({2:{2:2,1:.5},3:{3:3,2:1},4:{4:6,3:1.5},5:{5:10,4:2,3:.4},6:{6:25,5:2,4:.4}})
});
function getPayout({platform="PrizePicks",tiers=[],playType="power",correct,pickCount}={}){
 if(platform!=="PrizePicks"||!Number.isInteger(pickCount)||pickCount<2||pickCount>6||!["power","flex"].includes(playType))return {verified:false,multiplier:null,reason:"unsupported"};
 const special=tiers.some(t=>String(t).toLowerCase()!=="standard");
 if(special){
  return {verified:false,multiplier:null,reason:"Goblin/Demon payouts vary by exact lineup; obtain platform quote",source:SOURCE};
 }
 const multiplier=STANDARD[playType][pickCount][correct??pickCount]??0;
 return {verified:false,referenceOnly:true,entrySpecificPayoutVerified:false,multiplier,source:SOURCE,sourceUpdated:UPDATED,standardRate:true,conditions:"Published standard Player Picks rates; DNP, ties, promotions and other adjustments can change payout"};
}
module.exports={STANDARD,getPayout};
