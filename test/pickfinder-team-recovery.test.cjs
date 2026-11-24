"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {convert}=require("../scripts/import-pickfinder-csv.cjs");
const player={playerId:123,playerName:"Alex Killorn",team:"ANA"};
const base={league:"NHL",player:"Alex Killorn",prop_type:"Shots on Goal",line:1.5,extracted_at_utc:"2026-11-01T00:00:00Z"};
test("recovers position-as-team only when historical team occurs in matchup",()=>{
 const report=convert([{...base,team:"LW",matchup:"ANA vs OTT"}],{players:[player]});
 assert.equal(report.summary.accepted,1);
 assert.equal(report.lines[0].team,"ANA");
});
test("rejects position-as-team when matchup does not support historical team",()=>{
 const report=convert([{...base,team:"LW",matchup:"COL vs CGY"}],{players:[player]});
 assert.equal(report.summary.accepted,0);
 assert.equal(report.summary.unmatched,1);
});
test("rejects mismatched explicit team",()=>{
 const report=convert([{...base,team:"COL",matchup:"ANA vs OTT"}],{players:[player]});
 assert.equal(report.summary.accepted,0);
});
