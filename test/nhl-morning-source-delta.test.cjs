"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pacificSlot,selectMorningBaselineFilename,summarizeMorningNhlDelta}=
 require("../src/nhl-morning-source-delta.cjs");
const prevAt="2026-11-06T14:02:00Z",nextAt="2026-11-06T17:29:00Z";
const game="2026-11-07T00:00:00Z";
const row=(projectionId,player,market,line,side="Higher",tier="Standard")=>({
 projectionId,player,team:"SEA",matchup:"VAN",market,period:"full_game",
 line,side,tier,eventStartsAt:game,capturedAt:prevAt});
const previous={provider:"prizepicksapi.com",generatedAt:prevAt,
 completePagination:true,sourceStatus:"fresh",rows:[
 row("p1","Player A","Shots On Goal",2.5),
 row("p1","Player A","Shots On Goal",2.5,"Lower"),
 row("p2","Player B","Points",.5)
]};
const current={provider:"prizepicksapi.com",generatedAt:nextAt,
 completePagination:true,sourceStatus:"fresh",rows:[
 row("p1","Player A","Shots On Goal",3.5),
 row("p1","Player A","Shots On Goal",2.5,"Lower"),
 row("p3","Player A","Blocked Shots",1.5),
 row("p4","Player A","Shots On Goal",4.5,"Higher","Demon"),
 row("p5","Player C","Points",.5),
 row("p2","Player B","Points",.5,"Lower")
]};
test("America/Los_Angeles windows correctly identify 06:00, 09:00 with PST conversions",()=>{
 assert.deepEqual(pacificSlot(prevAt),{day:"2026-11-06",minute:362,slot:"06:00"});
 assert.deepEqual(pacificSlot(nextAt),{day:"2026-11-06",minute:569,slot:"09:00"});
 assert.equal(pacificSlot("2026-11-06T00:01:00Z").day,"2026-11-05");
 assert.equal(pacificSlot("2026-11-06T17:02:00Z").slot,"09:00");
 assert.equal(pacificSlot("invalid"),null);
});
test("morning change report counts only additions, new markets, sides, thresholds and actual same-ID line movements",()=>{
 const x=summarizeMorningNhlDelta(previous,current);
 assert.equal(x.status,"valid_independent_source_delta_only");
 assert.equal(x.summary.newPlayerGames,1);
 assert.equal(x.summary.newMarketsForExistingPlayers,1);
 assert.equal(x.summary.newThresholdsForExistingMarkets,1);
 assert.equal(x.summary.newSidesForExistingThresholds,1);
 assert.equal(x.summary.changedExistingOfferLines,1);
 assert.equal(x.summary.unseenSourceOffersUnverified,1);
 assert.equal(x.records.length,6);
 assert.equal(x.records.filter(r=>r.type==="new_player_game")[0].player,"Player C");
 assert.equal(x.records.filter(r=>r.type==="new_market_for_player")[0].market,"Blocked Shots");
 assert.equal(x.records.filter(r=>r.type==="changed_existing_offer_line")[0].previousLine,2.5);
 assert.equal(x.records.filter(r=>r.type==="changed_existing_offer_line")[0].line,3.5);
 assert.equal(x.confirmedOriginalPlatformRemovals,false);
 assert.equal(x.authenticatedOriginalPrizePicksBoard,false);
 assert.equal(x.providerCallsByComparison,0);
});
test("a provider projection ID change without a genuine new line does not fabricate new player inventory",()=>{
 const newer={...current,rows:[...previous.rows.map(r=>({...r,
   projectionId:r.projectionId+"-reissued"}))]};
 const r=summarizeMorningNhlDelta(previous,newer);
 assert.equal(r.summary.newPlayerGames,0);
 assert.equal(r.summary.newMarketsForExistingPlayers,0);
 assert.equal(r.summary.newThresholdsForExistingMarkets,0);
 assert.equal(r.summary.newSidesForExistingThresholds,0);
 assert.equal(r.summary.unseenSourceOffersUnverified,3);
 assert.equal(r.summary.changedExistingOfferLines,0);
});
test("strict same-day complete-board pair gate never labels previous-day observations as a morning change",()=>{
 for(const [a,b]of [
  [{...previous,generatedAt:"2026-11-05T14:02:00Z"},current],
  [previous,{...current,generatedAt:"2026-11-06T19:31:00Z"}],
  [previous,{...current,provider:"another-source"}],
  [{...previous,completePagination:false},current],
  [{...previous,rows:[]},current],
  [null,current]
 ]){
  const r=summarizeMorningNhlDelta(a,b);
  assert.equal(r.status,"unavailable_without_two_complete_same_day_source_boards");
  assert.equal(r.records.length,0);
 }
});
test("side availability, archived source and first-seen status do not prove original platform action",()=>{
 const d=summarizeMorningNhlDelta(previous,{...current,rows:[]});
 assert.equal(d.authenticatedOriginalPrizePicksBoard,false);
 assert.equal(d.confirmedOriginalPlatformRemovals,false);
 assert.equal(d.providerCallsByComparison,0);
});

