"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeze,score}=require("../src/nfl-independent-forward-evidence.cjs");
const {reconcile}=require("../src/nfl-kicker-reconciled-appearances.cjs");
const t="2026-11-14T20:00:00Z",start="2026-11-15T18:00:00Z",policyAt="2026-11-14T19:00:00Z";
const schedule=[{game_id:"2026_10_BUF_NYJ",game_type:"REG",season:2026,week:10,gameday:"2026-11-15",gametime:"13:00",home_team:"NYJ",away_team:"BUF",home_score:10,away_score:21}];
const row={market:"passing_yards",historicalPlayerId:"p",gameId:schedule[0].game_id,team:"BUF",opponent:"NYJ",eventStartsAt:start,capturedAt:t,line:200.5,side:"Higher",tier:"Standard",probability:.7,probabilities:{higher:.7,lower:.3,push:0},projection:220,autoPickEligible:false};
test("independent forecast is frozen before kickoff; participation and exact final identity needed",()=>{
 const r={kind:"nfl_independent_standard_research_preview_v1",generatedAt:t,boardAt:t,completeScopedPagination:true,publicReleaseApproved:false,rows:[row]};
 const weeklyRows=[{player_id:"p",season:2026,week:10,recent_team:"BUF",passing_yards:230,attempts:25}];
 const s=freeze(r,{weeklyRows,schedule}),f={snapshot:s,firstCommittedAt:"2026-11-14T20:01:00Z",gitHistoryCount:1};
 assert.equal(s.rows.length,1);
 const o=score([f,f],{weeklyRows,schedule,policyAt});assert.equal(o.registered,1);assert.equal(o.resolved,1);assert.equal(o.correct,1);
 assert.ok(o.rawBrier<o.shrinkBrier);assert.equal(o.byTier.Standard.hypotheticalAlwaysHigherWins,1);assert.equal(o.byTier.Standard.hypotheticalAlwaysLowerWins,0);assert.ok(Number.isFinite(o.byTier.Standard.rawLogLoss));
 assert.equal(score([{...f,snapshot:{...s,rows:[s.rows[0],s.rows[0]]}}],{weeklyRows,schedule,policyAt}).registered,0);assert.equal(o.modelPromoted,false);
 assert.equal(score([{...f,firstCommittedAt:start}],{weeklyRows,schedule,policyAt}).registered,0);
 weeklyRows[0].attempts=0;assert.equal(score([f],{weeklyRows,schedule,policyAt}).pending,1);
});
test("zero attempt is a reconciled positive snap only, not an absent attempt row",()=>{
 const s={game_id:"g",season:2026,week:1,game_type:"REG",home_team:"A",away_team:"B",home_score:0,away_score:0};
 const inputs={schedule:[s],rosters:[{season:2026,week:1,team:"A",position:"K",pfr_id:"k",gsis_id:"id"}],
 snaps:[{season:2026,week:1,game_id:"g",team:"A",position:"K",pfr_player_id:"k",st_snaps:1}],kicks:[],
 teams:[{season:2026,week:1,team:"A",fg_att:0,pat_att:0}]};
 assert.equal(reconcile(inputs).rows[0].zeroAttempt,true);
 assert.equal(reconcile({...inputs,teams:[]}).rows.length,0);
 assert.equal(reconcile({...inputs,snaps:[]}).rows.length,0);
});
