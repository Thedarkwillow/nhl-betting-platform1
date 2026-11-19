"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {build}=require("./publish-safe-research-progress.cjs");
const {model}=require("../assets/roadmap-evidence-desk.js");
const now="2026-11-19T02:10:00Z";
const src={kind:"private_source_completion_readiness_v1",
 generatedAt:"2026-11-19T02:00:00Z",modelPromoted:false,wagersPlaced:0,
 odds:{strictPlatformMatches:0},paper:{}};
const screen={kind:"nhl_goblin_new_policy_first_git_screening_counts_v1",
 policyFirstGitVerified:true,screened:3,selected:1,abstained:2,
 lateOrUnverified:0,unknownStatus:0,prospectiveDecisionsUsed:0,
 calibrated:false,authenticatedPayouts:false,
 recommendationsReleased:0,modelPromoted:false,
 byMarket:{shotsOnGoal:{screened:3,selected:1,abstained:2}},
 abstentionReasons:{model_direction_not_on_original_offered_side:2},
 player:"DO NOT EXPOSE",line:1.5,privateOdds:-110};
const gob={kind:"private_goblin_forward_evidence_v1",
 generatedAt:"2026-11-19T02:01:00Z",researchOnly:true,
 modelPromoted:false,calibratedProbabilityApproved:false,
 actualWagersPlaced:0,providerRequests:0,
 NHL:{originalGoblinOffersExamined:3,newResearchCandidates:1,
 newAbstentions:2,archivedFirstGitRecords:200,quarantinedDuplicateFirstGitRows:0,
 postPolicyScreening:screen,selectivePolicySourceEligible:true},
 NFL:{historicalOpportunityContractImplemented:true,
  freshFirstGitSourceVerified:true,
  auditedOriginalGoblinOffers:8,identityReadyForNextModelStage:0,
  newEligibleFirstGitRecords:0,
  prerequisiteGaps:{officialGame:8,providerToGSIS:8,positiveActiveRoster:8}},
 comparison:{kind:"future_only_goblin_original_line_comparison_v1",
  verifiedOutperformance:false,registered:200,decided:0},
 calibration:{independentFutureApproval:false},
 lineups:{approvedLineups:0,exactGoblinEntryMultipliersCaptured:false}};
const buildWith=(g=gob)=>build(src,{now,goblin:g});
t("public count-only export validates all first-Git Goblin abstentions without private rows",()=>{
 const x=buildWith(),z=x.goblinFuture;
 a.equal(z.nhl.postPolicyScreening.screened,3);
 a.equal(z.nhl.postPolicyScreening.selected,1);
 a.equal(z.nhl.postPolicyScreening.abstained,2);
 a.equal(z.nfl.prerequisiteGaps.providerToGSIS,8);
 a.equal(JSON.stringify(z).includes("DO NOT EXPOSE"),false);
 a.equal(JSON.stringify(z).includes("-110"),false);
 a.equal(z.modelPromoted,false);a.equal(z.lineup.approvedSlips,0);
});
t("malformed counts or unforeseen raw reason keys fail closed",()=>{
 const invalid={...screen,selected:2};
 a.equal(buildWith({...gob,NHL:{...gob.NHL,postPolicyScreening:invalid}})
  .goblinFuture.nhl.postPolicyScreening,null);
 const rogue={...screen,abstentionReasons:{...screen.abstentionReasons,playerName:1}};
 a.equal(buildWith({...gob,NHL:{...gob.NHL,postPolicyScreening:rogue}})
  .goblinFuture.nhl.postPolicyScreening,null);
 const extra={...gob,NFL:{...gob.NFL,
  prerequisiteGaps:{...gob.NFL.prerequisiteGaps,officialGame:9}}};
 a.equal(buildWith(extra).goblinFuture.nfl.prerequisiteGaps,null);
 const stale={...gob,NFL:{...gob.NFL,freshFirstGitSourceVerified:false}};
 a.equal(buildWith(stale).goblinFuture.nfl.prerequisiteGaps,null);

});
t("dashboard explicitly distinguishes screened research, skipped offered sides and overlapping identity blockers",()=>{
 const x=buildWith(),rows=model({progress:x},Date.parse(now)).rows;
 a.match(rows.find(r=>r.label==="NHL Goblin NEW-policy screening").value,
  /1 accepted \/ 2 abstained from 3 eligible first-Git records/);
 a.match(rows.find(r=>r.label==="NFL Goblin identity prerequisites").value,
  /8 missing official-game bridges.*8 missing exact GSIS links.*8 missing verified active rosters/);
 a.match(rows.find(r=>r.label==="NHL Goblin NEW-policy screening").value,
  /accuracy and payout EV unverified/);
});

