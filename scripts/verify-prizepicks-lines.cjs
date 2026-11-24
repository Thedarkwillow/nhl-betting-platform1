"use strict";
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):null;
const primary=read("outputs/pickfinder/lines-latest.json");
const verify=read("outputs/prizepicks/nhl-lines-latest.json");
const pickRaw=read("outputs/pickfinder/nhl-collected-latest.json");
const prizeRaw=read("outputs/prizepicks/nhl-raw-latest.json");
const hours=(t,now)=>(now-Date.parse(t))/3600000;
function reconcile(pick,prize,{now=new Date(),maxAgeHours=12,maxGapHours=2}={}){
 const report={schemaVersion:1,generatedAt:now.toISOString(),primary:"PickFinder",verification:"PrizePicks",
  status:"unverified",matched:[],different:[],missingOnPrizePicks:[],missingOnPickFinder:[],
  ambiguous:[],excluded:[],summary:{}};
 if(!pick?.lines?.length){report.status="primary_unavailable";return report;}
 if(!prize?.lines?.length){report.status="verification_unavailable";return report;}
 const valid=(line,source)=>{
  if(!line||line.source!==source||!Number.isInteger(line.playerId)||!line.market||!Number.isFinite(line.line)||!Number.isFinite(Date.parse(line.capturedAt))){report.excluded.push({line,reason:"invalid metadata"});return false;}
  const age=hours(line.capturedAt,now);
  if(age<-.25||age>maxAgeHours){report.excluded.push({line,reason:"stale or future timestamp"});return false;}
  return true;
 };
 const key=l=>l.playerId+":"+l.market;
 const group=lines=>{const m=new Map();for(const l of lines){const k=key(l);m.set(k,[...(m.get(k)||[]),l]);}return m;};
 const a=group(pick.lines.filter(l=>valid(l,"PickFinder")));
 const b=group(prize.lines.filter(l=>valid(l,"PrizePicks")));
 for(const k of new Set([...a.keys(),...b.keys()])){
  const left=a.get(k)||[],right=b.get(k)||[];
  if(left.length>1||right.length>1){report.ambiguous.push({key,pickFinder:left,prizePicks:right});continue;}
  if(!left.length){report.missingOnPickFinder.push(right[0]);continue;}
  if(!right.length){report.missingOnPrizePicks.push(left[0]);continue;}
  const p=left[0],v=right[0];
  if(Math.abs(Date.parse(p.capturedAt)-Date.parse(v.capturedAt))>maxGapHours*3600000){report.excluded.push({key,reason:"collection times too far apart",pickFinder:p,prizePicks:v});continue;}
  const item={playerId:p.playerId,playerName:p.playerName,market:p.market,pickFinderLine:p.line,prizePicksLine:v.line,pickFinderCapturedAt:p.capturedAt,prizePicksCapturedAt:v.capturedAt};
  (p.line===v.line?report.matched:report.different).push(item);
 }
 report.status="compared";
 report.summary={matched:report.matched.length,different:report.different.length,missingOnPrizePicks:report.missingOnPrizePicks.length,missingOnPickFinder:report.missingOnPickFinder.length,ambiguous:report.ambiguous.length,excluded:report.excluded.length};
 return report;
}
function main(){
 const report=reconcile(primary,verify);
 report.primarySnapshotComplete=pickRaw?.partial===false&&pickRaw?.complete===true;
 report.verificationSnapshotComplete=prizeRaw?.complete===true;
 report.note="PickFinder remains primary. Missing props do not imply unavailable when either collection is partial. Matching lines are not independent evidence of favorable probability.";
 fs.mkdirSync("outputs/verification",{recursive:true});
 fs.writeFileSync("outputs/verification/prizepicks-latest.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,summary:report.summary,primaryComplete:report.primarySnapshotComplete,verificationComplete:report.verificationSnapshotComplete}));
}
if(require.main===module)main();
module.exports={reconcile};
