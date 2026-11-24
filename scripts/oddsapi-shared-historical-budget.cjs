"use strict";
/**
 * Shared ceiling for the two historical 2025-26 NHL Odds API collectors.
 * This is a finite project-wide historical research budget, not a promise
 * to guard every independent Odds API integration or the provider's full
 * monthly account quota. Workflow concurrency serialization is essential.
 */
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"../outputs/the-odds-api/nhl");
const FALL=path.join(ROOT,"2025-26-fall-backfill/progress.json");
const ALL=path.join(ROOT,"2025-26-all-props/progress.json");
const MAX_COMBINED_HISTORICAL_CREDITS=2500;
const ACCOUNT_CREDIT_RESERVE=350;
function readSpent(file,reader=fs){
 if(!reader.existsSync(file))return 0;
 let doc;
 try{doc=JSON.parse(reader.readFileSync(file,"utf8"));}
 catch{throw Error("Invalid shared history budget state: "+path.basename(file));}
 const spent=doc?.creditsSpentTotal;
 if(!Number.isSafeInteger(spent)||spent<0)
  throw Error("Missing or invalid historical credit total: "+path.basename(file));
 return spent;
}
function status(override={}){
 const fall=override.fall??readSpent(FALL);
 const all=override.all??readSpent(ALL);
 if(![fall,all].every(x=>Number.isSafeInteger(x)&&x>=0))
  throw Error("Invalid shared historical credit counts");
 const used=fall+all;
 return {schemaVersion:1,budgetScope:"2025-26 historical NHL fall and all-market paid Odds API collectors only",
  combinedCap:MAX_COMBINED_HISTORICAL_CREDITS,fallCredits:fall,allMarketCredits:all,
  combinedCredits:used,remainingCombinedCredits:Math.max(0,MAX_COMBINED_HISTORICAL_CREDITS-used),
  accountReserveCredits:ACCOUNT_CREDIT_RESERVE};
}
function canSpend(anticipated,{fallUncommitted=0,accountRemaining=null,override=null}={}){
 if(!Number.isSafeInteger(anticipated)||anticipated<0||
    !Number.isSafeInteger(fallUncommitted)||fallUncommitted<0)
  throw Error("Invalid anticipated/uncommitted credit count");
 const s=status(override||{});
 const effectiveTotal=s.combinedCredits+fallUncommitted;
 const budgetOk=effectiveTotal+anticipated<=MAX_COMBINED_HISTORICAL_CREDITS;
 const quotaOk=Number.isSafeInteger(accountRemaining)&&accountRemaining>=
    ACCOUNT_CREDIT_RESERVE+anticipated;
 return {allowed:budgetOk&&quotaOk,
  reason:!budgetOk?"historical_shared_cap":!quotaOk?"provider_credit_reserve":"ok",
  historicalCombinedSpent:effectiveTotal,anticipated,
  historicalCreditsAvailable:Math.max(0,MAX_COMBINED_HISTORICAL_CREDITS-effectiveTotal),
  providerRemaining:accountRemaining};
}
if(require.main===module){
 try{console.log(JSON.stringify(status(),null,2));}
 catch(e){console.error("Shared historical budget check:",e.message);process.exitCode=1;}
}
module.exports={MAX_COMBINED_HISTORICAL_CREDITS,ACCOUNT_CREDIT_RESERVE,
 FALL,ALL,readSpent,status,canSpend};
