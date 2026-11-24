"use strict";
// Candidate source must independently reconcile to official final goal credits
// and shift totals. Never overwrite original official archives.
const {extract}=require("./nhl-goal-credit-shared-ice-v1.cjs");
function reconcile(doc,pbp,box){
 if(doc?.kind!=="playerwon_shift_candidate_v1"||doc.source!=="PlayerWON"||doc.modelEligible!==false||doc.officialBoxscoreReconciled!==false||doc.gameId!==pbp?.id||doc.gameDate!==pbp.gameDate||!Array.isArray(doc.rows)||!doc.rows.length||doc.rejectedIntervals!==0||!/^\w{64}$/.test(doc.sha256||"")||!Number.isFinite(Date.parse(doc.collectedAt)))return null;
 const v=extract(pbp,box,doc.rows);if(!v?.goalCreditsVerified||!v.shiftsVerified)return null;
 return {...v,kind:"playerwon_official_reconciled_shift_v1",source:"PlayerWON CSV + official NHL final boxscore and goal events",sourceUrl:doc.sourceUrl,sourceSha256:doc.sha256,collectedAt:new Date().toISOString(),originalCollectedAt:doc.collectedAt,officialBoxscoreReconciled:true,researchOnly:true,modelPromoted:false,publicRedistributionApproved:false};
}
module.exports={reconcile};