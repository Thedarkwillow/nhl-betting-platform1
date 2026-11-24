"use strict";
// Pure budget planning only. No upstream requests, subscriptions or schedule activation.
const MONTHLY_LIMIT=100,RESERVE=25,MAX_PAGES=1;
function plan({remainingCredits,daysRemaining,leagueCount=2,coverageValidated=false,mode="compact",limit=100,requestedPages=1}={}){
 const n=Number.isInteger(remainingCredits)&&remainingCredits>=0&&remainingCredits<=MONTHLY_LIMIT;
 const d=Number.isInteger(daysRemaining)&&daysRemaining>=1&&daysRemaining<=31;
 const l=Number.isInteger(leagueCount)&&leagueCount>=1&&leagueCount<=2;
 if(!n||!d||!l||mode!=="compact"||!Number.isInteger(limit)||limit<1||limit>100||requestedPages!==MAX_PAGES)
  return {allowed:false,reason:"unknown_or_outside_budget_contract",maxMonthlyRequests:0,scheduleEnabled:false};
 const spendable=Math.max(0,remainingCredits-RESERVE),dailyCap=Math.min(leagueCount,Math.floor(spendable/daysRemaining));
 return {allowed:coverageValidated===true&&dailyCap>0,reason:coverageValidated!==true?"coverage_not_validated":dailyCap===0?"reserve_or_monthly_budget":"budget_candidate",
  remainingCredits,reserve:RESERVE,spendable,dailyCap,maxMonthlyRequests:dailyCap*daysRemaining,expectedCreditsPerPage:1,limit,requestedPages,automaticPagination:false,scheduleEnabled:false};
}
// A receipt is an aggregate observation of the provider balance, not an entitlement.
// Never authorize a live request from an unknown or stale monthly balance.
function authorizeSample({receipt,now,requestedLeagues=1,view="full"}={}){
 const at=Date.parse(now),seen=Date.parse(receipt?.observedAt);
 if(!Number.isFinite(at)||!Number.isFinite(seen)||seen>at||at-seen>2*3600000||
 !Number.isInteger(receipt?.remainingCredits)||receipt.remainingCredits<0||receipt.remainingCredits>MONTHLY_LIMIT||
 ![1,2].includes(requestedLeagues)||!["full","compact"].includes(view))
 return {allowed:false,reason:"unverified_budget",maxCredits:0};
 const maxCredits=requestedLeagues*(view==="full"?3:1);
 return {allowed:receipt.remainingCredits-maxCredits>=RESERVE,reason:receipt.remainingCredits-maxCredits>=RESERVE?"bounded_sample":"reserve_protected",maxCredits,expectedRemaining:receipt.remainingCredits-maxCredits,automaticPagination:false};
}
module.exports={plan,authorizeSample,MONTHLY_LIMIT,RESERVE};
