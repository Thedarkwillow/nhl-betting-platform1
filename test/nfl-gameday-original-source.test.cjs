"use strict";
const test=require("node:test"),a=require("node:assert/strict"),
 fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {capture,gamesToFreeze,selectedSourceGames}=require("../scripts/collect-nfl-gameday-source.cjs");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const {verify}=require("../scripts/verify-nfl-gameday-source.cjs");
const schedule=[{game_id:"2026_11_IND_HOU",season:2026,game_type:"REG",week:11,
 home_team:"HOU",away_team:"IND",gameday:"2026-11-19",gametime:"20:15"}];
const utc="2026-11-19T23:50:00Z",end="2026-11-19T23:50:05Z";
const rows=[COLUMNS.map(k=>({
 projectionId:"p-original",providerPlayerId:"pp-not-gsis",player:"Test Player",
 team:"HOU",opponent:"IND",providerGameId:"NFL_game_fake",
 eventStartsAt:"2026-11-20T01:15:00Z",
 status:"pre_game",position:"QB",tier:"goblin",eventType:"individual",
 period:"Full",line:25.5
})[k]??null)];
test("only real exact schedule window can trigger NFL pregame source capture",()=>{
 a.equal(gamesToFreeze(schedule,utc).length,1);
 a.equal(gamesToFreeze(schedule,"2026-11-19T20:00:00Z").length,0);
 a.equal(gamesToFreeze(schedule,"2026-11-20T00:45:00Z").length,0);
 a.deepEqual(selectedSourceGames(rows,gamesToFreeze(schedule,utc))
  .map(x=>x.gameId),["2026_11_IND_HOU"]);
 const forged=rows.map(v=>COLUMNS.map((k,i)=>k==="opponent"?"JAX":v[i]));
 a.equal(selectedSourceGames(forged,gamesToFreeze(schedule,utc)).length,0);
});
test("new source is private append-only, full original offer IDs, not a betting lineup",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"nfl-original-"));
 try{
  const x=await capture({root,now:new Date(utc),finishedAt:()=>end,
   scheduleLoader:()=>schedule,fetcher:async league=>({...league,rows,
    receivedAt:end,players:1,games:1,url:"https://partner-api.prizepicks.com/projections?league_id=9"})});
  a.equal(x.status,"private_nfl_gameday_source_precommit_pending");
  a.equal(x.verifiedGameCount,1);a.equal(x.approvedBets,0);
  const m=JSON.parse(fs.readFileSync(path.join(root,x.manifest)));
  a.equal(m.sourceAuthenticatedFirstParty,false);
  a.equal(m.nflGamedaySourceProof.playerGSISVerified,false);
  a.equal(m.nflGamedaySourceProof.bettingEligible,false);
  a.equal(m.sports[0].sport,"NFL");
  a.equal(m.sports[0].rawCount,1);
  a.equal(m.sports.length,1);
  a.equal(verify(root,x.archiveDir,{now:"2026-11-19T23:55:00Z"}).verified,true);
  a.equal(verify(root,x.archiveDir,{now:"2026-11-19T23:55:00Z",requireFirstGit:true}).verified,false);
  const all=JSON.parse(fs.readFileSync(path.join(root,x.archiveDir,"nfl-01.json")));
  a.equal(all.rows[0][COLUMNS.indexOf("providerPlayerId")],"pp-not-gsis");
  a.equal(fs.existsSync(path.join(root,x.archiveDir,"nhl-01.json")),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("outside window never fetches live board or invents original archives",async()=>{
 let calls=0;const result=await capture({now:new Date("2026-11-19T20:00:00Z"),
  scheduleLoader:()=>schedule,fetcher:async()=>{calls++;throw Error("unexpected source request")}})
 a.equal(result.providerRequests,0);a.equal(calls,0);
 a.equal(result.status,"no_upcoming_game_in_45_to_135_minute_window");
});
