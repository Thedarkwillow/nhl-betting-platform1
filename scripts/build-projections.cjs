"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {buildProjections}=require("../src/projections.cjs");
const {buildMarketTrainedShadow,compareHistoricalHoldout}=
 require("../src/nhl-trained-market-shadow.cjs");
const {buildFourPriorityShadow}=require("../src/nhl-four-priority-shadow.cjs");
const {buildExtraMarketShadow}=require("../src/nhl-extra-market-shadow.cjs");
const stamp=()=>new Date().toISOString();
const pacificDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",
 year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
async function main(){
 const root=path.join(__dirname,"..");
 const history=JSON.parse(await fs.readFile(path.join(root,"outputs/history/players.json"),"utf8"));
 const builtAt=stamp(),latestSourceDate=history.sourceFiles?.at(-1)||null;
 // Champion remains unchanged; no production recommendations can read shadow.
 const champion={...buildProjections(history),builtAt,latestSourceDate};
 const shadow={...buildProjections(history,{model:"stable-shrink-v2"}),builtAt,
  latestSourceDate,status:"research_shadow_not_deployed",
  caution:"No validated Higher/Lower, platform settlement, probability calibration or ROI."};
 const priorMean={...buildProjections(history,{model:"prior-mean-v2"}),builtAt,
  latestSourceDate,status:"research_shadow_not_deployed",
  caution:"Baseline challenger only. No verified Higher/Lower, payout or ROI."};
 // The market policy is derived only from 2024-25 official training MAE;
 // archived 2025-26 holdout is descriptive only and never tunes weights.
 // Missing training evidence must not take the production champion offline.
 let trained=null,trainedAudit=null;
 try{
  const lab=JSON.parse(await fs.readFile(path.join(root,
   "outputs/backtests/nhl-official-season-projection-lab-latest.json"),"utf8"));
  trained=buildMarketTrainedShadow(history,lab,{asOf:builtAt});
  trained.latestSourceDate=latestSourceDate;
  trainedAudit={...compareHistoricalHoldout(lab,trained.training),generatedAt:builtAt,
   source:"cached_official_NHL_historical_stat_research"};
 }catch(e){
  console.warn("Market-trained shadow skipped; champion unchanged: "+e.message);
 }
 const dir=path.join(root,"outputs/projections");
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,"players.json"),JSON.stringify(champion,null,2)+"\n");
 await fs.writeFile(path.join(dir,"stable-shrink-v2-latest.json"),JSON.stringify(shadow,null,2)+"\n");
 await fs.writeFile(path.join(dir,"prior-mean-v2-latest.json"),JSON.stringify(priorMean,null,2)+"\n");
 // User-priority markets: separate private shadow, no change to the six
 // canonical production selections or lineup/payout logic.
 const fourPriority=buildFourPriorityShadow(history,{asOf:builtAt});
 await fs.writeFile(path.join(dir,"nhl-four-priority-shadow-latest.json"),
  JSON.stringify(fourPriority,null,2)+"\n");
 const extraMarket=buildExtraMarketShadow(history,{asOf:builtAt});
 await fs.writeFile(path.join(dir,"nhl-extra-market-shadow-latest.json"),
  JSON.stringify(extraMarket,null,2)+"\n");
 if(trained){
  await fs.writeFile(path.join(dir,"nhl-market-trained-v3-latest.json"),
   JSON.stringify(trained,null,2)+"\n");
  const backtests=path.join(root,"outputs/backtests");
  await fs.mkdir(backtests,{recursive:true});
  await fs.writeFile(path.join(backtests,"nhl-trained-market-v3-holdout-latest.json"),
   JSON.stringify(trainedAudit,null,2)+"\n");
 }
 // First writer wins: never revise a captured daily shadow projection with
 // post-puck-drop information. First Git commit still requires independent proof.
 const snapshots=path.join(dir,"shadow-snapshots");await fs.mkdir(snapshots,{recursive:true});
 const day=pacificDate(),target=path.join(snapshots,day+".json");
 const frozen={schemaVersion:1,snapshotDatePacific:day,builtAt,
  latestSourceDate,status:"research_shadow_not_deployed",
  models:{"stable-shrink-v2":shadow,"prior-mean-v2":priorMean,
   ...(trained?{"nhl-market-trained-v3":trained}:{})}};
 try{
  const fd=await fs.open(target,"wx");
  try{await fd.writeFile(JSON.stringify(frozen)+"\n");}
  finally{await fd.close();}
  console.log("First immutable daily research shadow snapshot: "+day);
 }catch(e){if(e.code!=="EEXIST")throw e;console.log("Preserving original shadow snapshot for "+day);}
 console.log("Champion projection records: "+champion.playerCount+
  "; challenger shadow eligible players: "+shadow.readyPlayers+
  "; trained market shadow eligible players: "+(trained?.readyPlayers??"unavailable")+
  "; new four-market research ready players: "+
  JSON.stringify(Object.fromEntries(Object.entries(fourPriority.sourceSampleCoverage).
   map(([k,v])=>[k,v.eligiblePlayers])))+
  "; production model unchanged");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
