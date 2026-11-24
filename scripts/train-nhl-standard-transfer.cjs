"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {fit}=require("../src/nhl-standard-season-transfer.cjs");
function main(){
 if(!process.argv[2])throw Error("Temporary private input required");
 const rows=fs.readFileSync(process.argv[2],"utf8").trim().split("\n").map(s=>JSON.parse(s));
 const report=fit(rows,{codeCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()});
 if(Object.keys(report.byMarket).length!==6||Object.values(report.byMarket).some(m=>!m.eligibleForShadow))throw Error("Insufficient three-season matched research support");
 for(const season of [2023,2024,2025])if(report.sourceCounts[season+"|skater"]<30000||report.sourceCounts[season+"|goalie"]<1500)throw Error("Incomplete archive");
 const dest=path.join(__dirname,"..","outputs","backtests","nhl-standard-three-season-transfer-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
 console.log("PASS: private market-specific historical fit and frozen holdout aggregates.");
}
if(require.main===module)main();
