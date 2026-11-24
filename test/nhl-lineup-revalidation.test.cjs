"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {revalidateResearchLineups}=
 require("../src/nhl-lineup-revalidation.cjs");
const at="2026-11-05T18:00:00Z",captured="2026-11-05T17:59:00Z",
 start="2026-11-05T20:00:00Z";
const a={gameId:2026020301,playerId:111,market:"shotsOnGoal",
 line:2.5,tier:"Standard",lean:"Higher",eventStartsAt:start};
const b={gameId:2026020302,playerId:222,market:"points",
 line:0.5,tier:"Standard",lean:"Lower",eventStartsAt:start};
const previous={generatedAt:"2026-11-05T17:20:00Z",
 lineups:{"2":{picks:[a,b]}}};
const current={generatedAt:captured,rankedProps:[a,b]};
test("source-equivalent newly complete fresh board keeps unchanged lineup only as research",()=>{
 const r=revalidateResearchLineups(previous,current,{now:at,newBoardComplete:true});
 assert.equal(r.bySize["2"].state,"compatible_with_current_research_not_original_platform_verified");
 assert.equal(r.compatibleLineups,1);
 assert.equal(r.invalidatedLineups,0);
 assert.equal(r.proposedWagerActions,0);
});
test("moved line invalidates old recommendation and requires a new model run",()=>{
 const r=revalidateResearchLineups(previous,{...current,
  rankedProps:[{...a,line:3.5},b]},{now:at,newBoardComplete:true});
 assert.equal(r.bySize["2"].state,"invalidate_and_reoptimize");
 assert.equal(r.changedLines,1);
 assert.equal(r.invalidatedLineups,1);
 assert.equal(r.newLineupModelRunRequiredForChange,true);
 assert.equal(r.originalPublishedPredictionHistoryUnmodified,true);
});
test("changed original tier and changed selected direction invalidate previous lineup",()=>{
 const r=revalidateResearchLineups(previous,{...current,
  rankedProps:[{...a,tier:"Goblin"},{...b,lean:"Higher"}]},
  {now:at,newBoardComplete:true});
 assert.deepEqual(r.bySize["2"].reasons,[
  "tier_not_seen_on_new_independent_snapshot",
  "previous_model_direction_not_in_new_research"
 ]);
 assert.equal(r.changedTiers,1);
 assert.equal(r.changedDirections,1);
});
test("missing independent offer is unverified non-observation, never platform removal",()=>{
 const r=revalidateResearchLineups(previous,{...current,rankedProps:[b]},
  {now:at,newBoardComplete:true});
 assert.equal(r.newlyUnmatchedQuotes,1);
 assert.ok(r.bySize["2"].reasons.includes("not_seen_in_new_independent_snapshot_unverified_removal"));
 assert.equal(r.providerNotSeenIsNotAuthenticatedPlatformRemoval,true);
});
test("stale or partial comparison requires new fresh capture rather than false line removal",()=>{
 for(const o of [{newBoardComplete:false},{sourceSame:false},
  {now:"2026-11-05T19:40:00Z",newBoardComplete:true}]){
  const r=revalidateResearchLineups(previous,{...current,rankedProps:[]},o);
  assert.equal(r.bySize["2"].state,"needs_new_capture");
  assert.equal(r.newlyUnmatchedQuotes,0);
  assert.equal(r.needFreshIndependentCapture,1);
 }
});
test("started or imminent NHL games invalidate even with a stale provider snapshot",()=>{
 const r=revalidateResearchLineups(previous,current,{
  now:"2026-11-05T19:55:00Z",newBoardComplete:false});
 assert.equal(r.invalidatedLineups,1);
 assert.equal(r.startedOrImminentGames,2);
 assert.ok(r.bySize["2"].reasons.includes("started_or_imminent_game"));
 assert.throws(()=>revalidateResearchLineups(previous,current,{now:"bad"}),/Invalid/);
});

test("fresh NHL official published injury invalidates unchanged research lineup",()=>{const preview={kind:"nhl_league_published_pregame_status_v1",capturedAt:captured,sources:[{gameId:a.gameId,url:"https://www.nhl.com/news/exact"}],rows:[{gameId:a.gameId,playerId:a.playerId,team:"BOS",eventStartsAt:start,reportedAt:captured,status:"injured"}]};const prior={...previous,lineups:{"2":{picks:[{...a,team:"BOS",opponent:"NYR"},b]}}},newBoard={...current,rankedProps:[{...a,team:"BOS",opponent:"NYR"},b]};const x=revalidateResearchLineups(prior,newBoard,{now:at,newBoardComplete:true,officialPreview:preview});assert.equal(x.officialPreviewInjuryBlocks,1);assert.equal(x.bySize["2"].state,"invalidate_and_reoptimize");assert.ok(x.bySize["2"].reasons.includes("official_preview_injury_or_scratch_requires_abstention"));});
