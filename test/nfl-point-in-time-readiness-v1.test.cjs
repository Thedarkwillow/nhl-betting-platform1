"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluate,comparison,practice,gameDay,appQuote,certifiedCalibration,
 sameOfficialClubHost,datedGamePractice}=require("../src/nfl-point-in-time-readiness-v1.cjs");
const asOf="2026-11-22T14:48:00Z",start="2026-11-22T18:00:00Z";
const p={sport:"NFL",source:"PrizePicks independent feed",player:"Rashee Rice",
 historicalPlayerId:"00-0039067",gameId:"2026_11_ARI_KC",team:"KC",opponent:"ARI",
 market:"receiving_yards",tier:"Standard",line:48.5,side:"Higher",
 probability:.7222222,projection:70.1,priorGames:18,season:2026,week:11,
 capturedAt:"2026-11-22T14:10:15.764Z",observedAt:"2026-11-22T13:44:37.200Z",
 eventStartsAt:start,sourceProjectionId:"pp_17071730"};
const practiceDoc={kind:"nfl_club_practice_source_research_v1",
 observedAt:"2026-11-22T14:45:29Z",reports:[{player:"Rashee Rice",
 historicalPlayerId:p.historicalPlayerId,gameId:p.gameId,team:p.team,
 reportDay:"2026-11-20",sourceUrl:"https://www.chiefs.com/news/week-11-injury-report-cardinals-vs-chiefs-2026",
 fridayPractice:"full",gameDesignation:"none"}]};
const quotes={kind:"nfl_third_party_platform_line_comparison_v1",
 observedAt:"2026-11-22T14:45:29Z",
 sourceUrl:"https://www.tempoodds.com/picks",props:[{
  player:p.player,gameId:p.gameId,historicalPlayerId:p.historicalPlayerId,
  market:p.market,platformLines:{PrizePicks:49.5,Underdog:50.5}}]};
