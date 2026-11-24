"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const {findBaseline,main}=require("../scripts/diff-live-partner-captures.cjs");
function offer(id,line,{tier="standard",sides="under_or_over",
 start="2026-11-15T18:00:00Z"}={}){
 const a=Array(COLUMNS.length).fill(null);
 a[0]=id;a[10]=line;a[11]=tier;a[12]=sides;a[7]=start;return a;
}
function create(root,day,name,slot,finished,{nhl=offer("nhl-1",2.5),
 nfl=offer("nfl-1",50.5),startedOffset=1000}={}){
 const rel="outputs/manual-board-captures/"+day+"/"+name,
 folder=path.join(root,rel);
 fs.mkdirSync(folder,{recursive:true});
 const finishAt=Date.parse(finished),start=new Date(finishAt-startedOffset).toISOString(),
   sports=[];
 for(const [sport,rows,league] of [["NHL",[nhl],8],["NFL",[nfl],9]]){
  const observed=new Date(finishAt-200).toISOString();
  sports.push({sport,leagueId:league,source:"https://partner-api.prizepicks.com/projections?league_id="+league,
   rawCount:rows.length,normalizedCount:rows.length,sourceObservedAt:observed,
   missingPlayers:0,missingGames:0,belowMorningMinimumInventory:false,parts:1});
  fs.writeFileSync(path.join(folder,sport.toLowerCase()+"-01.json"),
   JSON.stringify({sport,startIndex:0,observedAtUTC:observed,rows}));
 }
 const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",
  completePagination:true,snapshotMode:"direct_live_board",
  captureStartedUTC:start,captureFinishedUTC:finished,pacificDate:day,
  captureSlotPacific:slot,actualCaptureInRequestedHour:true,
  hasBelowMorningMinimumInventory:false,notSixOrNineAmSlot:false,
  columns:COLUMNS,sports};
 fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));
 return {rel,manifest};
}
test("Tuesday 6 AM compares previous verified Monday 9 AM, even without a game today",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-nhl-nfl-delta-"));
 try{
  const monday=create(root,"2026-11-09","20261109T172217Z","09:00","2026-11-09T17:22:17Z");
  const tuesday=create(root,"2026-11-10","20261110T142019Z","06:00",
   "2026-11-10T14:20:19Z",{nhl:offer("nhl-1",3.5),nfl:offer("nfl-1",47.5)});
  assert.equal(findBaseline(tuesday.rel,root)?.rel,monday.rel);
  const v=main([tuesday.rel],root);
  assert.equal(v.comparisonKind,"cross_day_previous_full_source");
  assert.equal(v.sixToNineVerified,false);
  assert.equal(v.crossDayLineComparisonVerified,true);
  assert.equal(v.summary.NHL.existingLineChanged,1);
  assert.equal(v.summary.NFL.existingLineChanged,1);
  const saved=JSON.parse(fs.readFileSync(path.join(root,v.output),"utf8"));
  assert.equal(saved.noFrozenDirectionsRewritten,true);
  assert.equal(saved.sourceOfferDisappearanceDoesNotVerifyAppRemoval,true);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test("9 AM prefers same-day original six AM and records exact 6-to-9 comparison",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-nhl-nfl-6-9-"));
 try{
  create(root,"2026-11-09","20261109T172217Z","09:00","2026-11-09T17:22:17Z");
  const six=create(root,"2026-11-10","20261110T142019Z","06:00",
   "2026-11-10T14:20:19Z",{nhl:offer("nhl-1",2.5),nfl:offer("nfl-1",50.5)});
  const nine=create(root,"2026-11-10","20261110T171505Z","09:00",
   "2026-11-10T17:15:05Z",{nhl:offer("nhl-2",2.5),nfl:offer("nfl-1",54.5)});
  assert.equal(findBaseline(nine.rel,root)?.rel,six.rel);
  const v=main([nine.rel],root);
  assert.equal(v.comparisonKind,"genuine_same_day_six_to_nine");
  assert.equal(v.sixToNineVerified,true);
  assert.equal(v.crossDayLineComparisonVerified,false);
  assert.equal(v.summary.NFL.existingLineChanged,1);
  assert.equal(v.summary.NHL.newSourceOfferIDs,1);
  assert.equal(v.summary.NHL.noLongerSeenSourceIDsUnverified,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test("never treat manual, out-of-hour or low-inventory archived manifest as source baseline",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-nhl-nfl-fail-"));
 try{
  const fake=create(root,"2026-11-09","20261109T172217Z","09:00",
   "2026-11-09T17:22:17Z");
  const f=path.join(root,fake.rel,"manifest.json"),doc=JSON.parse(fs.readFileSync(f));
  doc.hasBelowMorningMinimumInventory=true;
  fs.writeFileSync(f,JSON.stringify(doc));
  const good=create(root,"2026-11-10","20261110T142019Z","06:00",
   "2026-11-10T14:20:19Z");
  assert.equal(findBaseline(good.rel,root),null);
  assert.equal(main([good.rel],root).status,
   "no_prior_verified_complete_capture_within_seven_days");
  const broken=path.join(root,good.rel,"manifest.json"),m=JSON.parse(fs.readFileSync(broken));
  m.captureSlotPacific="09:00";
  fs.writeFileSync(broken,JSON.stringify(m));
  assert.throws(()=>findBaseline(good.rel,root),/verified complete original morning/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});


test("never let an 8 PM manual full-board archive masquerade as previous scheduled 9 AM",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-cross-day-manual-disqualify-"));
 try{
  const nine=create(root,"2026-11-09","20261109T172217Z","09:00",
   "2026-11-09T17:22:17Z",{nfl:offer("nfl-1",45.5)});
  // The actual 2026-11-09 09:22 Pacific archive had this historical
  // inconsistent legacy flag, though both UTC source timestamps are 9 AM.
  const legacyPath=path.join(root,nine.rel,"manifest.json");
  const legacy=JSON.parse(fs.readFileSync(legacyPath,"utf8"));
  legacy.notSixOrNineAmSlot=true;
  fs.writeFileSync(legacyPath,JSON.stringify(legacy));
  const manual=create(root,"2026-11-09","20261110T040155Z",null,
   "2026-11-10T04:01:55Z",{nfl:offer("nfl-1",42.5)});
  const file=path.join(root,manual.rel,"manifest.json");
  const m=JSON.parse(fs.readFileSync(file,"utf8"));
  m.notSixOrNineAmSlot=true;m.actualCaptureInRequestedHour=false;
  fs.writeFileSync(file,JSON.stringify(m));
  const six=create(root,"2026-11-10","20261110T142019Z","06:00",
   "2026-11-10T14:20:19Z",{nfl:offer("nfl-1",40.5)});
  assert.equal(findBaseline(six.rel,root)?.rel,nine.rel);
  const repairPath=path.join(root,"outputs/partner-source/line-delta/2026-11-10",
   "20261110T142019Z.json");
  fs.mkdirSync(path.dirname(repairPath),{recursive:true});
  fs.writeFileSync(repairPath,JSON.stringify({
   baselineArchive:manual.rel,currentArchive:six.rel,
   kind:"private_partner_actual_time_two_observations_v1"
  }));
  const fixed=main([six.rel],root);
  assert.equal(fixed.correctedPriorOutOfHourManualComparison,true);
  assert.equal(fixed.baselineCaptureAt,"2026-11-09T17:22:17Z");
  assert.equal(fixed.summary.NFL.existingLineChanged,1);
  const full=JSON.parse(fs.readFileSync(repairPath,"utf8"));
  assert.equal(full.baselineArchive,nine.rel);
  assert.equal(full.correction.previousVersionPreservedInPrivateGitHistory,true);
  assert.equal(main([six.rel],root).status,"already_verified_morning_comparison");
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
