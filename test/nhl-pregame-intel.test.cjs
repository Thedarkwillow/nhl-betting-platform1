"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseNhlRosters,identifyPlayer,matchOfficialGame,normalizePregame,
 applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const at="2026-11-02T20:00:00Z",start="2026-11-03T02:00:00Z";
const rosters={
 SJS:{forwards:[{id:100,firstName:{default:"Macklin"},lastName:{default:"Celebrini"}}],
  defensemen:[],goalies:[{id:101,firstName:{default:"Yaroslav"},lastName:{default:"Askarov"}}]},
 CGY:{forwards:[{id:200,firstName:{default:"Morgan"},lastName:{default:"Frost"}}],
  defensemen:[],goalies:[{id:201,firstName:{default:"Dustin"},lastName:{default:"Wolf"}}]}
};
const schedule={games:[{id:2026020235,startTimeUTC:start,home:"SJS",away:"CGY"}]};
const reportInjuries={timestamp:at,injuries:[
 {displayName:"San Jose Sharks",injuries:[{id:"x",status:"Out",date:at,athlete:
  {displayName:"Macklin Celebrini",team:{abbreviation:"SJ"}}}]},
 {displayName:"Calgary Flames",injuries:[{id:"y",status:"Day-To-Day",date:at,athlete:
  {displayName:"Morgan Frost",team:{abbreviation:"CGY"}}}]}
]};
const board={events:[{id:"espn999",date:start,status:{type:{state:"pre"}},competitions:[{
 competitors:[{homeAway:"home",team:{abbreviation:"SJ"},probables:[{
  name:"probableStartingGoalie",athlete:{fullName:"Yaroslav Askarov"},status:{type:"confirmed",name:"Confirmed"}}]},
 {homeAway:"away",team:{abbreviation:"CGY"},probables:[{
  name:"probableStartingGoalie",athlete:{fullName:"Dustin Wolf"},status:{type:"expected",name:"Expected"}}]}]
}]}]};
test("ESPN injuries only match NHL official roster identity on same team",()=>{
 const roster=parseNhlRosters(rosters);
 assert.equal(identifyPlayer("SJ","Yaroslav Askarov",roster).playerId,101);
 assert.equal(identifyPlayer("CGY","Yaroslav Askarov",roster),null);
 assert.equal(matchOfficialGame(["SJS","CGY"],start,schedule).id,2026020235);
 assert.equal(matchOfficialGame(["SJS","CGY"],"2026-11-03T03:00:00Z",schedule),null);
 assert.equal(matchOfficialGame(["SJS","SJS"],start,schedule),null);
});
test("one explicit ESPN Confirmed is labeled reported, NOT NHL first-party confirmed",()=>{
 const r=normalizePregame(reportInjuries,board,rosters,schedule,at);
 assert.equal(r.coverage.goalies.matchedGoalies,2);
 assert.equal(r.goalieReportedConfirmed,1);
 assert.equal(r.officialStarterConfirmations,0);
 assert.equal(r.events[0].goalies.find(x=>x.playerId===101).sourceStatus,"reported_confirmed");
 assert.equal(r.events[0].goalies.find(x=>x.playerId===201).sourceStatus,"expected");
 assert.equal(r.events[0].goalies[0].officialTeamStarterConfirmation,false);
 assert.equal(r.coverage.injuries.matchedPlayers,2);
 assert.equal(r.injuries.find(x=>x.playerId===100).status,"Out");
});
test("dated injury OUT/IR and DTD become watchlist, not claimed cleared when missing",()=>{
 const r=normalizePregame(reportInjuries,board,rosters,schedule,at);
 const mk=(id,team,market)=>({playerId:id,team,gameId:2026020235,eventStartsAt:start,
  market,lean:"Higher",tier:"Standard",researchEligibility:"research_only",
  roleEvidence:{reasons:["PREGAME_INJURY_STATUS_UNVERIFIED"],eligibleForResearchLineup:true}});
 const out=applyPregameSignal(mk(100,"SJS","shotsOnGoal"),r,at);
 assert.equal(out.researchEligibility,"watchlist");
 assert.equal(out.roleEvidence.injuryStatus,"Out");
 assert.equal(out.roleEvidence.eligibleForResearchLineup,false);
 const dtd=applyPregameSignal(mk(200,"CGY","shotsOnGoal"),r,at);
 assert.equal(dtd.researchEligibility,"watchlist");
 assert.ok(dtd.roleEvidence.reasons.includes("EXTERNAL_INJURY_UNCERTAIN_REPORT"));
 const clean=applyPregameSignal(mk(101,"SJS","saves"),r,at);
 assert.equal(clean.roleEvidence.injuryStatus,"unknown");
 assert.equal(clean.roleEvidence.starterStatus,"reported_confirmed");
 assert.equal(clean.researchEligibility,"watchlist");
 assert.equal(clean.roleEvidence.officialStarterVerified,false);
 assert.equal(clean.roleEvidence.injuryCleared,false);
});
test("stale or future ESPN report, unmatched game and missing roster cannot create confirmations",()=>{
 const old=normalizePregame(reportInjuries,board,rosters,schedule,at);
 const p={playerId:100,team:"SJS",gameId:2026020235,eventStartsAt:start,
  market:"shotsOnGoal",researchEligibility:"research_only",roleEvidence:{reasons:[]}};
 assert.equal(applyPregameSignal(p,old,"2026-11-02T21:40:00Z").roleEvidence.injuryStatus,"unknown");
 assert.ok(applyPregameSignal(p,old,"2026-11-02T19:00:00Z").roleEvidence.reasons.includes("PREGAME_AVAILABILITY_FEED_MISSING_OR_STALE"));
 const invalid=normalizePregame(reportInjuries,board,{},schedule,at);
 assert.equal(invalid.events[0].goalies.length,0);
 const wrong=normalizePregame(reportInjuries,board,rosters,{games:[]},at);
 assert.equal(wrong.events.length,0);
 assert.throws(()=>normalizePregame({},board,rosters,schedule,at),/injury feed/);
});
test("started events and ambiguous roster entries are excluded",()=>{
 const begun=JSON.parse(JSON.stringify(board));
 begun.events[0].status.type.state="in";
 const v=normalizePregame(reportInjuries,begun,rosters,schedule,at);
 assert.equal(v.events.length,0);
 const duplicated=JSON.parse(JSON.stringify(rosters));
 duplicated.SJS.goalies.push({...duplicated.SJS.goalies[0],id:900});
 const u=normalizePregame(reportInjuries,board,duplicated,schedule,at);
 assert.equal(u.events[0].goalies.some(x=>x.playerId===101),false);
});

