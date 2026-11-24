"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {projectPlayer}=require("../src/projections.cjs");
const {candidateMeans,collectOfficialSeasons,evaluateOfficialHistory,evaluateSeasonLab}=require("../src/nhl-season-model-lab.cjs");
const makeGames=(season,start,count,actualAt={})=>Array.from({length:count},(_,i)=>{
 const yy=season==="2024-25"?"2024":"2025";
 return {gameId:Number(yy+"020"+String(start+i).padStart(3,"0")),
  gameDate:season==="2024-25"?"2025-02-"+String(i+1).padStart(2,"0"):"2026-01-"+String(i+1).padStart(2,"0"),
  season,shotsOnGoal:actualAt[i]??(i%3+1),goals:0,assists:0,points:0,blockedShots:2,saves:null};
});
test("shadow challenger dampens a short recent spike but preserves champion output",()=>{
 const vals=[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,10];
 const player={playerId:1,type:"skater",name:"Example",team:"BOS",
  games:vals.map((n,i)=>({gameId:i+1,gameDate:"2026-01-"+String(i+1).padStart(2,"0"),shotsOnGoal:n,
   goals:0,assists:0,points:0,blockedShots:1}))};
 const champion=projectPlayer(player),shadow=projectPlayer(player,{model:"stable-shrink-v2"}),
  prior=projectPlayer(player,{model:"prior-mean-v2"});
 assert.equal(champion.model,"weighted-form-v1");
 assert.equal(shadow.model,"stable-shrink-v2");
 assert.equal(prior.model,"prior-mean-v2");
 assert.equal(prior.projections.shotsOnGoal.estimate,1.563);
 assert.ok(shadow.projections.shotsOnGoal.estimate<champion.projections.shotsOnGoal.estimate);
 assert.equal(champion.projections.shotsOnGoal.ready,true);
 assert.throws(()=>projectPlayer(player,{model:"not-supported"}),/Unsupported/);
 assert.equal(candidateMeans(vals)["weighted-form-v1"]>candidateMeans(vals)["stable-shrink-v2"],true);
});
test("two-season preparation is stat-only, deduplicated and season-specific",()=>{
 const a=makeGames("2024-25",1,7),b=makeGames("2025-26",1,7);
 const input={reference2024:{players:{"1":{status:"verified_games",games:a}}},
  officialLogs:{logs:{"1":b}}};
 const x=collectOfficialSeasons(input);
 assert.equal(x.sourceCounts.season2024Games,7);
 assert.equal(x.sourceCounts.season2025Games,7);
 assert.equal(x.players["1"].length,14);
 assert.equal(x.players["1"][0].gameDate,"2025-02-01");
 assert.equal(x.players["1"].at(-1).gameDate,"2026-01-07");
});
test("all forecasts are made before their player-game actual and selection uses 2024 only",()=>{
 const a=makeGames("2024-25",1,9),b=makeGames("2025-26",1,8);
 const input={"1":[...a,...b]},rows=evaluateOfficialHistory(input);
 const expectedFirst=rows.find(r=>r.gameId===a[5].gameId&&r.market==="shotsOnGoal");
 assert.equal(expectedFirst.priorGames,5);
 const priorFive=a.slice(0,5).map(x=>x.shotsOnGoal);
 assert.equal(expectedFirst.candidates["prior-mean"],priorFive.reduce((x,y)=>x+y,0)/5);
 const initial=evaluateSeasonLab({players:input,sourceCounts:{}});
 const corrupted=JSON.parse(JSON.stringify(input));
 corrupted["1"].at(-1).shotsOnGoal=9999;
 const changed=evaluateSeasonLab({players:corrupted,sourceCounts:{}});
 assert.equal(initial.byMarket.shotsOnGoal.selectedOn2024Only,changed.byMarket.shotsOnGoal.selectedOn2024Only);
 assert.equal(rows.filter(r=>r.season==="2024-25"&&r.market==="shotsOnGoal").length,4);
 assert.equal(initial.championUnchanged,true);
 assert.equal(initial.prospectiveVerified,false);
 assert.equal(initial.byMarket.shotsOnGoal.eligibleToDeploy,false);
});
test("rejects duplicate official player-games",()=>{
 const a=makeGames("2024-25",1,7);
 assert.throws(()=>evaluateOfficialHistory({"1":[a[0],a[0]]}),/Duplicate official game/);
});
