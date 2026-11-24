"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),c=require("../src/nba-research-pipeline-v1.cjs"),{COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const now="2026-11-24T17:00:00Z",start="2026-11-25T01:00:00Z";
function sample(){
 const headers=["PLAYER_ID","PLAYER_NAME","TEAM_ABBREVIATION","GAME_ID","GAME_DATE","MATCHUP","WL","MIN","PTS","REB","AST","FG3M","STL","BLK","TOV"],rowSet=[];
 for(let j=1;j<=16;j++)for(let i=0;i<10;i++){
  const team=i<5?"BOS":"WAS",op=i<5?"WAS":"BOS";
  rowSet.push([i+1,"Player "+i,team,"002260"+String(j).padStart(4,"0"),"2026-11-"+String(j).padStart(2,"0"),team+(i<5?" vs. ":" @ ")+op,i<5?"W":"L",25,j%10+10,5,3,2,1,0,2]);
 }
 return {resultSets:[{name:"LeagueGameLog",headers,rowSet}]};
}
function history(){return c.indexHistory([c.normalizeLogs(sample(),"2026-27",now)]);}
test("historical NBA appearances and combo counts, no fabricated final time",()=>{
 const a=c.normalizeLogs(sample(),"2026-27",now);assert.equal(a.gameCount,16);assert.equal(a.rows.length,160);assert.equal(a.seasonCompletenessVerified,false);assert.equal(a.officialFinalClockVerified,false);assert.equal(a.rows[0].pointsReboundsAssists,a.rows[0].points+8);
 const d=sample();d.resultSets[0].rowSet.push(d.resultSets[0].rowSet[0]);assert.throws(()=>c.normalizeLogs(d,"2026-27",now));
});
test("past only projection excludes target date and does not certify availability",()=>{
 const h=history(),p={playerId:1,team:"BOS",opponent:"WAS",market:"points",line:14.5};
 assert.equal(c.project(h,p,"2026-11-12"),null);
 const x=c.project(h,p,"2026-11-17");assert.equal(x.priorGames,16);assert.equal(x.availabilityConfirmed,false);assert.ok(x.higher>0&&x.higher<1);
 assert.equal(c.project(h,{...p,line:14},"2026-11-17"),null);
 const b=c.backtest(h);assert.equal(b.actualHistoricalOffers,false);assert.equal(b.prospectiveCalibrationApproved,false);
});
test("board exact game, name, team, line and side; unknown access rejected",()=>{
 const h=history(),sc={games:[{gameId:22609999,startAt:start,home:"BOS",away:"WAS",status:1}]},r={projectionId:"a",providerPlayerId:"p",player:"Player 0",team:"BOS",opponent:"WAS",eventStartsAt:start,market:"Points",line:14.5,tier:"standard",offeredWagerTypes:"under_or_over",lineUpdatedAt:now,status:"pre_game",period:"Full"};
 const b={capturedAt:now,completePagination:true,rows:[COLUMNS.map(k=>r[k])]};const a=c.board(b,h,sc,now);assert.equal(a.length,2);
 const ranked=c.rankings(a,h,sc,[],[],now);assert.equal(ranked.length,1);assert.ok(ranked.every(x=>x.highConfidenceEligible===false&&x.injuryStatus==="unknown_or_not_confirmed"));
 r.offeredWagerTypes=null;b.rows=[COLUMNS.map(k=>r[k])];assert.equal(c.board(b,h,sc,now).length,0);
});
test("two sides and two exact books required; no match to another line",()=>{
 const ev={leagueID:"NBA",eventID:"x",status:{startsAt:start},teams:{home:{names:{long:"Boston Celtics",short:"BOS"}},away:{names:{long:"Washington Wizards",short:"WAS"}}},players:{p:{name:"Player 0"}},odds:{}};
 for(const side of ["over","under"])ev.odds[side]={statID:"points",playerID:"p",periodID:"game",betTypeID:"ou",sideID:side,byBookmaker:Object.fromEntries(["draftkings","fanduel"].map(b=>[b,{available:true,lastUpdatedAt:now,overUnder:14.5,odds:-110}]))};
 const q=c.oddsPairs({data:[ev]},now),sc={games:[{gameId:1,home:"BOS",away:"WAS"}]},p={gameId:1,player:"Player 0",market:"points",line:14.5,gameStartAt:start};
 assert.equal(q.length,2);assert.equal(c.benchmark(p,q,sc,now).higher,.5);assert.equal(c.benchmark({...p,line:15.5},q,sc,now),null);
 delete ev.odds.under;assert.equal(c.oddsPairs({data:[ev]},now).length,0);
});
test("paper grading requires official final appearance and never imputes DNP zero",()=>{
 const p={gameId:1,playerId:2,market:"points",line:12.5,offeredSide:"Higher"},o={gameId:1,playerId:2,officialGameFinalVerified:true,identityVerified:true,appeared:true,points:13};
 assert.equal(c.gradePaper(p,o),"correct");assert.equal(c.gradePaper(p,{...o,appeared:false}),"pending");assert.equal(c.gradePaper(p,{...o,officialGameFinalVerified:false}),"pending");
});

test("PrizePicks fantasy scoring uses documented weights, never sportsbook generic fantasy",()=>{
 assert.equal(c.fantasy({points:20,rebounds:5,assists:4,steals:2,blocks:1,turnovers:3}),38);
 assert.equal(c.market("Fantasy Score"),"prizePicksFantasyScore");
 const h=history();assert.ok(Number.isFinite(h.rows[0].prizePicksFantasyScore));
});
test("official injury report parser keeps exact game context and never assumes missing team clearance",()=>{
 const {parseInjuryLayout,reportClock}=require("../scripts/run-nba-private-research-v1.cjs");
 const a=parseInjuryLayout("11/24/2026  07:00 (ET)  DET@ORL  Detroit Pistons  Cunningham, Cade  Probable  injury\n                              Duren, Jalen  Out  injury\n                         Orlando Magic  NOT YET SUBMITTED");
 assert.equal(a.rows.length,2);assert.equal(a.rows[0].player,"Cade Cunningham");assert.equal(a.rows[1].team,"DET");assert.equal(a.notSubmitted[0].team,"ORL");
 assert.equal(reportClock("https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-24_12_30PM.pdf"),"2026-11-24T17:30:00.000Z");
});

test("NBA public structured schedule requires exact official game, date and tip",()=>{
 const {officialPageSchedule}=require("../scripts/run-nba-private-research-v1.cjs");
 const g={gameId:"0022600052",gameDateTimeUTC:"2026-11-25T00:00:00Z",homeTeam:{teamTricode:"ORL"},awayTeam:{teamTricode:"DET"},gameStatus:1};
 const html=x=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{games:x}}})+'</script>';
 assert.equal(officialPageSchedule(html([g]),"2026-11-24",now).games[0].gameId,22600052);
 assert.throws(()=>officialPageSchedule(html([g]),"2026-11-25",now));
 assert.throws(()=>officialPageSchedule(html([g,{...g,gameStatus:2}]),"2026-11-24",now));
});