test("team full practice is not positive game-day active clearance",()=>{
 const r=evaluate(p,{asOf,clubPractice:practiceDoc});
 assert.equal(r.clubPractice.officialTeamReport,true);
 assert.equal(r.clubPractice.noGameDesignation,true);
 assert.equal(r.clubPractice.positiveGamedayActive,false);
 assert.equal(r.gameDayActive.gameDayActiveVerified,false);
 assert.ok(r.reasons.includes("official_positive_game_day_active_roster_missing"));
 assert.equal(r.bettingEligible,false);
});
test("third-party 49.5/50.5 comparison rejects 48.5 as exact authenticated",()=>{
 const r=evaluate(p,{asOf,comparisonDoc:quotes});
 assert.equal(r.independentPlatformComparison.reportedPlatformLines.PrizePicks.line,49.5);
 assert.equal(r.independentPlatformComparison.reportedPlatformLines.PrizePicks.matchOriginal,false);
 assert.equal(r.independentPlatformComparison.reportedPlatformLines.Underdog.matchOriginal,false);
 assert.equal(r.authenticatedPlatformQuote.authenticatedExactOriginalAppOffer,false);
});
test("Pollard 3.5 missing from third-party platform comparison is not proven removed",()=>{
 const pollard={...p,player:"Tony Pollard",team:"TEN",opponent:"DAL",
 historicalPlayerId:"00-0035261",gameId:"2026_11_TEN_DAL",
 market:"receptions",line:3.5,side:"Lower",probability:.8,priorGames:20};
 const doc={...quotes,props:[{player:pollard.player,gameId:pollard.gameId,
  historicalPlayerId:pollard.historicalPlayerId,market:pollard.market,
  platformLines:{PrizePicks:null,Underdog:null}}]};
 const r=evaluate(pollard,{asOf,comparisonDoc:doc});
 assert.equal(r.independentPlatformComparison.reportedPlatformLines.PrizePicks.line,null);
 assert.equal(r.independentPlatformComparison.missingPlatformListingIsNotProofOfRemoval,true);
 assert.equal(r.authenticatedPlatformQuote.authenticatedExactOriginalAppOffer,false);
});
test("a missing official injured/out report is never positive active evidence",()=>{
 const report={kind:"nfl_first_party_published_game_status_v1",
 capturedAt:"2026-11-22T14:25:00Z",rows:[]};
 const r=evaluate(p,{asOf,officialReport:report});
 assert.equal(r.officialInjury.medicalClearanceVerified,false);
 assert.equal(r.gameDayActive.gameDayActiveVerified,false);
});
test("a stated questionable official status explicitly blocks recommendation",()=>{
 const report={kind:"nfl_first_party_published_game_status_v1",
 capturedAt:"2026-11-22T14:25:00Z",rows:[{gsisId:p.historicalPlayerId,
 team:"KC",season:2026,week:11,status:"questionable",modifiedAt:"2026-11-22T14:24:00Z"}]};
 const r=evaluate(p,{asOf,officialReport:report});
 assert.equal(r.officialInjury.blocksResearch,true);
 assert.ok(r.reasons.includes("official_injury_uncertainty_or_out_report"));
});
test("unverified/app-scraped quotes cannot bypass exact original receipt",()=>{
 const fake=[{kind:"nfl_authenticated_platform_offer_v1",platform:"PrizePicks",
 sport:"NFL",player:p.player,sourceProjectionId:p.sourceProjectionId,
 independentlyVerifiedOriginalSourceId:true,playerGSIS:p.historicalPlayerId,
 gameId:p.gameId,team:p.team,opponent:p.opponent,market:p.market,tier:p.tier,
 line:p.line,availableSides:[p.side],verificationMethod:"verified_app_export",
 verifiedByIndependentAppAccess:true,signedOrAuthenticatedReceiptVerified:false,
 receiptId:"independentId1",observedAt:"2026-11-22T14:44:00Z"}];
 assert.equal(appQuote(p,fake,asOf).authenticatedExactOriginalAppOffer,false);
 assert.equal(evaluate(p,{asOf,appOffers:fake}).bettingEligible,false);
});
test("no calibrated win percentage can be fabricated from twenty past games",()=>{
 const r=evaluate(p,{asOf});
 assert.equal(r.prospectiveCalibration.verified,false);
 assert.equal(r.prospectiveCalibration.calibratedProbability,null);
 assert.equal(r.rawUncalibratedModelEstimate,.7222222);
 assert.equal(r.payout.payoutAdjustedExpectedValue,null);
});
test("historical-only 250 samples without precommitted independent holdout fails",()=>{
 const fake={kind:"nfl_prospective_market_calibration_certificate_v1",sport:"NFL",
 market:"receiving_yards",tier:"Standard",modelVersion:"v1",
 independentHoldoutSampleSize:250,independentHoldoutGameCount:40,
 distinctHoldoutSlates:25,onlyFirstGitOriginalPregameDecisions:false,
 trainAndHoldoutDatesSeparated:true,holdoutBrierScore:.18,
 holdoutBaselineBrierScore:.25,heldoutCalibratedProbability:.72,
 frozenAt:"2026-11-21T12:00:00Z"};
 assert.equal(certifiedCalibration({...p,modelVersion:"v1"},fake,asOf).verified,false);
});
test("post-snapshot active report cannot be retroactively added to originally frozen pick",()=>{
 const good={kind:"nfl_exact_official_game_day_active_roster_v1",
 capturedAt:"2026-11-22T14:55:00Z",firstGitCommittedAt:"2026-11-22T14:56:00Z",
 fullGameRosterAuthenticated:true,entries:[{gsisId:p.historicalPlayerId,
 gameId:p.gameId,team:p.team,sourcePlayerAndGSISExact:true,status:"active",
 signedOrAuthenticatedOfficialPublication:true,sourceUrl:"https://www.nfl.com/inactives"}]};
 assert.equal(gameDay(p,good,asOf).gameDayActiveVerified,false);
});
test("no entry-specific payout or independent joint hit probabilities means no EV",()=>{
 const r=evaluate(p,{asOf,entryPayoutQuote:{signedOrAuthenticatedReceiptVerified:true}});
 assert.equal(r.payout.payoutAdjustedExpectedValue,null);
 assert.ok(r.reasons.includes("validated_joint_lineup_probability_missing"));
 assert.equal(r.bettingEligible,false);
});

