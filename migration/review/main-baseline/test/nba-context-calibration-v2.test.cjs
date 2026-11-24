"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {teamSnapshot,contextFor,availabilityAt,features,buildRows,scores,trainCalibration,audit}=require("../src/nba-context-calibration-v2.cjs");
const q={season:2026,season_type:"regular",before:"2026-01-19",league:"nba"};
const at="2026-11-24T19:15:00Z";
const teams=Array.from({length:30},(_,i)=>({team_id:String(i+1),abbrev:i===0?"BOS":"T"+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),games:35,pace:99+i/10,def_rating:105+i/3,off_rating:110}));
const snap=()=>teamSnapshot({data:{season:2026,count:30,teams}},q,at);
test("team context requires complete league and cutoff not after target",()=>{
 const x=snap();assert.equal(contextFor([x],"2026-01-18","BOS"),null);assert.ok(contextFor([x],"2026-01-20","BOS"));assert.equal(contextFor([x],"2026-01-28","BOS"),null);
 assert.throws(()=>teamSnapshot({data:{season:2026,count:29,teams:teams.slice(1)}},q,at));
});
const prior=Array.from({length:20},(_,i)=>({gameId:String(i+1),date:"2026-01-"+String(i+1).padStart(2,"0"),opponent:"BOS",minutes:30+i%5,points:20+i%9,usageProxyPerMinute:.6+i%4/10,starter:true}));
test("minutes and role features never use target date or future performance",()=>{
 const t={date:"2026-01-21",opponent:"BOS"},a=features(prior,t,25.5,"player_points",[snap()]);
 const b=features([...prior,{...prior[0],date:t.date,minutes:60,points:100,usageProxyPerMinute:30},{...prior[0],date:"2026-02-01",points:99}],t,25.5,"player_points",[snap()]);
 assert.deepEqual(a,b);assert.ok(a.predictedMinutes<40);assert.equal(a.priorStartRate,1);assert.equal(a.teammateAbsenceAdjustment,null);assert.equal(a.positionalDefenseAdjustment,null);
 assert.equal(features(prior.slice(0,11),t,25.5,"player_points",[]),null);
});
test("availability missing, stale, or ambiguous is never assumed healthy",()=>{
 const s={kind:"nba_pregame_availability_v1",observedAt:"2026-11-24T18:00:00Z",rows:[{team:"BOS",playerId:"1",identityVerified:true,status:"out"},{team:"BOS",playerId:"2",identityVerified:true,status:"available"}]};
 assert.deepEqual(availabilityAt(s,"2026-11-24T20:00:00Z","BOS",["1","2","3"]),{out:["1"],uncertain:[],available:["2"],unknown:["3"]});
 assert.equal(availabilityAt(s,"2026-11-24T17:00:00Z","BOS",["1"]),null);
 assert.equal(availabilityAt(s,"2026-11-25T02:00:00Z","BOS",["1"]),null);
});
const samples=Array.from({length:150},(_,i)=>({id:"row"+i,gameId:"game"+i,date:"2026-01-"+String(20+i%12).padStart(2,"0"),market:"player_points",y:i%2,old:.6,rec:.7,original:.635,minutesP:.65,marketP:.53,predictedMinutes:33,actualMinutes:32,priorStartRate:1,usageP:.62,paceP:null,defenseP:null}));
test("calibration refuses tiny sample and computes reliability on held-out rows",()=>{
 assert.equal(trainCalibration(samples.slice(0,11),"old"),null);
 assert.ok(trainCalibration(samples,"old"));
 assert.ok(Math.abs(scores(samples,"old").ece-.1)<1e-9);
});
test("chronological split, paired comparisons and no automatic promotion",()=>{
 const train=samples.slice(0,20).map((r,i)=>({...r,id:"dev"+i,date:"2026-01-10"}));
 const hold=samples.slice(0,25).map((r,i)=>({...r,id:"hold"+i,date:"2026-02-05",paceP:i%2?.6:null}));
 const a=audit([...train,...samples,...hold]);
 assert.equal(a.trainRows,20);assert.equal(a.calibrationRows,150);assert.equal(a.holdoutRows,25);
 assert.equal(a.paired.paceP.baseline.n,12);assert.equal(a.paired.paceP.candidate.n,12);assert.equal(a.prospectiveApproval,false);
 assert.throws(()=>audit([...train,train[0]]));
});
