"use strict";
const fs=require("node:fs");
const {convert}=require("./import-pickfinder-csv.cjs");
const raw=JSON.parse(fs.readFileSync("outputs/pickfinder/nhl-collected-latest.json","utf8"));
const history=JSON.parse(fs.readFileSync("outputs/history/players.json","utf8"));
const report=convert(raw.rows,history);
report.capturedAt=raw.capturedAt;
report.pagesVisited=raw.pagesVisited;
report.partial=raw.partial;
fs.writeFileSync("outputs/pickfinder/import-latest.json",JSON.stringify(report,null,2)+"\n");
fs.writeFileSync("outputs/pickfinder/lines-latest.json",JSON.stringify({lines:report.lines},null,2)+"\n");
console.log(JSON.stringify(report.summary));
if(!report.lines.length){
  console.error("Sample collected rows:",JSON.stringify(raw.rows.slice(0,4)));
  console.error("Sample historical players:",JSON.stringify(Object.values(history.players||{}).slice(0,4).map(p=>({name:p.name,team:p.team,playerId:p.playerId}))));
  console.error("Sample unmatched:",JSON.stringify(report.unmatched.slice(0,4)));
}
if(!report.lines.length)console.warn("No matched NHL lines: preserving diagnostic reports instead of aborting the workflow."); 
