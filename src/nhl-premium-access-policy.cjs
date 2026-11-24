"use strict";
/** SERVER-SIDE DESIGN GATE ONLY. No member accounts or billing enabled. */
const RIGHTS=["derivedResearchPublicDisplay","commercialAnalytics",
 "cachedDataRedistribution","originalPlatformTermsReviewed","paymentUnderwritingApproved"];
const FREE_FEATURES=new Set(["nhl_board_read","saved_browser_draft","public_results","player_public_history"]);
const PAID_FEATURES=new Set(["premium_research_filters","private_api_research",
 "multi_device_watchlist","premium_alerts","premium_matchup_scenarios"]);
function authorizeResearchAccess({feature,user=null,providerRights=null,
 policy=null,verifiedServerClaims=false}={}){
 if(FREE_FEATURES.has(feature))return {allowed:true,tier:"free",
  reason:"public_research_feature",billingEnabled:false};
 if(!PAID_FEATURES.has(feature))return {allowed:false,reason:"unknown_feature",billingEnabled:false};
 if(verifiedServerClaims!==true||user?.identityVerified!==true||
    !["research_pro","power_research"].includes(user?.entitlement)||
    user?.subscriptionStatus!=="active")
  return {allowed:false,reason:"no_verified_server_side_entitlement",billingEnabled:false};
 if(policy?.paidAccessApproved!==true||policy?.jurisdictionReviewed!==true||
    RIGHTS.some(k=>providerRights?.[k]!==true))
  return {allowed:false,reason:"commercial_rights_or_compliance_not_approved",billingEnabled:false};
 // Even when all hypothetical conditions are true, launch remains closed
 // until an audited auth/billing service is actually deployed.
 return {allowed:false,reason:"premium_service_not_deployed",billingEnabled:false};
}
module.exports={authorizeResearchAccess,RIGHTS,FREE_FEATURES,PAID_FEATURES};
