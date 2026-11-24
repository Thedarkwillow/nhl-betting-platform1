"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {officialTOISeconds,underdogGoalieFantasyScore,
 normalizePriorityBoxscoreFields}=require("../src/nhl-four-priority-markets.cjs");
const {buildHistory}=require("../src/history.cjs");
const {buildFourPriorityShadow,projectFourPriorityMarkets}=
 require("../src/nhl-four-priority-shadow.cjs");
function boxscore(){
 return {id:2026020264,gameDate:"2026-11-06",gameState:"OFF",
  homeTeam:{abbrev:"BOS"},awayTeam:{abbrev:"TOR"},
  playerByGameStats:{homeTeam:{forwards:[{playerId:1,name:{default:"A. Player"},
   goals:0,assists:1,points:1,sog:3,blockedShots:1,hits:5,
   faceoffWinningPctg:0.6,toi:"19:37"}],defense:[],goalies:[{
   playerId:2,name:{default:"B. Goalie"},saves:29,shotsAgainst:31,
   goalsAgainst:2,decision:"W",starter:true,toi:"60:00"}]},
   awayTeam:{forwards:[],defense:[],goalies:[]}}};
}
test("official boxscore extracts hits and TOI without guessing faceoff wins from pct",()=>{
 const [s,g]=normalizeBoxscore(boxscore());
 assert.equal(s.hits,5);
 assert.equal(s.timeOnIceSeconds,1177);
 assert.equal(s.faceoffsWon,null);
 assert.equal(s.regulationTimeOnIceSeconds,null);
 assert.equal(g.timeOnIceSeconds,3600);
 assert.equal(g.goalieDecision,"W");
 assert.equal(g.goalieStarted,true);
 assert.equal(g.goalsAgainst,2);
 assert.equal(g.underdogGoalieFantasyScore,17.4); // 6 + 29*.6 - 2*3
 assert.equal(s.underdogGoalieFantasyScore,null);
});
test("exact authoritative faceoff-win counts are recognized, absent counts stay null",()=>{
 const p={toi:"14:32",hits:0,faceOffWins:8,faceoffWinningPctg:0.42};
 const r=normalizePriorityBoxscoreFields(p);
 assert.equal(r.faceoffsWon,8);
 assert.equal(r.hits,0);
 assert.equal(officialTOISeconds("14:32"),872);
 for(const s of ["14:60","abc","14:32:00","-5:00",null])
  assert.equal(officialTOISeconds(s),null);
 assert.equal(normalizePriorityBoxscoreFields({faceoffWinningPctg:100}).faceoffsWon,null);
});
test("provider fantasy score strictly requires Underdog original rule components",()=>{
 const g={type:"goalie",goalieStarted:true,goalieDecision:"W",
  saves:29,goalsAgainst:2};
 assert.equal(underdogGoalieFantasyScore(g),17.4);
 assert.equal(underdogGoalieFantasyScore({...g,goalieStarted:false}),null);
 assert.equal(underdogGoalieFantasyScore({...g,goalieDecision:null}),null);
 assert.equal(underdogGoalieFantasyScore({...g,goalsAgainst:null}),null);
 assert.equal(underdogGoalieFantasyScore({...g,goalieDecision:"O"}),11.4);
 assert.equal(underdogGoalieFantasyScore({...g,saves:-1}),null);
});
test("canonical player history retains exact missing and nonzero priority markets",()=>{
 const data=boxscore(),rows=normalizeBoxscore(data);
 const h=buildHistory([{players:rows,errors:[]}]);
 assert.equal(h.players["1"].rolling.all.hits,5);
 assert.equal(h.players["1"].rolling.all.faceoffsWon,null);
 assert.equal(h.players["1"].rolling.all.timeOnIceSeconds,1177);
 assert.equal(h.players["2"].rolling.all.underdogGoalieFantasyScore,17.4);
});
test("market projections use strictly previous UTC game dates and require eight samples",()=>{
 const g=Array.from({length:9},(_,i)=>({gameId:2026020000+i,
  gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  hits:2+i,faceoffsWon:5+i,timeOnIceSeconds:900+60*i}));
 g.push({gameId:2026020264,gameDate:"2026-11-07",
  hits:999,faceoffsWon:999,timeOnIceSeconds:36000});
 const p={playerId:123,name:"Center",team:"BOS",type:"skater",games:g};
 const result=projectFourPriorityMarkets(p,"2026-11-07T01:00:00Z");
 assert.equal(result.projections.hits.readyForResearch,true);
 assert.equal(result.projections.faceoffsWon.readyForResearch,true);
 assert.equal(result.projections.timeOnIceSeconds.readyForResearch,true);
 assert.equal(result.projections.hits.observations,9);
 assert.equal(result.projections.hits.higherProbability,null);
 assert.equal(result.projections.timeOnIceSeconds.unit,"minutes");
 assert.ok(result.projections.timeOnIceSeconds.projection<25);
 assert.equal(result.projections.hits.readyForLivePicks,false);
 const minimal=projectFourPriorityMarkets({...p,games:g.slice(0,6)},
  "2026-11-07T01:00:00Z");
 assert.equal(minimal.projections.hits.projection,null);
 assert.equal(minimal.projections.hits.readyForResearch,false);
});
test("unverified faceoff counts and Underdog non-OT TOI cannot be invented",()=>{
 const p={playerId:22,type:"skater",games:Array.from({length:12},(_,i)=>({
  gameDate:"2026-10-"+String(i+1).padStart(2,"0"),gameId:i,
  hits:2,timeOnIceSeconds:1200,faceoffWinningPctg:0.9,
  faceoffsWon:null}))};
 const res=projectFourPriorityMarkets(p,"2026-11-07T08:00:00Z");
 assert.equal(res.projections.faceoffsWon.observations,0);
 assert.equal(res.projections.faceoffsWon.projection,null);
 assert.match(res.projections.timeOnIceSeconds.sourceRule,/Underdog TOI excludes OT/);
 const sample=buildFourPriorityShadow({players:{"22":p}},
  {asOf:"2026-11-07T08:00:00Z"});
 assert.equal(sample.productionChampionChanged,false);
 assert.equal(sample.liveLineupsChanged,false);
 assert.equal(sample.prizePicksNhlGoalieFantasyScoringVerified,false);
 assert.equal(sample.sourceSampleCoverage.hits.eligiblePlayers,1);
 assert.equal(sample.sourceSampleCoverage.faceoffsWon.eligiblePlayers,0);
});
test("goalie fantasy model cannot train without verified starter decision, saves, goals against",()=>{
 const p={playerId:33,type:"goalie",games:Array.from({length:8},(_,i)=>({
  gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  underdogGoalieFantasyScore:10+i}))};
 const s=projectFourPriorityMarkets(p,"2026-11-07T08:00:00Z");
 assert.equal(s.projections.underdogGoalieFantasyScore.observations,8);
 assert.ok(s.projections.underdogGoalieFantasyScore.projection>10);
 assert.equal(s.projections.underdogGoalieFantasyScore.higherProbability,null);
 assert.equal(s.projections.underdogGoalieFantasyScore.originalPlatformSettlementVerified,false);
});
