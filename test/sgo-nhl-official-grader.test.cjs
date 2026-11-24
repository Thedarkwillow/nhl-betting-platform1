"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {gradeGame,backtest,normalizeName,tally}=require("../src/sgo-nhl-official-grader.cjs");
const {decodeOfficial,validateCached,requestFinalBoxscore}=require("../scripts/grade-sgo-nhl-full-game-history.cjs");
const gameId=2026020231,gameStart="2026-11-02T01:00:00Z";
const game={id:gameId,home:"ANA",away:"OTT",season:"2026-27",startTimeUTC:gameStart};
function rawOfficial(){
 return {id:gameId,gameDate:"2026-11-01",gameState:"OFF",
  homeTeam:{abbrev:"ANA"},awayTeam:{abbrev:"OTT"},
  playerByGameStats:{awayTeam:{forwards:[{
   playerId:8476925,name:{default:"Example Skater"},goals:1,assists:2,points:3,
   sog:4,blockedShots:2}],defense:[],goalies:[]},
   homeTeam:{forwards:[],defense:[],goalies:[{
    playerId:8481001,name:{default:"Example Goalie"},saves:25,shotsAgainst:26}]}}};
}
const prop=(market,line,player="Example Skater",book="prizepicks")=>({
 book,season:"2026-27",officialGameId:gameId,gameStartAt:gameStart,
 player,providerPlayerId:player.toUpperCase().replaceAll(" ","_")+"_1_NHL",
 market,statID:market,line,closeField:"closeOverUnder",sourceGameMatched:true,
 originalOfferVerified:false
});
test("decodes NHL official complete boxscore without using provider values",()=>{
 const d=decodeOfficial(game,rawOfficial());
 assert.equal(validateCached(game,d),true);
 assert.equal(d.players.length,2);
 assert.equal(d.players.find(x=>x.type==="skater").shotsOnGoal,4);
 assert.equal(d.players.find(x=>x.type==="goalie").saves,25);
 assert.equal(d.source,"Official NHL gamecenter final boxscore");
 assert.throws(()=>decodeOfficial(game,{...rawOfficial(),gameState:"LIVE"}),/not final/);
 assert.throws(()=>decodeOfficial(game,{...rawOfficial(),id:6}),/disagrees/);
});
test("normalizes names safely and excludes unknown and ambiguous player identity",()=>{
 assert.equal(normalizeName("Tim Stützle"),normalizeName("Tim Stutzle"));
 const doc=decodeOfficial(game,rawOfficial());
 const r=gradeGame([prop("goals",.5),prop("assists",2),prop("shotsOnGoal",4.5),
  prop("blockedShots",1.5),prop("points",2.5),
  prop("saves",24.5,"Example Goalie","underdog"),
  prop("goals",0.5,"Unknown Guy")],doc);
 assert.equal(r.graded.length,6);
 assert.equal(r.excluded.length,1);
 assert.equal(r.excluded[0].reason,"player_missing_from_official_boxscore");
 assert.deepEqual(r.graded.map(x=>x.result),
  ["Higher","Push","Lower","Higher","Higher","Higher"]);
 assert.ok(r.graded.every(x=>x.originalProviderOfferVerified===false));
 assert.ok(r.graded.every(x=>x.originalPlatformSettlementVerified===false));
 assert.ok(r.graded.every(x=>x.prizePicksDnpRebootVerified===false));
 assert.ok(r.graded.every(x=>x.originalScoringPartnerSnapshotVerified===false));
 assert.ok(r.graded.every(x=>x.periodScope==="full_game_only"));
 assert.ok(r.graded.every(x=>x.officialPlayerIdentityMatchedByExactNormalizedName===true));
 const bad=structuredClone(doc);bad.players.push({...bad.players[0],playerId:12345});
 assert.equal(gradeGame([prop("goals",.5)],bad).graded.length,0);
});
test("matches NHL abbreviated first name only when initial+surname uniquely identifies a player",()=>{
 const d=decodeOfficial(game,rawOfficial());
 d.players[0].name="E. Skater";
 d.players[1].name="E. Goalie";
 const rows=gradeGame([prop("goals",0.5),prop("saves",24.5,"Example Goalie","underdog")],d);
 assert.equal(rows.graded.length,2);
 assert.ok(rows.graded.every(r=>r.officialPlayerIdentityMatchedByUniqueInitialSurname));
 assert.ok(rows.graded.every(r=>r.officialPlayerIdentityMatchedByExactNormalizedName===false));
 // A same-initial/surname collision must NEVER be resolved by guessing.
 d.players.push({...d.players[0],playerId:9876});
 const ambiguous=gradeGame([prop("goals",0.5)],d);
 assert.equal(ambiguous.graded.length,0);
 assert.equal(ambiguous.excluded[0].reason,"ambiguous_official_player_identity");
});
test("refuses in-game current line as retrospective close, invalid market, and unverified games",()=>{
 const doc=decodeOfficial(game,rawOfficial());
 const a=prop("goals",.5);a.closeField="overUnder";
 const b=prop("goals",.5);b.sourceGameMatched=false;
 const c=prop("madeUpMarket",.5);
 const d=prop("goals",.5);d.officialGameId=999;
 const r=gradeGame([a,b,c,d],doc);
 assert.equal(r.graded.length,0);
 assert.equal(r.excluded.length,4);
});
test("retrospective replay requires five STRICTLY earlier official game logs",()=>{
 const events=[],graded=[];
 for(let i=0;i<8;i++){
  const dt="2026-10-"+String(i+11).padStart(2,"0")+"T01:00:00Z";
  events.push({gameId:110+i,gameStartAt:dt,gameDate:dt.slice(0,10),
   players:[{playerId:123,name:"Example Skater",type:"skater",shotsOnGoal:3,
    goals:1,assists:0,points:1,blockedShots:1,saves:null}]});
  graded.push({book:"prizepicks",season:"2026-27",gameId:110+i,
   gameStartAt:dt,playerId:123,playerName:"Example Skater",
   market:"shotsOnGoal",line:2.5,actual:3,result:"Higher"});
 }
 // Artificially add the later boxscore as a source: replay must still use only 5, then 6, then 7.
 const r=backtest(graded,events);
 assert.equal(r.evaluated,3);
 assert.deepEqual(r.decisions.map(x=>x.priorGames),[5,6,7]);
 assert.equal(r.excluded.insufficient_prior_games,5);
 assert.equal(r.byBookSeason["prizepicks|2026-27"].evaluated,3);
 assert.equal(r.prospectiveVerified,false);
 assert.equal(r.payoutVerified,false);
 assert.equal(r.byBookSeason["prizepicks|2026-27"].baselineAlwaysLower,0);
});
test("groups Higher/Lower/Push outcomes without misrepresenting them as hit rates",()=>{
 const d=decodeOfficial(game,rawOfficial());
 const x=gradeGame([prop("goals",.5),prop("goals",1),prop("goals",1.5)],d).graded;
 const t=tally(x,r=>r.book+"|"+r.market);
 assert.deepEqual(t["prizepicks|goals"],{
  lines:3,higher:1,lower:1,push:1,distinctGames:1,
  modelHitRate:null,tiersVerified:false});
});
test("official boxscore network request avoids any sportsbook key or secret",async()=>{
 let url=null,opts=null;
 const result=await requestFinalBoxscore(game,async(u,o)=>{
  url=u;opts=o;return {ok:true,json:async()=>rawOfficial()};
 });
 assert.equal(result.gameId,gameId);
 assert.equal(url,"https://api-web.nhle.com/v1/gamecenter/"+gameId+"/boxscore");
 assert.ok(!JSON.stringify(opts).includes("SPORTSGAMEODDS"));
});