test("no claims from stale or partial provider captures; tracker persists only changed-only report",()=>{
 const r=summarizeMorningNhlDelta(previous,{...current,sourceStatus:"stale"});
 assert.equal(r.status,"unavailable_without_two_complete_same_day_source_boards");
 assert.deepEqual(r.records,[]);
 const fs=require("node:fs"),path=require("node:path");
 const text=fs.readFileSync(path.join(__dirname,"../scripts/track-free-nhl-line-movement.cjs"),"utf8");
 assert.match(text,/selectMorningBaselineFilename\(files,current\.generatedAt\)/);
 assert.match(text,/summarizeMorningNhlDelta\(early,current\)/);
 assert.match(text,/movement\.morningDelta/);
 const project=JSON.parse(fs.readFileSync(path.join(__dirname,"../package.json"),"utf8"));
 assert.equal(project.scripts.test,"node --test test/*.cjs",
  "One-off Discord integration must never execute under unattended npm test");
});


test("09:00 report compares the same-day 06:00 baseline even if another capture happened between",()=>{
 const archived=[
  "20261105T140200Z.json", // previous day
  "20261106T140200Z.json", // 06:02 PST, actual required baseline
  "20261106T150000Z.json", // intervening independent capture
  "20261106T170000Z.json", // 09:00, NOT the 06:00 baseline
  "20261106T172900Z.json"  // current 09:29
 ];
 const picked=selectMorningBaselineFilename(archived,nextAt);
 assert.equal(picked,"20261106T140200Z.json");
 const basedOnSix=summarizeMorningNhlDelta(previous,current);
 assert.equal(basedOnSix.summary.newMarketsForExistingPlayers,1);
 assert.equal(basedOnSix.summary.changedExistingOfferLines,1);
 assert.equal(selectMorningBaselineFilename(archived,prevAt),null,
  "06:00 may never compare itself to a prior day's baseline");
});
test("morning baseline picks the latest complete clock window file and refuses invalid UTC filename",()=>{
 const names=["20261106T140100Z.json","20261106T145900Z.json",
   "20261106T150000Z.json","20261106T146000Z.json",
   "20261306T145900Z.json","20261106T174500Z.json"];
 assert.equal(selectMorningBaselineFilename(names,nextAt),"20261106T145900Z.json");
 assert.equal(selectMorningBaselineFilename(["20261105T145900Z.json"],nextAt),null);
 assert.equal(selectMorningBaselineFilename([],nextAt),null);
 assert.equal(selectMorningBaselineFilename(null,nextAt),null);
});

test("offline 09:00 delta research survives retired metered board capture",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const wf=fs.readFileSync(path.join(__dirname,
  "../.github/workflows/nhl-0900-board-delta.yml"),"utf8");
 const trial=fs.readFileSync(path.join(__dirname,
  "../.github/workflows/trial-free-prizepicks-nhl.yml"),"utf8");
 const tracker=fs.readFileSync(path.join(__dirname,
  "../scripts/track-free-nhl-line-movement.cjs"),"utf8");
 assert.match(wf,/Metered NHL 9 AM Collector Paused/);
 assert.match(wf,/No Vendor Calls/);
 assert.doesNotMatch(wf,/^\s+schedule:/m);
 assert.doesNotMatch(wf,/collect-prizepicks-asof-nhl\.cjs|PRIZEPICKSAPI_KEY/);
 assert.match(trial,/node scripts\/collect-prizepicks-asof-nhl\.cjs/);
 assert.match(trial,/cron: '15 16 1 \* \*'/);
 assert.match(tracker,/summarizeMorningNhlDelta/);
 assert.ok(!wf.includes("PRIVATE_DISCORD_WEBHOOK_URL"));
});
