"use strict";
const fs=require("node:fs");
const path=require("node:path");
const source=process.env.NHL_BOARD_SOURCE||"prizepicks";
if(!["pickfinder","prizepicks"].includes(source))throw Error("Invalid source");
const dir=path.join("outputs","board-categories",source);
const inventory=JSON.parse(fs.readFileSync("outputs/discovery/"+source+"-nhl-categories-latest.json","utf8"));
const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>/^\d{3}\.json$/.test(x)):[];
const records=files.map(file=>JSON.parse(fs.readFileSync(path.join(dir,file),"utf8")));
const key=r=>[r.player,r.team,r.market,r.line,r.tier,r.period,r.matchup,r.isLive].map(x=>String(x??"").trim().toLowerCase()).join("|");
const deduped=new Map(),conflicts=[];
const rejected={stale:0,incomplete:0,wrongMarket:0,invalid:0};
const now=Date.now(),freshnessHours=8;
const marketAliases={"goals":["goals","goal"],"points":["points","point"],"assists":["assists","assist"],"shots on goal":["shots on goal","shots","sog"],"goalie saves":["goalie saves","saves"],"blocked shots":["blocked shots","blocks"],"hits":["hits"],"faceoffs won":["faceoffs won"]};
const normalized=x=>String(x??"").normalize("NFKC").trim().toLowerCase();
const audit=report=>{
 const ageHours=report?.capturedAt?(now-Date.parse(report.capturedAt))/3600000:null;
 const expected=marketAliases[normalized(report?.category)];
 const mismatches=expected?(report.rows||[]).filter(row=>!expected.includes(normalized(row.market))).length:0;
 return {ageHours:Number.isFinite(ageHours)?Math.round(ageHours*10)/10:null,
  fresh:Number.isFinite(ageHours)&&ageHours>=0&&ageHours<=freshnessHours,
  marketMismatches:mismatches,marketAuditApplied:!!expected};
};
for(const report of records)for(const row of report.rows||[]){
 const quality=audit(report);
 const expected=marketAliases[normalized(report.category)];
 if(!report.complete){rejected.incomplete++;continue;}
 if(!quality.fresh){rejected.stale++;continue;}
 if(expected&&!expected.includes(normalized(row.market))){rejected.wrongMarket++;continue;}
 if(!row.player||!row.market||!Number.isFinite(Number(row.line))){rejected.invalid++;continue;}

 const k=key(row);
 if(!deduped.has(k))deduped.set(k,{...row,seenInCategories:[report.category]});
 else{
  const existing=deduped.get(k);
  if(!existing.seenInCategories.includes(report.category))existing.seenInCategories.push(report.category);
 }
}
const categoryReports=inventory.categories.map((category,index)=>{
 const report=records.find(x=>x.index===index);
 const quality=audit(report);
 const status=!report?"not_attempted":!report.complete?"partial":quality.marketMismatches?"suspect_market":"complete";
 return {index,category:category.name,status,rows:report?.rows?.length||0,blocker:report?.blocker||null,...quality};
});
const summary={source,generatedAt:new Date().toISOString(),discoveredCategories:inventory.categories.length,attemptedCategories:categoryReports.filter(x=>x.status!=="not_attempted").length,completeCategories:categoryReports.filter(x=>x.status==="complete").length,partialCategories:categoryReports.filter(x=>x.status==="partial").length,suspectCategories:categoryReports.filter(x=>x.status==="suspect_market").length,freshCategories:categoryReports.filter(x=>x.fresh).length,notAttemptedCategories:categoryReports.filter(x=>x.status==="not_attempted").length,rawRows:records.reduce((n,r)=>n+(r.rows||[]).length,0),distinctRows:deduped.size,eligibleRows:deduped.size,rejectedRows:rejected,eligibleRowsPolicy:"Only fresh (<=8h), complete categories; explicit market mismatch rows excluded. Not independently verified against PrizePicks.",coverageComplete:inventory.navigationExhausted===true&&categoryReports.every(x=>x.status==="complete"),freshnessHours,allCategoriesFresh:categoryReports.every(x=>x.fresh),safeForLiveUse:false,categoryReports,rows:[...deduped.values()]};
fs.mkdirSync("outputs/board-merged",{recursive:true});
fs.writeFileSync("outputs/board-merged/"+source+"-nhl-latest.json",JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({...summary,rows:undefined,categoryReports:undefined}));
