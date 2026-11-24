"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
function compare(a,b){
 if(!a||!b||!a.completePagination||!b.completePagination||
    a.slotPacific!=="06:00"||b.slotPacific!=="09:00"||
    a.datePacific!==b.datePacific||a.platform!==b.platform)
  throw Error("Must compare complete same-date 06:00 and 09:00 independent provider boards");
 const key=r=>r.id;
 const x=new Map(a.offers.map(r=>[key(r),r])),y=new Map(b.offers.map(r=>[key(r),r]));
 const delta={added:[],removedFromSource:[],changed:[],unchangedCount:0};
 for(const [id,after] of y){
  const before=x.get(id);
  if(!before){delta.added.push(after);continue;}
  if(before.line!==after.line||before.market!==after.market||
     before.period!==after.period||JSON.stringify(before.sides)!==JSON.stringify(after.sides))
   delta.changed.push({id,before,after});
  else delta.unchangedCount++;
 }
 for(const [id,before] of x)if(!y.has(id))delta.removedFromSource.push(before);
 return {schemaVersion:1,kind:"nfl_0600_vs_0900_independent_board_delta",
  datePacific:a.datePacific,source:"prizepicksapi.com",
  firstPartyPrizePicksRemovalConfirmed:false,rawSourceNotAuthorizedForPublicDisplay:true,
  counts:{morning:x.size,late:y.size,added:delta.added.length,
  removedFromSource:delta.removedFromSource.length,changed:delta.changed.length,
  unchanged:delta.unchangedCount},...delta};
}
function main(){
 const clock=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 // Avoid Intl locale-specific date order for file names.
 const d=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const date=d.year+"-"+d.month+"-"+d.day;
 const folder=path.join(ROOT,"outputs/nfl/boards",date);
 const read=f=>JSON.parse(fs.readFileSync(path.join(folder,f),"utf8"));
 const out=compare(read("0600.json"),read("0900.json"));
 fs.writeFileSync(path.join(folder,"delta.json"),JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({date,counts:out.counts}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1}
module.exports={compare};
