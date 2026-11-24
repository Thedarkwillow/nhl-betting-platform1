"use strict";
/**
 * Per-market, PER-PLATFORM NFL settlement evidence. A current rule page
 * documents some cases but does not authenticate an offered, timestamped
 * line or prove that 2024/25 historical settlement was identical.
 */
const {MARKET_REGISTRY}=require("./nfl-market-registry.cjs");
const SOURCES=Object.freeze({
 underdog:"https://help.underdogsports.com/en/articles/8974214-pick-em-scoring-nfl",
 prizepicksDnp:"https://www.prizepicks.com/help-center/dnps-reboots-and-ties",
 prizepicksFantasy:"https://www.prizepicks.com/playbook-article/how-to-play-prizepicks-nfl-fantasy-scoring-system",
 prizepicksPlayer:"https://www.prizepicks.com/help-center/player-picks"
});
const UD_RULE_NOTES=Object.freeze({
 punting_average:"No punt means void; gross average rounded to 2 decimals",
 punt_gross_yards:"No punt grades zero for total punt yardage per current Underdog rules",
 longest_gross_punt:"No punt voids",
 first_gross_punt:"No punt voids",
 punting_touchbacks:"No punt grades zero",
 punt_inside_20:"Inside opponent 20 after down/fair catch/return; touchbacks excluded",
 fg_made_quarter:"Quarter FG grades even when player not on field in that quarter",
 fg_xp_each_quarter:"Each specified quarter requires successful FG/XP; overtime excluded",
 fg_longest_made:"No FG attempt voids; made FG with valid distance required",
 first_fg_made:"No FGs made in game voids",
 first_xp_made:"No extra points made in game voids",
 first_completion_yards:"No completed pass voids",
 first_reception_yards:"No reception voids",
 first_rush_attempt_yards:"No rushing attempt voids",
 red_zone_targets:"Line of scrimmage at or inside opponent 20, not target's finishing yardline",
 red_zone_rush_attempts:"Rush play originates at or inside opponent 20",
 first_drive_punts:"No punt on first team drive grades zero",
 fg_on_first_drive:"No made FG on first team drive grades zero",
 first_drive_longest_completion:"No first-drive attempted pass grades zero; no game participation voids",
 first_attempt_completion:"Intentional grounding does not count as official first attempt",
 first_5_attempt_completions:"Intentional grounding excluded from official attempts",
 quarters_1_plus_reception:"Partial-period reception/rush first-attempt special rules can void if no listed play",
 yards_each_quarter_half:"Quarter/half does not include overtime; player plays a snap",
 first_td_scorer:"First TD excludes passer; defensive or special teams TD exceptions",
 last_td_scorer:"Last TD can include overtime; scorer excludes passer",
 anytime_td:"Only rushing/receiving scores, not passing TD",
 total_touchdowns:"Passing+rushing+receiving total TD; distinct from anytime",
 receiving_first_downs:"Penalty-caused first downs excluded",
 kickoff_touchbacks:"Specific endzone/non-returned kick and fair catch exclusions",
});
const PERIOD_OVERTIME_EXCLUDE=new Set([
 "yards_each_quarter_half","quarters_5_plus_rush","halves_25_plus_rush",
 "halves_25_plus_receiving","halves_100_plus_passing","halves_50_plus_rush",
 "quarters_1_plus_reception","quarters_25_plus_pass_yards",
 "quarters_5_plus_receiving_yards","quarters_10_plus_receiving_yards",
 "fg_xp_each_quarter"
]);
function settlementFor(marketId,platform){
 if(!["prizepicks","underdog"].includes(platform))throw Error("Invalid NFL platform");
 const m=MARKET_REGISTRY.find(r=>r.id===marketId);
 if(!m)throw Error("Unknown canonical NFL market");
 const ud=platform==="underdog";
 const note=ud?UD_RULE_NOTES[marketId]||null:null;
 return {
  platform,marketId,marketGroup:m.group,
  latestPublicRuleSource:ud?SOURCES.underdog:
   m.group==="fantasy"?SOURCES.prizepicksFantasy:SOURCES.prizepicksPlayer,
  genericSettlementReferenceFound:ud?Boolean(note):m.group==="fantasy",
  publiclyDocumentedCaveat:note,
  specificallyExcludeOvertimeUnderUdCurrentRules:ud&&PERIOD_OVERTIME_EXCLUDE.has(marketId),
  originalMarketSettlementVersionCaptured:false,
  originalOfferTimestampAndSourceAuthenticated:false,
  DNPAndVoidRuleReviewedForOriginalQuote:false,
  exactAppPayoutAndTieRuleCaptured:false,
  specialEventResultReconciledAgainstOfficialNFLGamebook:false,
  autoPickEligible:false,
  stage:note?"published_reference_needs_versioned_evidence":"rule_not_yet_verifiable_at_offer_time"
 };
}
function reviewAll(){
 const records=[];
 for(const m of MARKET_REGISTRY)for(const platform of ["prizepicks","underdog"])
  records.push(settlementFor(m.id,platform));
 return {schemaVersion:1,kind:"nfl_settlement_market_rule_readiness_v1",
  asOf:"2026-11-08",platformCount:2,marketCount:MARKET_REGISTRY.length,
  totalChecks:records.length,
  publishedReferences:records.filter(r=>r.genericSettlementReferenceFound).length,
  verifiedOriginalOfferedRuleVersions:0,eligibleAutomaticPicks:0,
  documentationSources:SOURCES,records};
}
module.exports={SOURCES,settlementFor,reviewAll};