test("only complete unique first-Git positive active game rosters for BOTH teams can verify one player",()=>{
 const entries=["KC","ARI"].flatMap(team=>
  Array.from({length:47},(_,i)=>({
   gameId:p.gameId,team,
   gsisId:team==="KC"&&i===0?p.historicalPlayerId:
    "00-"+String((team==="KC"?1000000:2000000)+i).padStart(7,"0"),
   status:"active",sourcePlayerAndGSISExact:true,
   signedOrAuthenticatedOfficialPublication:true,
   sourceUrl:"https://www.nfl.com/games/official-roster"
  })));
 const genuineShape={kind:"nfl_exact_official_game_day_active_roster_v1",
  gameId:p.gameId,capturedAt:"2026-11-22T14:32:00Z",
  firstGitCommittedAt:"2026-11-22T14:35:00Z",
  firstGitSourceVerified:true,fullGameRosterAuthenticated:true,entries};
 const result=gameDay(p,genuineShape,asOf);
 assert.equal(result.gameDayActiveVerified,true);
 assert.equal(result.rosterCompletenessVerified,true);
 assert.deepEqual(result.bothTeamsExplicitActiveCounts,[47,47]);
 assert.equal(evaluate(p,{asOf,gameDayRoster:genuineShape}).bettingEligible,false);
 assert.equal(gameDay(p,{...genuineShape,firstGitSourceVerified:false},asOf).gameDayActiveVerified,false);
 assert.equal(gameDay(p,{...genuineShape,entries:entries.slice(1)},asOf).gameDayActiveVerified,false);
 assert.equal(gameDay(p,{...genuineShape,entries:entries.slice(0,-1)},asOf).gameDayActiveVerified,false);
 assert.equal(gameDay(p,{...genuineShape,entries:[...entries.slice(0,-1),entries[0]]},asOf).gameDayActiveVerified,false);
 assert.equal(gameDay({...p,historicalPlayerId:"00-0099999"},genuineShape,asOf).gameDayActiveVerified,false);
 const changedGame=entries.map(x=>({...x,gameId:"2026_10_ARI_KC"}));
 assert.equal(gameDay(p,{...genuineShape,entries:changedGame},asOf).gameDayActiveVerified,false);
 const bogusTeam=entries.map((x,i)=>i===80?{...x,team:"DAL"}:x);
 assert.equal(gameDay(p,{...genuineShape,entries:bogusTeam},asOf).gameDayActiveVerified,false);
});