t("successful official NHL FINAL sources trigger Goblin-only retrospective grading safely",()=>{
 const fs=require("node:fs");
 const w=fs.readFileSync(".github/workflows/private-nhl-goblin-forward.yml","utf8");
 a.match(w,/Private NHL official stats and projections on free public runner/);
 a.match(w,/Private NHL prospective grading and baseline audit via public runner/);
 a.match(w,/github\.event\.workflow_run\.conclusion == 'success'/);
 a.match(w,/test\/goblin-quality-odds-nfl-source-gaps\.test\.cjs/);
 a.match(w,/node scripts\/report-goblin-forward\.cjs/);
 a.doesNotMatch(w,/AUTO_WAGER|PLACE_BET/);
});

t("public NFL schedule count-only bridge cannot be mistaken for player identity or active status",()=>{
 const e={kind:"nfl_independent_pregame_schedule_crosswalk_v1",
  source:"archived_nflverse_schedule_and_source_board",
  status:"independent_pregame_schedule_reconciled_not_player_or_roster",
  verifiedGames:2,originalGames:3,conflictingSourceGames:0,
  missingScheduleMatches:1,ambiguousScheduleMatches:0,
  sourceProvenanceValid:true,sourceFirstParty:false,
  noPlayerIdentityProof:true,paidProviderRequests:0,modelPromoted:false,
  rows:[{player:"DO NOT PUBLISH",providerGameId:"SECRET"}]};
 const g={...gob,NFL:{...gob.NFL,scheduleEvidence:e}};
 const published=buildWith(g);
 a.equal(published.goblinFuture.nfl.gameSchedule.verifiedGames,2);
 a.equal(JSON.stringify(published.goblinFuture).includes("DO NOT PUBLISH"),false);
 const shown=model({progress:published},Date.parse(now)).rows;
 a.match(shown.find(r=>r.label==="NFL Goblin independent schedule ID bridge").value,
  /2 \/ 3 source game keys.*provider-to-GSIS player ID and game-day active status NOT verified/);
 a.equal(published.goblinFuture.nfl.gameSchedule.gameDayActiveVerified,false);
 const stale=buildWith({...g,NFL:{...g.NFL,freshFirstGitSourceVerified:false}});
 a.equal(stale.goblinFuture.nfl.gameSchedule,null);
 const retro=buildWith({...g,NFL:{...g.NFL,
  scheduleEvidence:{...e,verifiedGames:3}}});
 a.equal(retro.goblinFuture.nfl.gameSchedule,null);
});

t("conditional GSIS research counts never release verified player identity or active claims",()=>{
 const e={kind:"nfl_original_provider_to_gsis_candidate_research_v1",
  originalProviderPlayers:50,candidateMatches:29,ambiguousPlayers:2,
  insufficientPriorWeeks:8,noRosterMatch:11,conflictingSourceIdentity:0,
  invalidPlayerEntries:0,rosterProvenanceVerified:true,
  independentlyVerifiedMappings:0,playerCrosswalkSourceVerified:false,
  officialGameDayActiveVerified:0,paidProviderRequests:0,modelPromoted:false,
  rows:[{providerPlayerId:"PRIVATE",gsisId:"PRIVATE-GSIS"}]};
 const data={...gob,NFL:{...gob.NFL,conditionalIdentityEvidence:e}};
 const out=buildWith(data).goblinFuture.nfl;
 a.equal(out.conditionalGSIS.priorRosterCandidates,29);
 a.equal(out.conditionalGSIS.verifiedSharedProviderIDs,0);
 a.equal(out.conditionalGSIS.verifiedGamedayActive,0);
 a.equal(JSON.stringify(out).includes("PRIVATE-GSIS"),false);
 const rows=model({progress:buildWith(data)},Date.parse(now)).rows;
 a.match(rows.find(z=>z.label==="NFL Goblin free GSIS candidate matching").value,
  /29 of 50 unique source players conditionally paired/);
 a.match(rows.find(z=>z.label==="NFL Goblin free GSIS candidate matching").value,
  /NOT game-day active/);
 const stale=buildWith({...data,NFL:{...data.NFL,freshFirstGitSourceVerified:false}});
 a.equal(stale.goblinFuture.nfl.conditionalGSIS,null);
 const invalid=buildWith({...data,NFL:{...data.NFL,conditionalIdentityEvidence:
   {...e,independentlyVerifiedMappings:29}}});
 a.equal(invalid.goblinFuture.nfl.conditionalGSIS,null);
});

