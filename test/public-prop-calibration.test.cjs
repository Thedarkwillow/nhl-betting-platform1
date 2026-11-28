'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {observation,organize,freezeValid,run}=require('../scripts/public-prop-calibration.cjs');
const {history}=require('../scripts/pickfinder-public-model-validation.cjs');
const day=86400000,iso=t=>new Date(t).toISOString(),fitAt='2026-11-27T22:00:00Z',futureAt='2026-12-20T01:00:00Z';
const epoch=Date.parse('2026-10-01T23:00:00Z'),model='f'.repeat(64);
function row(i,{sport='NHL',book='prizepicks',tier='standard',side='Higher',forecast=epoch+Math.floor(i/5)*day,line=2.5,actual=i%3?3:2}={}){
 const p={book,playerId:i,gameId:String(i),market:'sample',line};
 return observation({sport,lane:'fixture',p,side,selected:side==='Higher'?.75:.25,first:iso(forecast),finalAt:iso(forecast+5*3600000),
   actual,start:iso(forecast+2*3600000),source:iso(forecast-60000),revision:'a'.repeat(40),tier},()=>model);
}
test('splits exact sport/book/tier cohorts and quarantines conflicts',()=>{
 const a=row(1),b=row(2,{sport:'NFL'}),c=row(3,{sport:'NBA'}),d=row(4,{tier:'demon'}),e=row(5,{book:'underdog'});
 assert.equal(organize([a,b,c,d,e],fitAt).size,5);
 assert.equal(organize([a,{...a,higherOutcome:1-a.higherOutcome}],fitAt).get(a.cohort).length,0);
 assert.equal(row(1,{line:3,actual:3}),null);
});
test('freezes a past fit once and evaluates only truly later forecasts',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'calib-fit-'));t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 const g=(...a)=>execFileSync('git',['-C',root,...a],{stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_COMMITTER_DATE:fitAt,GIT_AUTHOR_DATE:fitAt}});
 g('init');g('config','user.name','Calibrator');g('config','user.email','calib@example.invalid');
 const past=Array.from({length:150},(_,i)=>row(i+1)),newRows=Array.from({length:100},(_,i)=>row(i+201,{forecast:Date.parse('2026-11-28T23:00:00Z')+Math.floor(i/8)*day}));
 const initial=run(root,{clock:()=>fitAt,collect:()=>past});
 assert.equal(initial.bySport.NHL.newFitsStaged,1);
 assert.equal(initial.bySport.NHL.fitted,0);
 g('add','.');g('commit','-m','Commit past-only fit');
 const data=history(root,'prop-calibration-fits');assert.equal(data.length,1);
 assert.equal(freezeValid(data[0],past.slice().sort((a,b)=>a.originalOfferKey.localeCompare(b.originalOfferKey)),futureAt),true);
 const after=run(root,{clock:()=>futureAt,collect:()=>past.concat(newRows)});
 assert.equal(after.bySport.NHL.fitted,1);assert.equal(after.bySport.NHL.prospectiveDecisions,100);
 assert.equal(after.calibratedProbabilityApproved,false);assert.equal(after.modelPromoted,false);
});
