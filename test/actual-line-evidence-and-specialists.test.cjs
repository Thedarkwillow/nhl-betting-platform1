"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {specs,derive}=require("../src/nfl-ordered-event-lab.cjs");
const {estimate,study}=require("../src/nhl-original-line-calibration-lab.cjs");
const {audit:lineup}=require("../src/lineup-evidence-slate-audit.cjs");
const {audit:archive}=require("../src/archived-sportsbook-coverage.cjs");
test("ordered NFL event targets distinguish insufficient events from zero and preserve signed yards",()=>{
 assert.equal(Object.keys(specs).length,19);
 const a=[{rushing_yards:-2,yardline_100:15},{rushing_yards:8,yardline_100:35}];
 assert.equal(specs.first_rush_attempt_yards[2](a),-2);
 assert.equal(specs.rushing_yards_first_5_attempts[2](a),null);
 assert.equal(specs.red_zone_rush_attempts[2](a),1);
 assert.equal(specs.red_zone_rush_attempts[2]([{yardline_100:null}]),null);
 const p=[{complete_pass:0},{complete_pass:1,passing_yards:10}];
 assert.equal(specs.first_attempt_completion[2](p),0);
 assert.equal(specs.first_completion_yards[2](p),10);
 assert.equal(specs.longest_completion[2]([{complete_pass:null}]),null);
 assert.equal(derive({events:[],weekly:[],schedule:[]}).rows.length,0);
});
test("calibration only uses earlier first-observed finals or abstains",()=>{
 const x={gameId:999,market:"points",side:"Higher",p:.7,frozenAt:"2026-11-15T18:00:00Z"};
 const a=Array.from({length:80},(_,i)=>({...x,gameId:i%20,id:String(i),y:0,observedAt:"2026-11-14T23:00:00Z"}));
 assert.ok(estimate(a,x).p<.7);assert.equal(estimate(a.map(r=>({...r,observedAt:x.frozenAt})),x),null);
 assert.equal(estimate(a.map(r=>({...r,gameId:x.gameId})),x),null);
 assert.equal(study({records:[]},{firstObserved:[]}).validatedOriginalRows,0);
});
test("lineup report counts shared slates separately and refuses duplicate identities",()=>{
 const a={id:"a",formatSize:"power_2",slate:"2026-11-14",hits:2,mass:[.25,.5,.25],frozenAt:"2026-11-14T17:00:00Z",resolvedAt:"2026-11-15T08:00:00Z"};
 const b={...a,id:"b",formatSize:"flex_3",hits:2,mass:[.125,.375,.375,.125]},c={...a,id:"c",hits:0,frozenAt:"2026-11-14T18:00:00Z"};
 const v=lineup({firstObservationLedger:[a,b,c]});
 assert.equal(v.distinctSlatesAcrossFormats,1);
 assert.equal(v.byFormat.power_2.distinctResolvedSlates,1);assert.equal(v.byFormat.power_2.allHit,1);
 assert.equal(v.pooledSampleSize,null);assert.equal(v.verifiedROI,null);
 assert.equal(lineup({firstObservationLedger:[a,a]}).distinctSlatesAcrossFormats,0);
});
test("odds historical archives require original commit clock and are deduplicated",()=>{
 const a={archive:{kind:"bounded_sportsbook_capture_v1",status:"fresh_bounded_archive",generatedAt:"2026-11-14T18:00:00Z",rows:[]},firstCommittedAt:"2026-11-14T18:01:00Z",gitHistoryCount:1};
 const v=archive([a,a,{...a,firstCommittedAt:"2026-11-14T17:59:00Z"}],{NHL:[],NFL:[]});
 assert.equal(v.acceptedArchives,1);assert.equal(v.rejectedArchives,2);assert.equal(v.sharedProviderIdentityVerified,false);
});
