"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {toRows,pacificClock,LEAGUES,collectionRequirementsFor,fetchLeague,existingMorningSlot}=require("../scripts/collect-live-partner-nhl-nfl.cjs");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {compare}=require("../scripts/diff-live-partner-captures.cjs");
const included=[
 {type:"new_player",id:"p",attributes:{display_name:"A B",ppid:"ID",team:"BOS",position:"C"}},
 {type:"game",id:"g",attributes:{external_game_id:"future",
  metadata:{game_info:{teams:{home:{abbreviation:"BOS"},away:{abbreviation:"NYR"}}}}}}
];
const source=(line=2.5)=>({meta:{current_page:1,total_pages:1},
 included,data:[{type:"projection",id:"123",attributes:{
 line_score:line,stat_type:"Shots On Goal",start_time:"2026-11-08T21:00:00Z",
 status:"pre_game",odds_type:"standard",updated_at:"2026-11-08T15:00:00Z",
 allowed_wager_types:"under_or_over"},
 relationships:{new_player:{data:{id:"p"}},game:{data:{id:"g"}},duration:{data:{id:"11"}}}}]});
test("Complete strict source generates private 22-field records and actual teams",()=>{
 const s=toRows(source(),{sport:"NHL",leagueId:8,minimumRows:1});
 assert.equal(s.rows.length,1);assert.equal(s.rows[0].length,22);
 assert.equal(s.rows[0][8],"NYR");assert.equal(s.rows[0][19],"Full");
 assert.equal(s.rows[0][12],"under_or_over");
});
test("Missing pagination or player identity must fail without false completeness",()=>{
 for(const bad of [{...source(),meta:{current_page:1,total_pages:2}},
  {...source(),included:[]}])
 assert.throws(()=>toRows(bad,{sport:"NHL",leagueId:8,minimumRows:1}));
});
test("Pacific hour is timezone-aware",()=>{
 assert.equal(pacificClock(new Date("2026-11-08T17:15:00Z")).hour,9);
 assert.equal(pacificClock(new Date("2026-06-08T16:15:00Z")).hour,9);
});
test("Movement labels missing source IDs as not seen, NOT a platform removal",()=>{
 const a=new Map([["x",["x",null,null,null,null,null,null,null,null,null,2.5,"standard","under_or_over"]]]);
 const b=new Map([["x",["x",null,null,null,null,null,null,null,null,null,3.5,"standard","under_or_over"]],
  ["y",["y"]]]);
 const c={manifest:{captureFinishedUTC:"2026-11-08T15:20:00Z"},rows:{NHL:a,NFL:a}};
 const d={manifest:{captureFinishedUTC:"2026-11-08T17:05:00Z"},rows:{NHL:b,NFL:b}};
 const x=compare(c,d);
 assert.equal(x.bySport.NHL.newSourceOfferIDs,1);
 assert.equal(x.bySport.NHL.existingLineChanged,1);
 assert.equal(x.originalPlatformLineRemovalVerified,false);
 assert.equal(x.exactSixToNineComparisonVerified,false);
});

test("Late manual inventory preserves full source pagination without pretending 6/9 NFL volume",()=>{
 const nfl=LEAGUES.find(x=>x.sport==="NFL");
 assert.equal(nfl.minimumRows,1000);
 assert.equal(collectionRequirementsFor(nfl,"06:00").minimumRows,1000);
 assert.equal(collectionRequirementsFor(nfl,"09:00").minimumRows,1000);
 assert.equal(collectionRequirementsFor(nfl,"manual").minimumRows,1);
 const nhl=LEAGUES.find(x=>x.sport==="NHL");
 assert.equal(collectionRequirementsFor(nhl,"manual").minimumRows,200);
 assert.equal(toRows(source(),collectionRequirementsFor(nfl,"manual")).rows.length,1);
 assert.throws(()=>toRows(source(),collectionRequirementsFor(nfl,"09:00")),/Incomplete/);
 assert.throws(()=>toRows({...source(),meta:{current_page:1,total_pages:2}},
  collectionRequirementsFor(nfl,"manual")),/pagination/);
 assert.throws(()=>toRows({...source(),included:[]},
  collectionRequirementsFor(nfl,"manual")),/missing original player\/game/);
});

