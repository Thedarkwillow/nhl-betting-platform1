"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {evaluate}=require("../src/backtest.cjs");
const root=path.resolve(__dirname,"..");
const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
const result={...evaluate(history),generatedAt:new Date().toISOString(),
 historyBuiltAt:history.builtAt||null};
const out=path.join(root,"outputs/backtests");
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,"nhl-probabilities-latest.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({predictions:result.predictions,dates:result.distinctGameDates,
 weightedBrier:result.overall.brier.weighted,seasonBrier:result.overall.brier.season,last5Brier:result.overall.brier.last5,marketDecisions:result.marketDecisions}));