test("NFL original team practice is verified dynamically across 32 official team domains and game weeks",()=>{
 assert.equal(sameOfficialClubHost("https://www.chiefs.com/news/week-11-report","KC"),true);
 assert.equal(sameOfficialClubHost("https://www.49ers.com/news/official-injury-report","SF"),true);
 assert.equal(sameOfficialClubHost("https://www.raiders.com/team/report","LV"),true);
 assert.equal(sameOfficialClubHost("https://www.49ers.com.evil.example/news/report","SF"),false);
 assert.equal(sameOfficialClubHost("http://www.chiefs.com/news/report","KC"),false);
 assert.equal(sameOfficialClubHost("https://www.chiefs.com/news/report","TEN"),false);
 assert.equal(datedGamePractice("2026-11-20",start,asOf),true);
 assert.equal(datedGamePractice("2026-11-23",start,asOf),false);
 assert.equal(datedGamePractice("2026-10-12",start,asOf),false);
 assert.equal(datedGamePractice("2026-11-20","invalid",asOf),false);
 assert.equal(datedGamePractice("2026-11-20",start,"invalid"),false);
 const sf={...p,player:"Test Receiver",team:"SF",opponent:"ARI",
  historicalPlayerId:"00-0041000",gameId:"2026_11_ARI_SF"};
 const sfDoc={kind:"nfl_club_practice_source_research_v1",observedAt:asOf,
  reports:[{historicalPlayerId:sf.historicalPlayerId,gameId:sf.gameId,
   player:sf.player,team:sf.team,reportDay:"2026-11-20",
   sourceUrl:"https://www.49ers.com/news/official-week-11-injury-report",
   fridayPractice:"full",gameDesignation:"none"}]};
 const ok=practice(sf,sfDoc,asOf);
 assert.equal(ok.officialTeamReport,true);
 assert.equal(ok.positiveGamedayActive,false);
 assert.equal(practice(sf,{...sfDoc,reports:[{...sfDoc.reports[0],
  sourceUrl:"https://www.chiefs.com/news/similar-player"}]},asOf).officialTeamReport,false);
 assert.equal(practice(sf,{...sfDoc,reports:[{...sfDoc.reports[0],
  reportDay:"2026-11-23"}]},asOf).officialTeamReport,false);
 assert.equal(practice(sf,{...sfDoc,reports:[sfDoc.reports[0],sfDoc.reports[0]]},asOf).officialTeamReport,false);
});

test("NFL independently archived official roster cannot be borrowed across game-envelope identities or invalid weeks",()=>{
 const badWeeks=["2026_0_ARI_KC","2026_00_ARI_KC","2026_23_ARI_KC",
  "2026_99_ARI_KC","2026_11_KC"];
 for(const gameId of badWeeks)
  assert.equal(evaluate({...p,gameId},{asOf}).status,"not_evaluable",gameId);
 const entries=["KC","ARI"].flatMap(team=>Array.from({length:47},(_,i)=>({
  gameId:p.gameId,team,gsisId:team==="KC"&&i===0?p.historicalPlayerId:
   "00-"+String((team==="KC"?1000000:2000000)+i).padStart(7,"0"),
  status:"active",sourcePlayerAndGSISExact:true,
  signedOrAuthenticatedOfficialPublication:true,
  sourceUrl:"https://www.nfl.com/games/official-roster"
 })));
 const roster={kind:"nfl_exact_official_game_day_active_roster_v1",
  gameId:"2026_11_OTHER_TEAM",capturedAt:"2026-11-22T14:32:00Z",
  firstGitCommittedAt:"2026-11-22T14:35:00Z",
  firstGitSourceVerified:true,fullGameRosterAuthenticated:true,entries};
 assert.equal(gameDay(p,roster,asOf).gameDayActiveVerified,false);
 assert.equal(gameDay(p,{...roster,gameId:p.gameId},asOf).gameDayActiveVerified,true);
});

test("original NFL player identity must refer to BOTH actual clubs and same season/week as the original game",()=>{
 const {officialGameKeyMatchesOriginal}=require("../src/nfl-point-in-time-readiness-v1.cjs");
 assert.equal(officialGameKeyMatchesOriginal(p),true);
 for(const change of [
  {team:"TEN"},{opponent:"DAL"},{week:12},{season:2025},
  {gameId:"2026_11_ARI_ARI"},{gameId:"2026_11_BOS_KC"},
  {gameId:"2026_00_ARI_KC"},{gameId:"2026_23_ARI_KC"},
  {team:"ARI",opponent:"ARI"}
 ]){
  const r={...p,...change};
  assert.equal(officialGameKeyMatchesOriginal(r),false,JSON.stringify(change));
  assert.equal(evaluate(r,{asOf}).bettingEligible,false);
  assert.equal(evaluate(r,{asOf}).status,"not_evaluable",JSON.stringify(change));
 }
 assert.equal(evaluate(p,{asOf}).status,"research_only_hold");
});
