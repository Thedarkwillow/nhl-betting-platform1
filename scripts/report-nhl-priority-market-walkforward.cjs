"use strict";
const fs=require("node:fs"),path=require("node:path");
const {runOfficialMarketWalkforward}=require("../src/nhl-priority-market-walkforward.cjs");
const root=path.resolve(__dirname,"..");
function main(){
 const input=path.join(root,"outputs/history/players.json");
 const history=fs.existsSync(input)?JSON.parse(fs.readFileSync(input,"utf8")):null;
 const study=runOfficialMarketWalkforward(history);
 const dir=path.join(root,"outputs/backtests");
 fs.mkdirSync(dir,{recursive:true});
 const out=path.join(dir,"nhl-priority-market-walkforward-latest.json");
 fs.writeFileSync(out,JSON.stringify(study,null,2)+"\n");
 console.log(JSON.stringify({status:study.status,season:study.season,
  markets:Object.fromEntries(Object.entries(study.markets).map(([k,v])=>[k,{
   scoredOfficialPlayerGames:v.scoredPlayerGames,mae5:v.last5MeanAbsoluteError,
   mae10:v.last10MeanAbsoluteError
  }])),providerCredits:0,modelPromoted:false}));
}
if(require.main===module)try{main();}catch(e){
 console.error(e.message);process.exitCode=1;
}
module.exports={main};
