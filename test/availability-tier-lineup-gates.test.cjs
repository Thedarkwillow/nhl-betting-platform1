"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {uniqueRosterIdentity}=require("../src/nhl-current-roster-identity.cjs");
const {evaluate}=require("../src/lineup-count-mass-calibration-lab.cjs");
const {attachNflAvailability}=require("../src/nfl-current-injury-evidence.cjs");
test("official roster unique initial match, conflicting names and stale roster fail closed",()=>{
 const now="2026-11-14T20:00:00Z",source={player:"J. Example",team:"BUF"},prop={player:"John Example",team:"BUF",playerId:42,eventStartsAt:"2026-11-15T00:00:00Z"};
 const r={kind:"official_nhl_current_roster_crosswalk_v1",capturedAt:now,rows:[{team:"BUF",name:"John Example",playerId:42}]};
 assert.equal(uniqueRosterIdentity(source,prop,r,now),true);
 assert.equal(uniqueRosterIdentity(source,prop,{...r,rows:[...r.rows,{team:"BUF",name:"James Example",playerId:43}]},now),false);
 assert.equal(uniqueRosterIdentity(source,prop,{...r,capturedAt:"2026-11-13T20:00:00Z"},now),false);
});
test("lineup calibration uses at most one record per slate and already observed outcomes",()=>{
 const records=Array.from({length:51},(_,i)=>{const d=new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10);return {slate:d,mass:[.1,.4,.5],hits:i%3,frozenAt:d+"T10:00:00Z",resolvedAt:d+"T22:00:00Z"};});
 const r=evaluate(records.concat(records));assert.equal(r.distinctResolvedSlates,51);assert.equal(r.heldoutSlates,31);assert.equal(r.calibrationApproved,false);
 const late=records.map(x=>({...x,resolvedAt:"2027-01-01T00:00:00Z"}));assert.equal(evaluate(late).heldoutSlates,0);
});
test("missing injury report is unknown; exact questionable report blocks; stale data cannot clear",()=>{
 const now="2026-11-14T20:00:00Z",p={historicalPlayerId:"id",team:"BUF",season:2026,week:10,eventStartsAt:"2026-11-15T18:00:00Z"};
 const r={kind:"nflverse_official_report_derived_injuries_v1",capturedAt:now,rows:[{gsisId:"id",team:"BUF",season:2026,week:10,modifiedAt:now,status:"questionable"}]};
 assert.equal(attachNflAvailability(p,r,now).blocksResearch,true);
 assert.equal(attachNflAvailability(p,null,now).status,"unknown");
 assert.equal(attachNflAvailability(p,r,"2026-11-15T09:00:00Z").medicalClearanceVerified,false);
});

test("NHL league-published injured status is exact-game risk, never medical clearance",()=>{
 const {applyNhlLeagueStatus}=require("../src/nhl-league-published-status.cjs");
 const now="2026-11-14T20:00:00Z",p={playerId:1,team:"BUF",gameId:12,eventStartsAt:"2026-11-15T01:00:00Z"};
 const r={kind:"nhl_league_published_pregame_status_v1",capturedAt:now,sources:[{gameId:12,url:"https://www.nhl.com/news/example"}],rows:[{...p,status:"injured",reportedAt:now}]};
 assert.equal(applyNhlLeagueStatus(p,r,now).blocked,true);
 assert.equal(applyNhlLeagueStatus({...p,gameId:13},r,now).status,"unknown");
 assert.equal(applyNhlLeagueStatus(p,null,now).medicalClearanceVerified,false);
});