test("swapped ESPN venue must not attach a goalie to official NHL home/away game",()=>{
 const data=JSON.parse(JSON.stringify(board));
 data.events[0].competitions[0].competitors[0].homeAway="away";
 const v=normalizePregame(reportInjuries,data,rosters,schedule,at);
 assert.equal(v.events.length,0);
 assert.equal(v.coverage.goalies.unmatchedGames,1);
});
test("duplicate conflicting injury records quarantine rather than choosing first status",()=>{
 const duplicated=JSON.parse(JSON.stringify(reportInjuries));
 duplicated.injuries[0].injuries.push({...duplicated.injuries[0].injuries[0],id:"extra",status:"Day-To-Day"});
 const report=normalizePregame(duplicated,board,rosters,schedule,at);
 assert.equal(report.coverage.injuries.duplicates,1);
 const row=report.injuries.find(x=>x.playerId===100);
 assert.equal(row.status,"AMBIGUOUS");
 const prop={playerId:100,team:"SJS",gameId:2026020235,eventStartsAt:start,market:"shotsOnGoal",
  researchEligibility:"research_only",roleEvidence:{reasons:[]}};
 const p=applyPregameSignal(prop,report,at);
 assert.equal(p.researchEligibility,"watchlist");
 assert.ok(p.roleEvidence.reasons.includes("AMBIGUOUS_INJURY_SOURCE"));
});
test("invalid post-capture injury report date cannot be applied to pregame prop",()=>{
 const future=JSON.parse(JSON.stringify(reportInjuries));
 future.injuries[0].injuries[0].date="2026-11-04T03:00:00Z";
 const report=normalizePregame(future,board,rosters,schedule,at);
 assert.equal(report.injuries.some(x=>x.playerId===100),false);
});
