"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../scripts/nba-conditional-real-line-replay.cjs");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
function fixture(){
 const at="2026-11-24T18:20:00Z",startAt="2026-11-25T00:00:00Z",gameId=22600052;
 const sc={kind:"nba_official_schedule_v1",capturedAt:at,games:[{gameId,startAt,home:"ORL",away:"DET",status:1}]};
 const bdl={kind:"nba_bdl_daily_schedule_v1",source:"BALLDONTLIE",capturedAt:at,date:"2026-11-24",completePagination:true,rows:[{providerGameId:"123",gameIdNamespace:"balldontlie:nba",startAt,home:"ORL",away:"DET",status:"scheduled"}]};
 const raw=(id,player)=>({projectionId:id,player,team:"DET",opponent:"ORL",eventStartsAt:startAt,market:"points",line:10.5,tier:"standard",offeredWagerTypes:"under_or_over",lineUpdatedAt:at,status:"pre_game",inGame:false,isLive:false,combo:false,eventType:"game",period:"Full"});
 const board={kind:"nba_private_partner_board_v1",source:"partner-api.prizepicks.com",completePagination:true,capturedAt:at,captureStartedAt:at,rows:[raw("one","Example Player"),raw("two","Other Player")].map(r=>COLUMNS.map(k=>r[k]))};
 const hist={kind:"nba_historical_mirror_research_v1",capturedAt:at,rows:Array.from({length:12},(_,i)=>[1,2].map(id=>({gameId:100+i,gameDate:"2026-11-"+String(i+1).padStart(2,"0"),playerId:id,player:id===1?"Example Player":"Other Player",team:"DET",opponent:"ORL",minutes:30,points:12,rebounds:3,assists:2,steals:1,blocks:0,turnovers:1}))).flat()};
 const row={sourceOfferId:"one",playerIdCandidate:1,gameId,market:"points",line:10.5,tier:"Standard",sourceObservedAt:at,actual:15,statSource:"ESPN_conditional",officialPlayerIdMatched:false};
 const grades={kind:"nba_archived_individual_line_stat_reconciliation_v1",boardCapturedAt:at,retrospectiveOnly:true,summary:{registeredSides:4,matchedStatSides:2},rows:[{...row,offeredSide:"Higher"},{...row,offeredSide:"Lower"}]};
 const injury={kind:"nba_official_injury_report_observed_v1",reportPublishedAt:at,capturedAt:at,sourceDocumentUrl:"https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-24.pdf",rows:[{date:"2026-11-24",match:"DET@ORL",team:"DET",player:"Other Player",status:"out"}]};
 return [sc,bdl,board,hist,grades,injury];
}
test("same threshold directional duplicates counted once, explicit out exclusions remain ungraded",()=>{const r=audit(...fixture());assert.equal(r.aggregate.decisions,1);assert.equal(r.aggregate.wins,1);assert.equal(r.unmatchedDiagnostic.reportedOut,2);assert.equal(r.unmatchedDiagnostic.distinctUnmatchedPlayers,1);assert.equal(r.prospectiveModelAccuracy,false);});
test("reject unbound or duplicate grade, not merely matching count",()=>{const a=fixture();a[4].rows[0].line=11.5;assert.throws(()=>audit(...a));const b=fixture();b[4].rows[1]=b[4].rows[0];assert.throws(()=>audit(...b));});
