"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizePrizePicksOddsApiEvent}=
 require("../src/nhl-oddsapi-prizepicks-backup.cjs");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const {resolveSchedule}=require("../scripts/build-free-nhl-research.cjs");
const {applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const {selectIndividualProps,POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const {frozenSelectionReadiness}=require("../src/nhl-prospective-freeze-readiness.cjs");
const {verifyFrozenCommit}=require("../src/nhl-frozen-commit-verifier.cjs");
const now="2026-11-05T17:45:00Z",start="2026-11-05T20:00:00Z",
 observed="2026-11-05T17:44:00Z",captured="2026-11-05T17:45:00Z";
const game={id:2026020302,home:"BOS",away:"NYR",startTimeUTC:start},
 schedule={complete:true,games:[game]};
const projections={builtAt:"2026-11-05T17:40:00Z",model:"weighted-form-v1",players:{
 "1":{playerId:111,name:"Example Skater",team:"BOS",type:"skater",
 latestGameDate:"2026-11-03",
 projections:{shotsOnGoal:{ready:true,estimate:3.6,observations:16,last5:3.7,last10:3.4}}}
}};
const event={id:"source-event-1",home_team:"Boston Bruins",
 away_team:"New York Rangers",commence_time:start,
 bookmakers:[{key:"prizepicks",markets:[
 {key:"player_shots_on_goal",last_update:observed,
 outcomes:[{name:"Over",description:"Example Skater",point:2.5,price:-119},
 {name:"Under",description:"Example Skater",point:2.5,price:-121}]},
 {key:"player_shots_on_goal_alternate",last_update:observed,
 outcomes:[{name:"Over",description:"Example Skater",point:3.5,price:100}]}
 ]}]};
async function modelAndFreeze(projection=projections,doc=event){
 const normalized=normalizePrizePicksOddsApiEvent(doc,schedule,projection,now);
 const board={schemaVersion:1,generatedAt:captured,provider:"The Odds API",
 sourceScope:"verified_selected_events",completePagination:true,
 fullNhlBoardCoverageVerified:false,
 rows:normalized.rows.filter(x=>x.tier==="Standard")};
 const r=buildFreeNhlResearch(board,projection,now);
 // No network connection required: precommitted official schedule only.
 await resolveSchedule(r,{cached:schedule,client:async()=>{throw Error("offline fixture")}});
 r.rankedProps=r.rankedProps.map(p=>applyPregameSignal(p,null,r.generatedAt));
 const selected=selectIndividualProps(r.rankedProps);
 r.individualPropSelectionPolicy=POLICY;
 r.individualPropSelections=selected.selected;
 return {r,normalized,selected};
}
test("provider odds -> supported NHL prop -> official identity -> one original pregame selection -> Git proof",async()=>{
 const {r,normalized,selected}=await modelAndFreeze();
 assert.equal(normalized.rows.length,3);
 assert.equal(r.matchedRows,2); // alternate is NOT guessed as a Standard tier
 assert.equal(r.boardCoverageComplete,false);
 assert.equal(r.captureScopeComplete,true);
 assert.equal(r.sourceScope,"verified_selected_events");
 assert.equal(r.gameIdentityResolved,2);
 assert.equal(r.rankedProps.every(x=>x.gameId===game.id),true);
 assert.equal(selected.selected.length,1);
 assert.equal(selected.selected[0].gameStartAt,start);
 assert.equal(selected.selected[0].model,"weighted-form-v1");
 assert.equal(selected.selected[0].tier,"Standard");
 assert.equal(r.rankedProps.every(x=>x.provider==="The Odds API"),true);
 assert.equal(r.rankedProps.every(x=>x.originalFantasyPlatformAuthenticated===false),true);
 const gate=frozenSelectionReadiness({research:r,now:"2026-11-05T17:46:00Z"});
 assert.equal(gate.ready,true,JSON.stringify(gate.reasons));
 const result=verifyFrozenCommit({research:r,snapshot:r,
  gitCommittedAt:"2026-11-05T17:47:00Z",gitHistoryCount:1,officialGames:[game]});
 assert.equal(result.verified,true,JSON.stringify(result.audit));
 assert.equal(result.originalPlatformOfferAuthenticated,false);
 assert.equal(result.prospectiveOutcomesGraded,0);
});
test("backup cannot claim a verified prospective cohort after puckdrop or without a supported side",async()=>{
 const {r}=await modelAndFreeze();
 assert.equal(verifyFrozenCommit({research:r,snapshot:r,
  gitCommittedAt:"2026-11-05T20:01:00Z",gitHistoryCount:1,
  officialGames:[game]}).verified,false);
 const noMarket={...event,bookmakers:[{key:"prizepicks",markets:[{
  key:"player_time_on_ice",last_update:observed,
  outcomes:[{name:"Over",description:"Example Skater",point:16.5,price:-110}]
 }]}]};
 const empty=await modelAndFreeze(projections,noMarket);
 assert.equal(empty.r.matchedRows,0);
 assert.equal(empty.selected.selected.length,0);
 assert.equal(frozenSelectionReadiness({research:empty.r,now}).ready,false);
});
test("independent vendor prop identity mismatch is never salvaged by opponent-only guess",async()=>{
 const wrong={...event,home_team:"Toronto Maple Leafs"};
 const x=await modelAndFreeze(projections,wrong);
 assert.equal(x.normalized.rows.length,0);
 assert.equal(x.r.gameIdentityResolved,0);
 assert.equal(x.selected.selected.length,0);
});
