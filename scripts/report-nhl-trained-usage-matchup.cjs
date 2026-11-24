"use strict";
const fs=require("node:fs"),path=require("node:path");
const {evaluate}=require("../src/nhl-trained-usage-matchup.cjs");
function main(){
 const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/player-stats");
 const names=fs.readdirSync(dir).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
 const result=evaluate(names.map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8"))));
 if(!result.evaluatedRows||!result.acceptedDates.some(d=>d>=result.trainBefore))throw Error("No archived chronological comparison available");
 const dest=path.join(root,"outputs/backtests/nhl-trained-usage-matchup-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify({...result,generatedAt:new Date().toISOString()},null,2)+"\n");
 console.log("Private retrospective usage/matchup comparison generated; model unchanged.");
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
