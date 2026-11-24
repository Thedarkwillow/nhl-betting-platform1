"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {buildLedger,persistLedger}=require("../src/nhl-immutable-board-ledger.cjs");
const row=(line=2.5,projectionId="prop-1")=>({
 projectionId,player:"Sample Skater",team:"BOS",market:"Shots On Goal",
 period:"Full game",tier:"Standard",side:"Higher",line,
 eventStartsAt:"2026-11-08T01:00:00Z",observedAt:"2026-11-06T14:00:00Z"
});
const archive=(when,rows)=>({path:"outputs/free-source/nhl/snapshots/"+
 when.replace(/[-:]/g,"").slice(0,15)+"Z.json",
 board:{provider:"prizepicksapi.com",generatedAt:when,sourceStatus:"fresh",
 completePagination:true,rows}});
test("replay is sorted, deduplicated and line moves never imply actual PrizePicks removals",()=>{
 const a=archive("2026-11-06T14:00:00Z",[row(),row(3.5,"prop-2")]);
 const b=archive("2026-11-06T17:00:00Z",[row(3.5),row(4.5,"prop-3")]);
 const ledger=buildLedger([b,a,a]);
 assert.equal(ledger.snapshots.length,2);
 assert.equal(ledger.coverage[0].offers,2);
 assert.equal(ledger.coverage[1].intervalMinutes,180);
 const events=ledger.snapshots[1].events;
 assert.equal(events.filter(e=>e.type==="observed_line_change").length,1);
 assert.equal(events.filter(e=>e.type==="first_observed_in_archive").length,1);
 assert.equal(events.filter(e=>e.type==="not_seen_in_this_source_snapshot").length,1);
 assert.ok(events.every(e=>e.verifiedOriginalPlatformChange===false));
 assert.equal(ledger.verifiedOriginalPlatformRemovals,0);
 assert.equal(ledger.providerCalls,0);
 assert.notEqual(ledger.snapshots[0].observations[0].observationId,
  ledger.snapshots[1].observations[0].observationId);
});
test("immutable output is byte-stable, idempotent, private and cannot silently rewrite history",()=>{
 const a=archive("2026-11-06T14:00:00Z",[row()]);
 const one=buildLedger([a]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"nhl-immutable-ledger-"));
 try{
  assert.deepEqual(persistLedger(root,one),{newFiles:3,unchangedFiles:0,snapshots:1});
  assert.deepEqual(persistLedger(root,one),{newFiles:0,unchangedFiles:3,snapshots:1});
  const id=one.snapshots[0].snapshot.snapshotId;
  const filename=path.join(root,"normalized",id+".json");
  assert.equal(JSON.parse(fs.readFileSync(filename)).length,1);
  fs.writeFileSync(filename,"[]");
  assert.throws(()=>persistLedger(root,one),/Immutable ledger collision/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("source integrity and ambiguous identities fail closed",()=>{
 const a=archive("2026-11-06T14:00:00Z",[row()]);
 assert.throws(()=>buildLedger([{...a,board:{...a.board,completePagination:false}}]),/complete/);
 assert.throws(()=>buildLedger([{...a,board:{...a.board,rows:[row(),row()]}}]),/Duplicate/);
 assert.throws(()=>buildLedger([{...a,board:{...a.board,rows:[{...row(),projectionId:""}]}}]),/Incomplete/);
 assert.throws(()=>buildLedger([{...a,path:"../secrets.json"}]),/Unsafe/);
 assert.equal(buildLedger([]).snapshots.length,0);
});
