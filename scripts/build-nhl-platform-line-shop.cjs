"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildPlatformLineShop}=require("../src/nhl-platform-line-shop.cjs");
const root=path.resolve(__dirname,"..");
const optional=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
function main(){
 const schedule=optional("outputs/official-nhl/season-schedules/2026-27.json");
 if(!schedule?.complete)throw Error("Official complete 2026-27 NHL schedule required for any platform match");
 const pp=optional("outputs/free-source/nhl/latest.json");
 const ud=optional("outputs/underdog/nhl/latest.json");
 const officialPlayers=optional("outputs/projections/players.json");
 const report=buildPlatformLineShop(pp,ud,schedule,new Date().toISOString(),officialPlayers);
 const target=path.join(root,"outputs/comparisons/nhl-platform-line-shop-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,prizePicksObservedProps:report.prizePicksObservedProps,
  underdogObservedProps:report.underdogObservedProps,standardSideMatches:report.standardSideMatches,
  publicMatches:report.publicComparisons.length,noUnverifiedUnderdogFabrication:true}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
