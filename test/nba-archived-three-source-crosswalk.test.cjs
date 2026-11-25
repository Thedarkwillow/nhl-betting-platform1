"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{audit}=require("../scripts/nba-archived-three-source-crosswalk.cjs"),{COLUMNS}=require("../src/partner-prizepicks-board.cjs");
function fixture(){
 const start="2026-11-25T00:00:00Z",at="2026-11-24T18:00:00Z";
 const official={kind:"nba_official_schedule_v1",capturedAt:at,games:[{gameId:22600052,home:"ORL",away:"DET",startAt:start,status:1}]};
 const bdl={kind:"nba_bdl_daily_schedule_v1",source:"BALLDONTLIE",capturedAt:at,date:"2026-11-24",completePagination:true,rows:[{providerGameId:"21718181",gameIdNamespace:"balldontlie:nba",home:"ORL",away:"DET",startAt:start,status:"scheduled"}]};
 const row={projectionId:"one",player:"Example",team:"DET",opponent:"ORL",eventStartsAt:start,market:"Points",line:15.5,tier:"standard",offeredWagerTypes:"under_or_over",lineUpdatedAt:at,status:"pre_game",inGame:false,isLive:false,combo:false,eventType:"game",period:"Full"};
 const board={kind:"nba_private_partner_board_v1",source:"partner-api.prizepicks.com",completePagination:true,capturedAt:at,captureStartedAt:at,rows:[COLUMNS.map(k=>row[k])]};
 return {official,bdl,board};
}
test("exact home/away and start join without promoting player or original offer",()=>{const {official,bdl,board}=fixture();const r=audit(official,bdl,board);assert.equal(r.counts.uniqueScheduleMatches,1);assert.equal(r.counts.matchedBoardRows,1);assert.equal(r.counts.matchedOfferedSides,2);assert.equal(r.playerIdentityVerified,false);assert.equal(r.prospectiveFreezeVerified,false);assert.equal(JSON.stringify(r).includes("Example"),false);});
test("provider IDs stay separate; ambiguity, reversed teams and late capture rejected",()=>{for(const change of [b=>b.rows.push({...b.rows[0],providerGameId:"123"}),b=>{b.rows[0].home="DET";b.rows[0].away="ORL"},b=>{b.capturedAt="2026-11-25T01:00:00Z"}]){const {official,bdl,board}=fixture();change(bdl);const r=audit(official,bdl,board);assert.equal(r.counts.uniqueScheduleMatches,0);assert.equal(r.counts.matchedBoardRows,0);}});
test("unoffered sides, live row or invalid namespace fail closed",()=>{for(const [key,v] of [["offeredWagerTypes",null],["isLive",true],["combo",true]]){const {official,bdl,board}=fixture();board.rows[0][COLUMNS.indexOf(key)]=v;assert.equal(audit(official,bdl,board).counts.matchedBoardRows,0);}const {official,bdl,board}=fixture();bdl.rows[0].gameIdNamespace="nba";assert.throws(()=>audit(official,bdl,board));});