test("429 provider responses receive bounded retries; never certify an absent board",async()=>{
 const league={...LEAGUES[0],minimumRows:1},calls=[];
 const client=async()=>{
  calls.push(1);
  return calls.length<=2?
   {ok:false,status:429,headers:{get:()=>null}}:
   {ok:true,status:200,json:async()=>source()};
 };
 let pauses=0;
 const found=await fetchLeague(league,{client,pause:async()=>{pauses++},maxAttempts:3});
 assert.equal(found.rows.length,1);
 assert.equal(calls.length,3);
 assert.equal(pauses,2);
 let failures=0;
 await assert.rejects(fetchLeague(league,{client:async()=>{failures++;return {
  ok:false,status:429,headers:{get:()=>null}}},pause:async()=>{},maxAttempts:3}),/HTTP 429 after 3 attempts/);
 assert.equal(failures,3);
});

test("morning source duplicate guard ignores a green-but-incomplete or falsified archive",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"nhl-nfl-pacific-source-"));
 try{
  const folder=path.join(root,"outputs/manual-board-captures/2026-11-09/20261109T170300Z");
  fs.mkdirSync(folder,{recursive:true});
  const m={schemaVersion:1,captureSlotPacific:"09:00",
   pacificDate:"2026-11-09",
   captureStartedUTC:"2026-11-09T17:02:00Z",
   captureFinishedUTC:"2026-11-09T17:03:00Z",
   completePagination:true,actualCaptureInRequestedHour:false,
   hasBelowMorningMinimumInventory:false,
   sports:[{sport:"NHL",rawCount:900,belowMorningMinimumInventory:false},
    {sport:"NFL",rawCount:1500,belowMorningMinimumInventory:false}]};
  const file=path.join(folder,"manifest.json");
  const write=()=>fs.writeFileSync(file,JSON.stringify(m));
  write();
  const parent=path.dirname(folder);
  assert.equal(existingMorningSlot(parent,"09:00",root),null);
  m.actualCaptureInRequestedHour=true;m.hasBelowMorningMinimumInventory=true;
  write();assert.equal(existingMorningSlot(parent,"09:00",root),null);
  m.hasBelowMorningMinimumInventory=false;m.sports[1].belowMorningMinimumInventory=true;
  write();assert.equal(existingMorningSlot(parent,"09:00",root),null);
  m.sports[1].belowMorningMinimumInventory=false;
  write();assert.equal(existingMorningSlot(parent,"09:00",root).capturedAt,
   "2026-11-09T17:03:00Z");
  m.captureFinishedUTC="2026-11-09T18:03:00Z";
  write();assert.equal(existingMorningSlot(parent,"09:00",root),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("November 24 workflow isolates the archive and preserves completed grading after collection failure",()=>{
 const y=fs.readFileSync(path.join(__dirname,"../.github/workflows/nov24-bounded-source-refresh.yml"),"utf8");
 assert.match(y,/mv "\$GITHUB_WORKSPACE\/restricted" "\$RUNNER_TEMP\/nov24-restricted"/);
 assert.match(y,/capture-public-native-morning\.cjs "\$RUNNER_TEMP\/nov24-restricted"/);
 const guard=y.split("name: Preserve official result and grade checkpoint on isolated branch")[1].split("working-directory:")[0];
 for(const s of ["always()","!cancelled()","steps.private_destination.outcome == 'success'","steps.restricted_checkout.outcome == 'success'","steps.isolate_archive.outcome == 'success'","steps.grade.outcome == 'success'"])assert.ok(guard.includes(s),s);
 assert.ok(!guard.includes("steps.capture.outcome"));
});
