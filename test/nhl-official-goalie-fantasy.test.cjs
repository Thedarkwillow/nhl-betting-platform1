"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {prizePicksGoalieFantasyScore,underdogGoalieFantasyScore}=
 require("../src/nhl-four-priority-markets.cjs");
const {goalieSummaryUrl,parseOfficialGoalieSummary,mergeOfficialGoalieFantasy}=
 require("../src/nhl-official-goalie-fantasy.cjs");
const {buildHistory}=require("../src/history.cjs");
const {buildFourPriorityShadow}=require("../src/nhl-four-priority-shadow.cjs");
const id=2026020264;
function payload(){
 return {id,gameDate:"2026-11-06",gameState:"OFF",
  homeTeam:{abbrev:"CGY"},awayTeam:{abbrev:"ANA"},
  playerByGameStats:{
   homeTeam:{forwards:[],defense:[],goalies:[{playerId:8481692,
    name:{default:"Test Starter"},saves:24,goalsAgainst:4,starter:true,
    decision:"L",shotsAgainst:28,toi:"58:52"}]},
   awayTeam:{forwards:[],defense:[],goalies:[{playerId:8480843,
     name:{default:"Test Early Starter"},saves:8,goalsAgainst:3,
     starter:true,shotsAgainst:11,toi:"20:00"},
    {playerId:8478024,name:{default:"Test Relief Winner"},saves:10,
     goalsAgainst:0,starter:false,decision:"W",shotsAgainst:10,toi:"39:40"}]}}};
}
function gameSummary(){
 return {total:3,data:[
  {gameId:id,playerId:8480843,gamesStarted:1,wins:0,
   shutouts:0,saves:8,goalsAgainst:3},
  {gameId:id,playerId:8481692,gamesStarted:1,wins:0,
   shutouts:0,saves:24,goalsAgainst:4},
  {gameId:id,playerId:8478024,gamesStarted:0,wins:1,
   shutouts:0,saves:10,goalsAgainst:0}]};
}
test("user PrizePicks formula: win +10, shutout +10, saves +0.3, goals against -2",()=>{
 const base={type:"goalie",goalieStarted:true,goalieOfficialWins:1,
  goalieOfficialShutouts:0,saves:30,goalsAgainst:2};
 assert.equal(prizePicksGoalieFantasyScore(base),15);
 assert.equal(prizePicksGoalieFantasyScore({...base,goalieOfficialShutouts:1,
  goalsAgainst:0}),29);
 assert.equal(prizePicksGoalieFantasyScore({...base,goalieOfficialWins:0,
  saves:23,goalsAgainst:3}),0.9);
 assert.equal(prizePicksGoalieFantasyScore({...base,goalieOfficialWins:0,
  goalieOfficialShutouts:1,goalsAgainst:0,saves:20}),16);
 assert.equal(underdogGoalieFantasyScore({...base,goalieDecision:"W"}),18);
});
test("zero goals allowed does not invent a shutout or winner, unknown bonus is null",()=>{
 const original={type:"goalie",goalieStarted:true,saves:29,goalsAgainst:0,
  goalieOfficialWins:null,goalieOfficialShutouts:null};
 assert.equal(prizePicksGoalieFantasyScore(original),null);
 assert.equal(prizePicksGoalieFantasyScore({...original,goalieOfficialWins:1}),null);
 assert.equal(prizePicksGoalieFantasyScore({...original,goalieOfficialWins:1,
  goalieOfficialShutouts:1,goalsAgainst:1}),null);
 assert.equal(prizePicksGoalieFantasyScore({...original,goalieOfficialWins:1,
  goalieOfficialShutouts:0,goalieStarted:false}),null);
 assert.equal(prizePicksGoalieFantasyScore({...original,goalieOfficialWins:1,
  goalieOfficialShutouts:0,saves:null}),null);
 assert.equal(prizePicksGoalieFantasyScore({...original,goalieOfficialWins:1,
  goalieOfficialShutouts:0,goalsAgainst:null}),null);
});
test("official source has win and shutout count, matches game and player exactly",()=>{
 const url=new URL(goalieSummaryUrl(id));
 assert.equal(url.hostname,"api.nhle.com");
 assert.equal(url.pathname,"/stats/rest/en/goalie/summary");
 assert.equal(url.searchParams.get("isGame"),"true");
 assert.equal(url.searchParams.get("cayenneExp"),"gameId="+id);
 assert.throws(()=>goalieSummaryUrl(1234),/Invalid official/);
 const summary=parseOfficialGoalieSummary(gameSummary(),{gameId:id});
 assert.equal(summary.get(8478024).goalieOfficialWins,1);
 assert.equal(summary.get(8480843).goalieOfficialShutouts,0);
});
test("historical source-matched goalie scores remain distinct between platforms",()=>{
 const a=normalizeBoxscore(payload());
 assert.equal(a.length,3);
 assert.equal(a.find(x=>x.playerId===8481692).prizePicksGoalieFantasyScore,null);
 const b=mergeOfficialGoalieFantasy(a,
  parseOfficialGoalieSummary(gameSummary(),{gameId:id}),{gameId:id});
 assert.equal(b.find(x=>x.playerId===8481692).prizePicksGoalieFantasyScore,-0.8);
 assert.equal(b.find(x=>x.playerId===8480843).prizePicksGoalieFantasyScore,-3.6);
 const relief=b.find(x=>x.playerId===8478024);
 assert.equal(relief.goalieOfficialWins,1);
 assert.equal(relief.goalieStarted,false);
 assert.equal(relief.prizePicksGoalieFantasyScore,null);
 assert.equal(relief.underdogGoalieFantasyScore,null);
 const starter=b.find(x=>x.playerId===8481692);
 assert.equal(starter.underdogGoalieFantasyScore,2.4);
 const h=buildHistory([{players:b,errors:[]}]);
 assert.equal(h.players["8481692"].rolling.all.prizePicksGoalieFantasyScore,-0.8);
 assert.equal(h.players["8478024"].rolling.all.prizePicksGoalieFantasyScore,null);
});
test("shutout is only added from official per-goalie report, not team outcome",()=>{
 const a=normalizeBoxscore(payload());
 const modified={...gameSummary(),data:gameSummary().data.map(x=>
  x.playerId===8481692?{...x,goalsAgainst:0,saves:24,shutouts:1,wins:1}:x)};
 const changed=a.map(x=>x.playerId===8481692?
  {...x,goalsAgainst:0,saves:24,goalieDecision:"W"}:x);
 const b=mergeOfficialGoalieFantasy(changed,
  parseOfficialGoalieSummary(modified,{gameId:id}),{gameId:id});
 assert.equal(b.find(x=>x.playerId===8481692).prizePicksGoalieFantasyScore,27.2);
});
test("inconsistent or truncated official goalie data fails closed",()=>{
 assert.throws(()=>parseOfficialGoalieSummary({total:5,data:[]},{gameId:id}),/Incomplete/);
 assert.throws(()=>parseOfficialGoalieSummary({total:1,data:[{
  playerId:123,gameId:id+1,gamesStarted:1,wins:1,shutouts:0,saves:25,goalsAgainst:2
 }]},{gameId:id}),/Invalid/);
 assert.throws(()=>parseOfficialGoalieSummary({total:1,data:[{
  playerId:123,gameId:id,gamesStarted:1,wins:1,shutouts:1,saves:25,goalsAgainst:1
 }]},{gameId:id}),/Invalid/);
 const official=parseOfficialGoalieSummary(gameSummary(),{gameId:id});
 const rows=normalizeBoxscore(payload());
 assert.throws(()=>mergeOfficialGoalieFantasy(rows.map(x=>x.playerId===8480843?
  {...x,saves:15}:x),official,{gameId:id}),/disagrees/);
 assert.throws(()=>mergeOfficialGoalieFantasy(rows.map(x=>x.playerId===8480843?
  {...x,goalieStarted:false}:x),official,{gameId:id}),/disagrees/);
});
test("new PrizePicks shadow stays non-playable and has no imputed hit rate",()=>{
 const p={playerId:44,type:"goalie",name:"Sample Goalie",team:"NYR",
  games:Array.from({length:9},(_,i)=>({gameId:id+i,
   gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
   prizePicksGoalieFantasyScore:i+10,underdogGoalieFantasyScore:i+5}))};
 const result=buildFourPriorityShadow({players:{"44":p}},
  {asOf:"2026-11-07T09:00:00Z"});
 const s=result.players["44"].projections.prizePicksGoalieFantasyScore;
 assert.equal(s.readyForResearch,true);
 assert.equal(s.readyForLivePicks,false);
 assert.equal(s.higherProbability,null);
 assert.equal(result.prizePicksNhlGoalieFantasyScoringVerified,false);
 assert.equal(result.prizePicksGoalieFantasyFormulaImplemented,true);
 assert.equal(result.verifiedHitRate,null);
 assert.equal(result.originalPlatformOffersAuthenticated,false);
});

test("negative historical goalie fantasy scores count as real games, not missing data",()=>{
 const p={playerId:55,type:"goalie",name:"Signed Score Goalie",team:"ANA",
  games:Array.from({length:8},(_,i)=>({
   gameId:id+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
   prizePicksGoalieFantasyScore:i%2===0?-3:5,
   underdogGoalieFantasyScore:i%2===0?-4:8}))};
 const a=buildFourPriorityShadow({players:{"55":p}},
  {asOf:"2026-11-07T09:00:00Z"});
 const pp=a.players["55"].projections.prizePicksGoalieFantasyScore;
 const ud=a.players["55"].projections.underdogGoalieFantasyScore;
 assert.equal(pp.observations,8);
 assert.equal(pp.readyForResearch,true);
 assert.equal(pp.seasonMean,1);
 assert.equal(ud.observations,8);
 assert.equal(ud.seasonMean,2);
 assert.equal(a.sourceSampleCoverage.prizePicksGoalieFantasyScore.eligiblePlayers,1);
 assert.equal(a.sourceSampleCoverage.underdogGoalieFantasyScore.eligiblePlayers,1);
 assert.equal(pp.readyForLivePicks,false);
});
