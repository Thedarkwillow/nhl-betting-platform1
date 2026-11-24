"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assess,roles,injuries,goalie,rested,expected}=require("../src/nhl-pregame-live-context-v1.cjs");
const asOf="2026-11-21T20:00:00Z",start="2026-11-22T01:00:00Z";
const prop={gameId:2026020370,playerId:8471234,team:"MTL",opponent:"PHI",
 market:"points",line:.5,tier:"Standard",lean:"Higher",
 capturedAt:"2026-11-21T19:50:00Z",gameStartAt:start};
const player=(id,ev,pp=null)=>({playerId:id,team:"MTL",injuryStatus:"",gameTimeDecision:false,
 roles:[{categoryIdentifier:"ev",groupIdentifier:ev},...(pp?[{categoryIdentifier:"pp",groupIdentifier:pp}]:[])]});
const team=(code)=>({gamesPlayed:19,sourceObservedAt:"2026-11-21T19:00:00Z",xGoalsForPer60:3.2,
 xGoalsAgainstPer60:2.8,shotAttemptsAgainstPer60:52});
function approved(){
 return {kind:"approved_nhl_source_research_snapshots",generatedAt:"2026-11-21T19:00:00Z",
  dailyFaceoff:{officialClubLineupProof:false,
   games:[{gameId:prop.gameId,eventStartsAt:start,home:"MTL",away:"PHI",goalies:[
    {playerId:9489999,team:"PHI",status:"reported_confirmed",reportAt:"2026-11-21T18:30:00Z",reportSource:"Reporter"}]}],
   lineups:{MTL:{team:"MTL",clubLineupsConfirmed:false,
    sourceCapturedAt:"2026-11-21T18:59:00Z",sourceUpdatedAt:"2026-11-21T17:00:00Z",
    players:[player(prop.playerId,"f1","pp1"),player(8471111,"f1","pp1"),player(8472222,"f1","pp2")]}}},
  moneyPuck:{completeSeasonSummary:true,availableForCurrentShadow:true,
   skaters:{rows:{[prop.playerId]:{playerId:prop.playerId,team:"MTL",
    gamesPlayed:19,sourceObservedAt:"2026-11-21T19:00:00Z",
    xGoalsPer60:1.3,shotAttemptsPer60:12,highDangerShotsPer60:3}}},
   teams:{rows:{MTL:team("MTL"),PHI:team("PHI")}}}
 };
}
const external={kind:"nhl_external_pregame_availability_research",
 generatedAt:"2026-11-21T19:00:00Z",injuries:[]};
const schedule={source:"Official NHL Web API",complete:true,generatedAt:"2026-11-20T18:00:00Z",
 games:[{id:2026020360,gameType:2,startTimeUTC:"2026-11-20T01:00:00Z",home:"TOR",away:"MTL",
 gameState:"OFF",finalized:true},
 {id:prop.gameId,gameType:2,startTimeUTC:start,home:"MTL",away:"PHI",
 gameState:"FUT",finalized:false}]};
