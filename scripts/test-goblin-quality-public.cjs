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
