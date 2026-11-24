"use strict";
const fs=require("node:fs"),path=require("node:path");
const {backtestContext}=require("../src/nhl-context-backtest.cjs");
const file=path.resolve(__dirname,"../outputs/history/players.json");
const report={...backtestContext(JSON.parse(fs.readFileSync(file,"utf8"))),generatedAt:new Date().toISOString()};
const out=path.resolve(__dirname,"../outputs/backtests/nhl-context-latest.json");
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({observations:report.observations,pass:Object.fromEntries(Object.entries(report.byMarket).map(([m,v])=>[m,v.adjustmentPassed])),byMarket:report.byMarket}));
