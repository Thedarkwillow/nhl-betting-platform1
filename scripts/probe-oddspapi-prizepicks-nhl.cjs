"use strict";
const fs=require("node:fs"),path=require("node:path");
const {extractPrizePicksFixture}=require("../src/oddspapi-prizepicks-history.cjs");
const base="https://api.oddspapi.io/v4";
const WINDOWS=[
 {season:"2025-26",from:"2026-01-15T00:00:00Z",to:"2026-01-17T00:00:00Z"},
 {season:"2025-26",from:"2026-03-11T00:00:00Z",to:"2026-03-13T00:00:00Z"},
 {season:"2025-26",from:"2026-05-07T00:00:00Z",to:"2026-05-09T00:00:00Z"},
 {season:"2026-27",from:"2026-10-14T00:00:00Z",to:"2026-10-16T00:00:00Z"}
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(key,endpoint,params,{retryMs=3500}={}){
 const url=new URL(base+"/"+endpoint);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 url.searchParams.set("apiKey",key);
 // Retry only provider 5xx failures, never 401/403/402/429 or 404.
 // Maximum 2 attempts protects free monthly quota and avoids a noisy loop.
 for(let attempt=0;attempt<2;attempt++){
  const res=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(res.ok)return res.json();
  let errorCode="unknown",errorMessage="unknown";
  try{const body=await res.json();
   errorCode=String(body?.error?.code||"unknown");
   errorMessage=String(body?.error?.message||"unknown");
  }catch{}
  const e=new Error("OddsPapi "+endpoint+" HTTP "+res.status+" "+errorCode+" "+
   errorMessage.replace(/api[_-]?key[^ ]*/gi,"[redacted]"));
  e.status=res.status;e.code=errorCode;
  if(res.status>=500&&res.status<=599&&attempt===0){
   console.warn("OddsPapi "+endpoint+" temporary HTTP "+res.status+"; retry once");
   await sleep(retryMs);continue;
  }
  throw e;
 }
}
async function main(){
 const key=process.env.ODDSPAPI_API_KEY;
 if(!key)throw Error("Missing ODDSPAPI_API_KEY Actions secret. No OddsPapi requests made.");
 const defs=await request(key,"markets",{language:"en"});
 if(!Array.isArray(defs)||!defs.length)throw Error("OddsPapi market catalog not available");
 const markets=Object.fromEntries(defs.map(m=>[String(m.marketId),m]));
 const windows=[],samples=[],errors=[],seen=new Set();
 for(const window of WINDOWS){
  await sleep(2100);
  let fixtures=[],filteredStatus="available",fallbackUsed=false;
  try{
   fixtures=await request(key,"fixtures",{sportId:15,tournamentId:234,
     from:window.from,to:window.to,statusId:2,hasOdds:true,bookmakers:"prizepicks"});
  }catch(error){
   if(error.status!==404)throw error;
   filteredStatus="no_matching_prizepicks_fixtures_or_filter";
   console.log(JSON.stringify({season:window.season,filteredFixtures404:error.code,message:error.message}));
   await sleep(2500);
   fixtures=await request(key,"fixtures",{sportId:15,tournamentId:234,
    from:window.from,to:window.to,statusId:2});
   fallbackUsed=true;
  }
  if(!Array.isArray(fixtures))throw Error("OddsPapi fixtures response invalid");
  const candidates=fixtures.filter(f=>String(f.tournamentId)==="234"&&String(f.sportId)==="15"&&
   typeof f.fixtureId==="string"&&Number.isFinite(Date.parse(f.startTime)));
  const selected=candidates.slice(0,3);
  let found=0;
  for(const fixture of selected){
   if(seen.has(fixture.fixtureId))continue;
   seen.add(fixture.fixtureId);
   await sleep(5100);
   try{
    const data=await request(key,"historical-odds",{fixtureId:fixture.fixtureId,bookmakers:"prizepicks"});
    const parsed=extractPrizePicksFixture(data,markets,fixture);
    found+=parsed.rows.length;
    samples.push({season:window.season,fixtureId:fixture.fixtureId,
     eventStartsAt:fixture.startTime,teams:[fixture.participant1Name,fixture.participant2Name],
     hasPrizePicks:parsed.hasPrizePicks,eligibleHistoricalRows:parsed.rows.length,
     issues:parsed.issues,rows:parsed.rows.slice(0,250)});
   }catch(e){
    if(e.status===404){
     errors.push({season:window.season,fixtureId:fixture.fixtureId,
      type:"no_matching_historical_prizepicks_odds",code:e.code,error:e.message});
     samples.push({season:window.season,fixtureId:fixture.fixtureId,
      eventStartsAt:fixture.startTime,hasPrizePicks:false,
      eligibleHistoricalRows:0,issues:["historical_odds_not_found"],rows:[]});
    }else{
     errors.push({season:window.season,fixtureId:fixture.fixtureId,
      type:"api_failure",code:e.code||"unknown",error:e.message});
     throw e;
    }
   }
  }
  windows.push({season:window.season,from:window.from,to:window.to,
   candidateFixtures:candidates.length,sampledFixtures:selected.length,
   filteredStatus,fallbackUsed,historicalPrizePicksRows:found});
  console.log(JSON.stringify(windows.at(-1)));
 }
 const report={generatedAt:new Date().toISOString(),status:"limited_source_verification",
  provider:"OddsPapi",archive:"PrizePicks (not ordinary sportsbook quotes)",
  requestsBudgetedMaximum:21,officiallyVerifiedTiers:false,playerNameArchiveComplete:false,
  seasons:windows,samples,errors,
  warning:"A manually triggered sample only. No claim of complete 2025-26 coverage; historical data starts January 2026. Player identities and Goblin/Demon tier labels are not verified by this feed. PrizePicks flat 1.73 prices are not actual payout quotes. No verified prop hit rates."};
 const dir=path.resolve(__dirname,"../outputs/oddspapi/nhl");
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"archive-probe-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({windows,errors:errors.length,notes:report.warning}));
 // Missing PrizePicks odds on a sampled fixture is an audited zero, not a fatal error.
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,request};
