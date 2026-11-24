"use strict";
const fs=require("node:fs"),path=require("node:path");
const {request}=require("./probe-oddspapi-prizepicks-nhl.cjs");
const {extractPrizePicksFixture}=require("../src/oddspapi-prizepicks-history.cjs");
const root=path.resolve(__dirname,".."),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const windows=[
 {season:"2025-26",from:"2026-01-06T00:00:00Z",to:"2026-01-08T00:00:00Z"},
 {season:"2025-26",from:"2026-01-22T00:00:00Z",to:"2026-01-24T00:00:00Z"},
 {season:"2025-26",from:"2026-02-03T00:00:00Z",to:"2026-02-05T00:00:00Z"},
 {season:"2025-26",from:"2026-02-26T00:00:00Z",to:"2026-02-28T00:00:00Z"},
 {season:"2026-27",from:"2026-10-07T00:00:00Z",to:"2026-10-09T00:00:00Z"},
 {season:"2026-27",from:"2026-10-18T00:00:00Z",to:"2026-10-20T00:00:00Z"},
 {season:"2026-27",from:"2026-10-25T00:00:00Z",to:"2026-10-27T00:00:00Z"}
];
async function main(){
 const key=process.env.ODDSPAPI_API_KEY;
 if(!key)throw Error("ODDSPAPI_API_KEY missing: cannot expand archive");
 const dir=path.join(root,"outputs/oddspapi/nhl");
 const expanded=path.join(dir,"archive-expanded-latest.json");
 const fallback=path.join(dir,"archive-probe-latest.json");
 const base=JSON.parse(fs.readFileSync(fs.existsSync(expanded)?expanded:fallback,"utf8"));
 const defs=await request(key,"markets",{language:"en"}); // one paid metadata call
 if(!Array.isArray(defs))throw Error("OddsPapi market catalogue unavailable");
 const markets=Object.fromEntries(defs.map(m=>[String(m.marketId),m]));
 const existing=new Set((base.samples||[]).map(s=>s.fixtureId));
 const records=[...(base.samples||[])],coverage=[...(base.seasons||[])],errors=[...(base.errors||[])];
 const done=new Set(coverage.map(w=>[w.season,w.from,w.to].join("|")));
 let historyCalls=0,fixtureCalls=0,windowsAttempted=0;
 for(const w of windows){
  const key=[w.season,w.from,w.to].join("|");
  if(done.has(key))continue;
  if(fixtureCalls>=8)throw Error("Bounded to 8 new fixture-list requests per backfill");
  windowsAttempted++;
  await sleep(2100);
  let fixtures;
  try{
   fixtures=await request(key,"fixtures",{sportId:15,tournamentId:234,
    from:w.from,to:w.to,statusId:2}); // No filters on PrizePicks odds availability.
   fixtureCalls++;
  }catch(e){
   fixtureCalls++;
   if(e.status!==404)throw e;
   coverage.push({...w,candidateFixtures:0,sampledFixtures:0,historicalPrizePicksRows:0,
    historicalFixturesMissing:0,selection:"no_scheduled_completed_NHL_games_in_window"});
   console.log(JSON.stringify({season:w.season,from:w.from,selected:0,records:0,reason:"no_NHL_fixtures"}));
   continue;
  }
  if(!Array.isArray(fixtures))throw Error("OddsPapi historical NHL fixture list malformed");
  const eligible=fixtures.filter(f=>String(f.sportId)==="15"&&String(f.tournamentId)==="234"&&
    typeof f.fixtureId==="string"&&Number.isFinite(Date.parse(f.startTime)));
  const selected=eligible.filter(f=>!existing.has(f.fixtureId)).slice(0,5);
  let found=0,missing=0;
  for(const fixture of selected){
   existing.add(fixture.fixtureId);
   if(historyCalls>=40)throw Error("Bounded to 40 new historical board calls per backfill");
   await sleep(5100);
   historyCalls++;
   try{
    const archived=await request(key,"historical-odds",{fixtureId:fixture.fixtureId,bookmakers:"prizepicks"});
    const parsed=extractPrizePicksFixture(archived,markets,fixture);
    found+=parsed.rows.length;
    records.push({season:w.season,fixtureId:fixture.fixtureId,
      eventStartsAt:fixture.startTime,teams:[fixture.participant1Name,fixture.participant2Name],
      hasPrizePicks:parsed.hasPrizePicks,eligibleHistoricalRows:parsed.rows.length,
      issues:parsed.issues,rows:parsed.rows});
   }catch(e){
    if(e.status!==404)throw e;
    missing++;
    errors.push({season:w.season,fixtureId:fixture.fixtureId,
      type:"historical_prizepicks_not_found",httpStatus:404});
    records.push({season:w.season,fixtureId:fixture.fixtureId,
      eventStartsAt:fixture.startTime,teams:[fixture.participant1Name,fixture.participant2Name],
      hasPrizePicks:false,eligibleHistoricalRows:0,issues:["historical_odds_not_found"],rows:[]});
   }
  }
  coverage.push({...w,candidateFixtures:eligible.length,sampledFixtures:selected.length,
    historicalPrizePicksRows:found,historicalFixturesMissing:missing,selection:"first_five_unarchived_fixtures"});
  console.log(JSON.stringify({season:w.season,from:w.from,selected:selected.length,records:found,notFound:missing}));
 }
 const report={generatedAt:new Date().toISOString(),status:"expanded_partial_archive",
  provider:"OddsPapi",archive:"PrizePicks (not ordinary sportsbook quotes)",
  historicallyDocumentedFrom:"2026-01-01",coverageComplete:false,
  metadataRequestsMade:fixtureCalls+1,freeHistoricalOddsCalls:historyCalls,
  newWindowsAttempted:windowsAttempted,reusedPreviousArchive:true,unavailableBeforeArchive:"2026-01-01",
  playerNameArchiveComplete:false,officiallyVerifiedTiers:false,
  seasons:coverage,samples:records,errors,
  warning:"Incremental sampled windows, not complete seasons. October–December 2025 PrizePicks coverage remains unverified; do not interpret empty windows as complete absence. Tier-specific payouts are unknown. Historical observations were not pre-published model predictions."};
 fs.writeFileSync(path.join(dir,"archive-expanded-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({sampledFixtures:records.length,propRecords:records.reduce((n,r)=>n+r.rows.length,0),
  paidMetadataCalls:report.metadataRequestsMade,freeHistoryCalls:historyCalls}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