t("official named active statements remain separate from provider GSIS and roster approval",()=>{
 const e={kind:"nfl_official_positive_game_statement_research_counts_v1",
  articlesObserved:2,explicitMentions:3,corroboratedConditionalPlayers:1,
  officialPositiveProviderGSISVerified:0,
  officialCompleteGameRosterVerified:false,
  approvedSelections:0,originalAppActiveVerified:false,
  noActiveByOmission:true,modelPromoted:false,providerRequests:0,
  privateName:"DO_NOT_PUBLISH"};
 const g={...gob,NFL:{...gob.NFL,officialPositiveEvidence:e}};
 const published=buildWith(g).goblinFuture;
 a.equal(published.nfl.positiveGameStatements.conditionalPlayersCorroborated,1);
 a.equal(published.nfl.positiveGameStatements.sharedProviderIDsConfirmed,0);
 a.equal(JSON.stringify(published).includes("DO_NOT_PUBLISH"),false);
 const rows=model({progress:buildWith(g)},Date.parse(now)).rows;
 a.match(rows.find(x=>x.label==="NFL official named active statements (research)").value,
  /1 provisional identities.*3 explicit active statements.*2 dated NFL.com articles/);
 const wrong=buildWith({...gob,NFL:{...gob.NFL,
  officialPositiveEvidence:{...e,officialPositiveProviderGSISVerified:1}}});
 a.equal(wrong.goblinFuture.nfl.positiveGameStatements,null);
 const stale=buildWith({...g,NFL:{...g.NFL,freshFirstGitSourceVerified:false}});
 a.equal(stale.goblinFuture.nfl.positiveGameStatements,null);
});

t("first-party NFL reported injuries display separately from verified active lineup claims",()=>{
 const e={kind:"nfl_first_party_reported_injury_counts_v1",
  officialFirstGitVerified:true,capturedAt:"2026-11-19T02:00:00Z",
  rows:3,out:2,questionable:1,doubtful:0,ambiguous:0,
  activeGamedayVerified:false,missingMeansHealthy:false,
  approvedSelections:0,providerRequests:0,modelPromoted:false,
  player:"DO NOT EXPOSE"};
 const g={...gob,NFL:{...gob.NFL,officialInjuryEvidence:e}};
 const p=buildWith(g),a1=p.goblinFuture.nfl.officialInjuryStatuses;
 a.equal(a1.ruledOut,2);a.equal(a1.questionable,1);
 a.equal(a1.gameDayActiveVerified,false);
 a.equal(JSON.stringify(p.goblinFuture).includes("DO NOT EXPOSE"),false);
 const rows=model({progress:p},Date.parse(now)).rows;
 a.match(rows.find(x=>x.label==="NFL first-party injury status matches").value,
  /2 officially OUT \/ 1 QUESTIONABLE \/ 0 DOUBTFUL/);
 const spoof=buildWith({...g,NFL:{...g.NFL,officialInjuryEvidence:
  {...e,activeGamedayVerified:true}}});
 a.equal(spoof.goblinFuture.nfl.officialInjuryStatuses,null);
});

t("official injury corroboration joins CONDITIONAL identities only and stays fail closed",()=>{
 const e={kind:"nfl_independent_identity_injury_overlap_research_v1",
  sourceFirstGitBeforeBoard:true,conditionalPlayers:5,
  officialGsisCorroborated:2,confirmedOut:1,questionableHold:1,
  doubtfulHold:0,duplicateOrConflictingStatuses:0,
  notOfficiallyStatusMatched:3,authenticatedProviderGSIS:0,
  positiveActiveGameday:0,productionEligible:0,modelPromoted:false,
  providerRequests:0,privatePlayers:["SECRET PLAYER","GSIS PRIVATE"]};
 const g={...gob,NFL:{...gob.NFL,officialIdentityInjuryOverlap:e}};
 const out=buildWith(g),x=out.goblinFuture.nfl.identityInjuryOverlap;
 a.equal(x.officialInjuryGSISCorroborations,2);
 a.equal(x.outExcluded,1);a.equal(x.questionableHeld,1);
 a.equal(x.unknownStatus,3);a.equal(x.gameDayActiveConfirmed,0);
 a.equal(JSON.stringify(out.goblinFuture).includes("SECRET PLAYER"),false);
 a.match(model({progress:out},Date.parse(now)).rows.find(
  z=>z.label==="NFL provisional GSIS + official injury overlap").value,
  /2 conditional GSIS identities.*1 OUT, 1 QUESTIONABLE, 0 DOUBTFUL/);
 const spoof=buildWith({...gob,NFL:{...gob.NFL,
  officialIdentityInjuryOverlap:{...e,positiveActiveGameday:4}}});
 a.equal(spoof.goblinFuture.nfl.identityInjuryOverlap,null);
 const stale=buildWith({...g,NFL:{...g.NFL,freshFirstGitSourceVerified:false}});
 a.equal(stale.goblinFuture.nfl.identityInjuryOverlap,null);
});