test("projected PP1 and exact EV linemates from captured first-party roster IDs, but NOT official confirmation",()=>{
 const x=roles(approved(),prop,asOf);
 assert.equal(x.status,"matched_projected_line");
 assert.equal(x.evenStrengthUnit,"f1");
 assert.equal(x.powerPlayUnit,"pp1");
 assert.equal(x.linemateIds.length,2);
 assert.equal(x.officialClubLineConfirmed,false);
 assert.equal(x.playerActiveVerified,false);
});
test("reporter-confirmed opposing goalie NEVER means official starter verified",()=>{
 const x=goalie(approved(),prop,asOf);
 assert.equal(x.status,"reporter_confirmed");
 assert.equal(x.starterVerified,false);
 const s=approved();s.dailyFaceoff.games[0].goalies[0].status="expected";
 assert.equal(goalie(s,prop,asOf).status,"report_unconfirmed");
});
test("ESPN missing injury record does not give medical clearance",()=>{
 const x=injuries(external,prop,asOf);
 assert.equal(x.status,"unknown");
 assert.equal(x.positiveMedicalClearance,false);
});
test("injured or questionable source report blocks research, including exact NHL roster ID",()=>{
 const x={...external,injuries:[{playerId:prop.playerId,team:"MTL",status:"questionable",
  reportedAt:"2026-11-21T18:30:00Z",sourceCapturedAt:"2026-11-21T19:00:00Z",
  nhlRosterIdentityMatched:true}]};
 const z=injuries(x,prop,asOf);
 assert.equal(z.status,"negative_report");
 assert.equal(z.negativeReport,true);
 assert.equal(assess(prop,{asOf,approved:approved(),external:x,schedule}).reasons.includes("injury_or_uncertain_participation_report"),true);
});
test("official prior schedule provides exact rest and host-venue change, not invented flight distance",()=>{
 const x=rested(schedule,prop,asOf);
 assert.equal(x.status,"official_schedule_verified");
 assert.equal(x.restDays,1);
 assert.equal(x.backToBack,false);
 assert.equal(x.priorVenueHost,"TOR");
 assert.equal(x.currentVenueHost,"MTL");
 assert.equal(x.hostVenueChanged,true);
 assert.equal(x.distanceKm,null);
});
test("MoneyPuck player/team opponent xG and attempts are as-of-only",()=>{
 const x=expected(approved(),prop,asOf);
 assert.equal(x.status,"fresh_season_to_date_research_only");
 assert.equal(x.opponentXGoalsAgainstPer60,2.8);
 assert.equal(x.playerHighDangerShotsPer60,3);
 const late=approved();late.generatedAt="2026-11-21T21:05:00Z";
 assert.equal(expected(late,prop,asOf).status,"unverified");
});
test("after-the-original-freeze sources cannot upgrade frozen research",()=>{
 const a=approved();a.dailyFaceoff.lineups.MTL.sourceCapturedAt="2026-11-21T21:00:00Z";
 assert.equal(roles(a,prop,asOf).status,"unverified");
 const snap=assess(prop,{asOf,approved:a,external,schedule});
 assert.equal(snap.highConfidenceEligible,false);
 assert.equal(snap.productionEligible,false);
});
test("missing teammate and conflicting roles abstain rather than infer PP usage",()=>{
 const a=approved();a.dailyFaceoff.lineups.MTL.players.pop();
 assert.equal(roles(a,prop,asOf).status,"unverified");
 const b=approved();b.dailyFaceoff.lineups.MTL.players[0].roles.push({categoryIdentifier:"pp",groupIdentifier:"pp2"});
 assert.equal(roles(b,prop,asOf).status,"unverified");
});
test("future game identity, source freshness and nonfinal prior games fail closed",()=>{
 const s={...schedule,games:schedule.games.map(x=>({...x}))};
 s.games[0].finalized=false;
 assert.equal(rested(s,prop,asOf).status,"unverified");
 s.games[0].finalized=true;s.games[1].id=99;
 assert.equal(rested(s,prop,asOf).status,"unverified");
});
test("full context still cannot approve high-confidence without club and player clearance",()=>{
 const x=assess(prop,{asOf,approved:approved(),external,schedule});
 assert.equal(x.projectedLineupSupported,true);
 assert.equal(x.reasons.includes("official_active_status_unverified"),true);
 assert.equal(x.reasons.includes("opposing_goalie_not_club_verified"),true);
 assert.equal(x.highConfidenceEligible,false);
 assert.equal(x.bettingEligible,false);
});

test("five distinct verified projected PP members required; partial unit is not power-play verification",()=>{
 const partial=roles(approved(),prop,asOf);
 assert.equal(partial.status,"matched_projected_line");
 assert.equal(partial.powerPlayTeammateCount,1);
 assert.equal(partial.projectedPowerPlayUnitComplete,false);
 assert.equal(partial.projectedPowerPlayRoleVerified,false);
 const doc=approved(),line=doc.dailyFaceoff.lineups.MTL;
 line.players.push(player(8473333,"f2","pp1"));
 line.players.push(player(8474444,"f2","pp1"));
 line.players.push(player(8475555,"f2","pp1"));
 const full=roles(doc,prop,asOf);
 assert.equal(full.status,"matched_projected_line");
 assert.equal(full.powerPlayTeammateCount,4);
 assert.equal(full.projectedPowerPlayUnitComplete,true);
 assert.equal(full.projectedPowerPlayRoleVerified,true);
 assert.equal(full.officialClubLineConfirmed,false);
 assert.equal(full.playerActiveVerified,false);
 assert.equal(assess(prop,{asOf,approved:doc,external,schedule}).highConfidenceEligible,false);
 line.players.push(player(8474444,"f3","pp1"));
 const duplicate=roles(doc,prop,asOf);
 assert.equal(duplicate.projectedPowerPlayUnitComplete,false);
 assert.equal(duplicate.projectedPowerPlayRoleVerified,false);
});
