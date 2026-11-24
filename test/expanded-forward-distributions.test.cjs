"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {priorContext,candidate,score}=require("../src/nhl-forward-expanded-market.cjs");
const nfl=require("../src/nfl-empirical-threshold-shadow.cjs");
test("expanded count projection excludes target-day stats and maintains mass",()=>{
 const players={};
 for(let d=1;d<=12;d++)for(let i=1;i<=36;i++){
  (players[i]??={games:[]}).games.push({gameId:2026020000+d,gameDate:"2026-11-"+String(d).padStart(2,"0"),playerId:i,team:i<=18?"BOS":"FLA",type:"skater",gameState:"OFF",timeOnIceSeconds:900,shotsOnGoal:2,goals:0,assists:1,points:1,hits:2,blockedShots:1,faceoffsWon:4});
 }
 const c=priorContext({players},"2026-11-13");
 for(const market of ["shotsOnGoal","goals","saves","assists","points","hits","blockedShots","faceoffsWon"]){assert.equal(c.league[market].length,24);assert.equal(c.team.BOS[market].length,12);assert.equal(c.team.FLA[market].length,12);}
 assert.equal(c.team.BOS.assists[0],18);assert.equal(c.team.BOS.faceoffsWon[0],72);
 for(const market of ["assists","points","hits","blockedShots","faceoffsWon"]){
  const v=candidate({playerId:1,market,opponent:"FLA",line:1.5},c);
  assert.ok(v);assert.ok(Math.abs(v.poisson.higher+v.poisson.lower+v.poisson.push-1)<.0001);
  assert.equal(v.modelPromoted,false);
 }
 assert.deepEqual(score([],{players},"2026-11-14T19:00:00Z").byTierAndMarket,{});
});
test("NFL exact-line empirical probabilities preserve push and future exclusion",()=>{
 const p={market:"receiving_yards",historicalPlayerId:"X",team:"KC",season:2026,week:10,line:50,historicalProjection:50,selectedSide:"Higher",sourceGameId:"g",eventStartsAt:"2026-11-15T20:00:00Z"};
 const rows=Array.from({length:9},(_,i)=>({player_id:"X",team:"KC",season:2026,week:i+1,receiving_yards:50,season_type:"REG"}));
 rows.push({...rows[0],week:10,receiving_yards:500});
 const c=nfl.candidate(p,rows,"2026-11-14T19:00:00Z");
 assert.equal(c.priorGames,9);assert.equal(c.probabilities.push,1);assert.equal(c.calibrated,false);
 assert.equal(nfl.candidate(p,rows,p.eventStartsAt),null);
 assert.equal(nfl.candidate(p,[...rows,rows[0]],"2026-11-14T19:00:00Z"),null);
});


test("expanded report has stable tier-and-market schema before policy commit",()=>{
 assert.deepEqual(score([],{},null).byTierAndMarket,{});
});
test("NFL optional threshold model accepts canonical regular season alias and abstains on missing history",()=>{
 const p={market:"receiving_yards",historicalPlayerId:"X",team:"KC",season:2026,week:10,line:50,historicalProjection:50,selectedSide:"Higher",sourceGameId:"g",eventStartsAt:"2026-11-15T20:00:00Z"};
 const rows=Array.from({length:9},(_,i)=>({player_id:"X",team:"KC",season:2026,week:i+1,receiving_yards:50,season_type:"REGULAR_SEASON"}));
 assert.equal(nfl.candidate(p,rows,"2026-11-14T19:00:00Z").priorGames,9);
 assert.equal(nfl.candidate(p,null,"2026-11-14T19:00:00Z"),null);
});
const sensitivity=require("../src/nhl-all-tier-probability-sensitivity.cjs");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
test("all tier calibration shadow preserves push mass, original side, and exact first Git provenance",()=>{
 const capturedAt="2026-11-14T18:58:00Z",generatedAt="2026-11-14T19:00:00Z",gameStartAt="2026-11-15T00:00:00Z";
 const selections=["Standard","Goblin","Demon"].map((tier,i)=>({tier,market:"shotsOnGoal",line:1.5+i*.5,gameId:2026020310,playerId:1,lean:"Higher",probability:.7,capturedAt,gameStartAt}));
 const s={individualPropSelectionPolicy:POLICY,generatedAt,individualPropSelections:selections,rankedProps:selections.map(o=>({...o,probabilities:{higher:.7,lower:.2,push:.1}}))};
 s.allTierProbabilitySensitivity=sensitivity.freeze(s);
 assert.equal(s.allTierProbabilitySensitivity.rows.length,3);
 for(const r of s.allTierProbabilitySensitivity.rows){
  assert.ok(Math.abs(r.shrunk.push-.1)<1e-8);
  assert.ok(r.shrunk.higher>r.shrunk.lower);
  assert.ok(Math.abs(r.shrunk.higher+r.shrunk.lower+r.shrunk.push-1)<1e-8);
 }
 const frame={snapshot:s,firstCommittedAt:"2026-11-14T19:02:00Z",gitHistoryCount:1};
 const history={players:{"1":{games:[{gameId:2026020310,playerId:1,gameDate:"2026-11-14",gameState:"OFF",timeOnIceSeconds:900,shotsOnGoal:2}]}}};
 const r=sensitivity.grade([frame],history,"2026-11-14T18:00:00Z");
 assert.equal(r.all.resolved,3);assert.equal(r.all.distinctGames,1);assert.equal(r.all.pushes,1);
 assert.equal(r.byTier.Goblin.pushes,1);assert.equal(r.byTier.Demon.resolved,1);
 assert.equal(r.calibrated,false);assert.equal(r.modelPromoted,false);
 assert.equal(sensitivity.grade([{...frame,gitHistoryCount:2}],history,"2026-11-14T18:00:00Z").all.resolved,0);
 assert.equal(sensitivity.grade([frame],history,generatedAt).all.resolved,0);
 assert.equal(sensitivity.grade([frame],{players:{}}, "2026-11-14T18:00:00Z").all.pending,3);
 s.allTierProbabilitySensitivity.rows[0].shrunk.higher=.99;
 assert.equal(sensitivity.grade([frame],history,"2026-11-14T18:00:00Z").all.resolved,0);
});
