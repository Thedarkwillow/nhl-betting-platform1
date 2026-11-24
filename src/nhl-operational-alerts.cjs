"use strict";
/**
 * Operator alert rules. "Missing evidence" is unknown, not green.
 * Research health does not certify sportsbook or original-platform availability.
 */
const stamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function summarizeReadiness({now,overnight,actions,provider,ledger,source,sourceCoverage=null}){
 const clock=stamp(now);
 if(clock===null)throw Error("Valid operator audit timestamp required");
 const warning=[],critical=[];
 const add=(k,level,reason)=>(level==="critical"?critical:warning).push({code:k,reason});
 const stats=overnight?.officialGameStats;
 if(!stats)add("OFFICIAL_STATS_UNKNOWN","warning","No verified official NHL final stats summary");
 else if(stats.complete!==true)add("OFFICIAL_STATS_INCOMPLETE","warning","Official completed game day not fully archived yet");
 const c=ledger?.counts;
 if(!c)add("PREGAME_LEDGER_MISSING","warning","Frozen selected-pick registry could not be verified");
 else if(c.registered<=0)add("PREGAME_LEDGER_EMPTY","warning","No original pregame selected directions");
 else if(c.registered!==c.correct+c.incorrect+c.push+c.pending)
  add("PREGAME_LEDGER_COUNT_MISMATCH","critical","Official outcomes and pending do not reconcile");
 const boardAt=stamp(source?.generatedAt),age=boardAt===null?null:(clock-boardAt)/60000;
 if(age===null||age<0)add("BOARD_TIMESTAMP_UNPROVEN","warning","Source quote age not verified");
 else if(age>30)add("BOARD_ARCHIVED_NOT_LIVE","warning","Last independent quote is older than live display limit");
 if(source?.completePagination!==true)add("BOARD_PAGINATION_NOT_COMPLETE","critical","No complete source paging proof");
 if(!sourceCoverage)
  add("OFFICIAL_GAME_SOURCE_COVERAGE_NOT_MEASURED","warning",
   "No cached source-vs-official-NHL-game coverage proof available");
 else if(sourceCoverage.status!=="complete_independent_source_response_not_original_platform_coverage")
  add("INDEPENDENT_SOURCE_COMPLETENESS_NOT_PROVEN","warning",
   "An independent capture did not pass the official source pagination audit");
 else if(sourceCoverage.officialGamesInWindow>0&&
   sourceCoverage.officialGamesWithObservedOffers===0)
  add("OFFICIAL_GAME_SOURCE_MATCH_EMPTY","warning",
   "No independent NHL prop rows aligned to official NHL games in the capture window");
 else if(sourceCoverage.matchedEligibleSideRows===0)
  add("INDEPENDENT_SOURCE_SIDE_MATCH_EMPTY","warning",
   "Archived provider has no eligible NHL full-game Higher/Lower market matches");

 const unit=source?.quotaUnit??"unknown";
 if(unit==="credits"&&(!Number.isInteger(source?.creditsRemaining)||source.creditsRemaining<80))
  add("PROVIDER_CREDIT_RESERVE","warning","Confirmed source credits below worst-case capture reserve");
 if(unit==="requests"&&Number.isInteger(source?.creditsRemaining)&&source.creditsRemaining<100)
  add("PROVIDER_LEGACY_REQUEST_RESERVE","warning","Legacy request quota may be too low for next capture");
 if(!["credits","requests"].includes(unit))add("PROVIDER_QUOTA_UNIT_UNKNOWN","warning","Paid capture must remain blocked until quota verified");
 if(!actions)add("WORKFLOW_EVIDENCE_UNKNOWN","warning","GitHub Actions monitoring unavailable");
 else if(actions.counts?.criticalIssues>0)add("WORKFLOW_CRITICAL_FAILURE","critical","Critical scheduled job failure or overdue run");
 if(provider?.overallStatus==="failed")add("PROVIDER_DATA_QUALITY","warning","Archived provider source-quality audit failed");
 return {kind:"private_nhl_operational_alerts_v1",asOf:now,
  status:critical.length?"operator_attention_required":warning.length?"review_issues":"no_detected_alerts",
  critical,warning,reportingOnly:true,
  noAutomatedBets:true,noPaidProviderRequests:true,
  providerOriginalAvailabilityProven:false,originalPlatformSettlementVerified:false,
  note:"An archived board older than 30 minutes is expected outside capture windows; it must not be described as a live offer."};
}
module.exports={summarizeReadiness};
