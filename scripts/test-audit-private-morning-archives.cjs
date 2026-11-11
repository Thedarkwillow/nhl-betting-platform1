"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),
 fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {validate,main}=require("./audit-private-morning-archives.cjs");
function fixture({slot="06:00",day="2026-11-10",
 captured="2026-11-10T14:20:19Z",nhl=200,nfl=1000,
 corrupt=false,missingNFL=false,notMorning=false,missingIds=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"nhl-nfl-original-archive-test-")),
  name=captured.slice(0,19).replace(/[-:]/g,"")+"Z",
  folder=path.join(root,"outputs/manual-board-captures",day,name);
 fs.mkdirSync(folder,{recursive:true});
 const started=new Date(Date.parse(captured)-1000).toISOString(),
  observed=new Date(Date.parse(captured)-400).toISOString(),
  columns=Array.from({length:22},(_,i)=>"field"+i);
 const sports=[];
 for(const [sport,count,league] of [["NHL",nhl,8],["NFL",nfl,9]]){
  if(sport==="NFL"&&missingNFL)continue;
  const rows=Array.from({length:count},(_,i)=>{
   const a=Array(22).fill(null);a[0]=sport+"-"+(missingIds?0:i);return a;
  });
  const child=sport.toLowerCase()+"-01.json";
  fs.writeFileSync(path.join(folder,child),JSON.stringify({
   sport,startIndex:0,observedAtUTC:observed,rows
  }));
  sports.push({sport,leagueId:league,rawCount:count,
   parts:1,sourceObservedAt:observed,missingPlayers:0,
   missingGames:0,belowMorningMinimumInventory:false});
 }
 const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",
  snapshotMode:"direct_live_board",captureSlotPacific:slot,
  actualCaptureInRequestedHour:!notMorning,
  notSixOrNineAmSlot:notMorning,pacificDate:day,
  captureStartedUTC:started,captureFinishedUTC:captured,
  hasBelowMorningMinimumInventory:false,columns,sports,
  completePagination:!corrupt};
 fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest));
 return {root,folder};
}
test("both full leagues are required to validate real 6AM source archived before future games",()=>{
 const {root}=fixture();
 try{
  const x=validate(root,"2026-11-10","06:00");
  assert.equal(x.verified,true);
  assert.equal(x.sourceCounts.NHL,200);
  assert.equal(x.sourceCounts.NFL,1000);
  assert.equal(x.observedAt,"2026-11-10T14:20:19Z");
  assert.equal(x.privateOriginalOnly,true);
  assert.equal(x.actualProviderCalls,0);
  assert.equal(x.matchingArchiveCount,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test("original Pacific 9AM must not read genuine 6AM or out-of-hour fake",()=>{
 const {root}=fixture();
 try{
  assert.equal(validate(root,"2026-11-10","09:00").verified,false);
  assert.equal(validate(root,"2026-11-09","06:00").verified,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
 const fake=fixture({notMorning:true});
 try{assert.equal(validate(fake.root,"2026-11-10","06:00").verified,false)}
 finally{fs.rmSync(fake.root,{recursive:true,force:true})}
});
test("incomplete pagination, below inventory, absent NFL, duplicate provider IDs all block green archive proof",()=>{
 for(const opts of [{corrupt:true},{nfl:100},{nhl:15},
  {missingNFL:true},{missingIds:true}]){
  const {root}=fixture(opts);
  try{assert.equal(validate(root,"2026-11-10","06:00").verified,false)}
  finally{fs.rmSync(root,{recursive:true,force:true})}
 }
});
test("invalid source date, wrong scheduled Pacific hour and missing original record never pass",()=>{
 const a=fixture({slot:"09:00",captured:"2026-11-10T14:20:19Z"});
 try{assert.equal(validate(a.root,"2026-11-10","09:00").verified,false)}
 finally{fs.rmSync(a.root,{force:true,recursive:true})}
 assert.throws(()=>validate("/tmp/unused","2026-11-10","14:00"),/Invalid/);
});
test("no falsely successful source audit if original first Git commit cannot be verified",()=>{
 const {root}=fixture();
 try{
  assert.equal(validate(root,"2026-11-10","06:00",{requireGit:true}).verified,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
