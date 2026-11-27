"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{build,grade,collectMaps,originalOffers,identity}=require("../scripts/esports-prospective-archive.cjs");
const hash="a".repeat(64),rev="b".repeat(40);
const offer={platform:"Underdog",title:"LOL",offerId:"o",playerId:"p",teamId:"t",opponentId:"opp",seriesId:"future",market:"kills",maps:[1],line:3.5,tier:"Standard",ruleset:"r",ruleVersion:"v",sourceId:"s",sourceUrl:"https://underdogsports.com/",sides:["Higher","Lower"],identityVerified:true,scopeVerified:true,originalPlatformOfferVerified:true,authorizedExportVerified:true,capturedAt:"2026-12-01T00:00:00Z",seriesStartAt:"2026-12-01T01:00:00Z"};
function row(i){return {title:"LOL",playerId:"p",teamId:"t",opponentId:"opp",seriesId:"past"+i,mapId:"m"+i,mapIndex:1,sourceId:"s",sourceUrl:"https://example.com",ruleset:"r",startAt:"2026-11-01T00:00:00Z",endAt:"2026-11-01T01:00:00Z",observedAt:"2026-11-01T02:00:00Z",exposure:30,exposureUnit:"minutes",stats:{kills:4},final:true,participationVerified:true,professional:true,identityVerified:true,sourceAuthorized:true,officialFinalVerified:true,scoringContractVerified:true,sourceDocumentSha256:hash,scheduleDispositionVerified:true,chronobreakResolved:true,forfeit:false,playedFullMap:true}}
const file={doc:{kind:"authorized_esports_map_statistics_v1",sourceAuthorized:true,independentReviewVerified:true,sourceDocumentSha256:hash,rows:Array.from({length:12},(_,i)=>row(i))},first:"2026-11-02T00:00:00Z",digest:hash};
const obs={offer,offerDigest:hash,offerFirstGitAt:"2026-12-01T00:01:00Z"};
test("freeze uses earlier immutable evidence; late archives do not qualify",()=>{
 const maps=collectMaps([file]);assert.equal(maps.length,12);
 const a=build([obs],maps,[],"2026-12-01T00:05:00Z",rev);assert.equal(a.rows.length,1);
 const late=collectMaps([{...file,first:"2026-12-01T00:01:00Z"}]);assert.equal(build([obs],late,[],"2026-12-01T00:05:00Z",rev).rows.length,0);
 assert.equal(build([obs],maps,[{doc:a}],"2026-12-01T00:06:00Z",rev).rows.length,0);
 assert.equal(build([obs],maps,[],"2026-12-01T00:16:00Z",rev).rows.length,0);
 const f={doc:a,first:"2026-12-01T00:06:00Z"};assert.equal(grade([f],maps,[obs]).counts.pending,1);
 const final={...row(13),seriesId:"future",startAt:"2026-12-01T01:00:00Z",endAt:"2026-12-01T01:30:00Z",observedAt:"2026-12-01T02:00:00Z"};
 const verified=collectMaps([{...file,first:"2026-12-01T02:01:00Z",doc:{...file.doc,rows:[final]}}]);assert.equal(grade([f],[...maps,...verified],[obs]).counts.decided,1);
 assert.equal(grade([{...f,first:"2026-12-01T00:50:00Z"}],maps,[obs]).counts.lateOrInvalid,1);
});
test("unreviewed and conflicting map evidence excluded",()=>{
 assert.equal(collectMaps([{...file,doc:{...file.doc,independentReviewVerified:false}}]).length,0);
 const changed={...row(0),stats:{kills:7}};
 assert.equal(collectMaps([file,{...file,doc:{...file.doc,rows:[changed]}}]).length,11);
 assert.equal(originalOffers([{doc:{kind:"authorized_esports_original_offer_export_v1",rows:[offer]},first:obs.offerFirstGitAt,digest:hash}]).length,0);
});

test("grading requires original immutable offer proof and matching frozen forecast; no unsupported side",()=>{const maps=collectMaps([file]),a=build([obs],maps,[],"2026-12-01T00:05:00Z",rev),f={doc:a,first:"2026-12-01T00:06:00Z"};assert.equal(a.rows[0].frozenDirection,"Higher");assert.equal(grade([f],maps,[]).counts.lateOrInvalid,1);assert.equal(grade([{...f,doc:{...a,rows:[{...a.rows[0],frozenDirection:"Lower"}]}}],maps,[obs]).counts.lateOrInvalid,1);assert.equal(build([{...obs,offer:{...offer,sides:["Lower"]}}],maps,[],"2026-12-01T00:05:00Z",rev).rows.length,0);const altered={...a.rows[0],forecast:{...a.rows[0].forecast,baseline:{higher:.8,lower:.2,push:0}}};assert.equal(grade([{...f,doc:{...a,rows:[altered]}}],maps,[obs]).counts.lateOrInvalid,1);});

test("calibration includes pushes, excludes them from binary reliability, and reports no estimate on empty evidence",()=>{
 const {calibration,addCalibration,summarizeCalibration}=require("../scripts/esports-prospective-archive.cjs"),a=calibration();
 assert.equal(summarizeCalibration(a).threeOutcomeBrier,null);
 addCalibration(a,{higher:.5,lower:.25,push:.25},"Higher");
 addCalibration(a,{higher:.5,lower:.25,push:.25},"Push");
 const s=summarizeCalibration(a);assert.equal(s.resolved,2);
 assert.ok(Math.abs(s.threeOutcomeBrier-.625)<1e-10);
 assert.ok(Math.abs(s.conditionalHigherECE-1/3)<1e-10);
 assert.equal(s.reliabilityBins.reduce((n,b)=>n+b.n,0),1);assert.equal(s.calibrationApproved,false);
});
test("paper portfolios use frozen marginal ranking before outcomes and exclude related legs",()=>{
 const {paperAudit}=require("../scripts/esports-prospective-archive.cjs");
 const leg=(i,p,outcome)=>({key:"k"+i,p,side:"Higher",outcome,series:"s"+i,player:"p"+i,team:"t"+i,opponent:"o"+i});
 const a=leg(1,.9,null),b=leg(2,.8,"Higher"),c={...leg(3,.85,"Higher"),series:a.series},d=leg(4,.7,"Lower");
 const res=paperAudit({batch:[a,b,c,d]});
 assert.equal(res.bySize[2].pending,1);assert.equal(res.bySize[3].pending,1);assert.equal(res.bySize[4].insufficientCandidates,1);
 const res2=paperAudit({batch:[{...a,outcome:"Higher"},b,c,d]});
 assert.equal(res2.bySize[2].allCorrect,1);assert.equal(res2.bySize[3].notAllCorrect,1);assert.equal(res2.payoutVerified,false);
 const res3=paperAudit({batch:[{...a,outcome:"Push"},b]});assert.equal(res3.bySize[2].pushOrVoidUnresolved,1);
});
test("prospective context arms compare the exact frozen candidate and incumbent on the same final",()=>{
 const model=require("../src/esports-research-v1.cjs");
 for(const [title,def] of Object.entries(model.TITLES)){
  const receipt={independentEvidenceVerified:true,sourceDocumentSha256:"c".repeat(64),
   sourceUrl:"https://example.test/game-report",knownAt:"2026-11-30T00:00:00Z",
   mapNames:["verified-map"],role:"verified-role",patch:"verified-patch",rosterId:"verified-roster",
   lan:true,opponentTier:"verified-tier",expectedExposure:30,exposureUnit:def.unit,independentPregameForecast:true};
  const o={...offer,title,context:receipt,mode:"Hardpoint",edition:"BO7"};
  const original={...obs,offer:o};
  const armMap=r=>({...r,title,mode:o.mode,edition:o.edition,exposureUnit:def.unit,mapName:receipt.mapNames[0],
   role:receipt.role,patch:receipt.patch,rosterId:receipt.rosterId,lan:receipt.lan,opponentTier:receipt.opponentTier,
   overtimeIncluded:true,participationThresholdVerified:true});
  const maps=collectMaps([{...file,doc:{...file.doc,rows:file.doc.rows.map(armMap)}}]);
  const a=build([original],maps,[],"2026-12-01T00:05:00Z",rev),f={doc:a,first:"2026-12-01T00:06:00Z"};
  assert.equal(a.rows.length,1);
  assert.deepEqual(grade([f],maps,[original]).contextMatched,{});
  const final=armMap({...row(13),seriesId:"future",startAt:"2026-12-01T01:00:00Z",endAt:"2026-12-01T01:30:00Z",observedAt:"2026-12-01T02:00:00Z"});
  const assertResult=r=>{
   assert.equal(r.counts.decided,1);assert.equal(Object.keys(r.contextMatched).length,5);
   for(const [k,g] of Object.entries(r.contextMatched)){
    assert.ok(k.includes(title));
    if(title==="COD")assert.ok(k.includes("Hardpoint")&&k.includes("BO7"));
    assert.equal(g.n,1);assert.equal(g.distinctSeries,1);assert.equal(g.seriesEqualBrier.neutral50,.25);
    assert.equal(g.seriesEqualLogLoss.neutral50,Math.log(2));assert.equal(g.evidenceMinimumMet,false);
    assert.equal(g.approved,false);
   }
  };
  const proof=collectMaps([{...file,first:"2026-12-01T02:01:00Z",doc:{...file.doc,rows:[final]}}]);
  assertResult(grade([f],[...maps,...proof],[original]));
  const copiedSource=grade([f],[...maps,...proof],[{...original,sourceResponseSha256:receipt.sourceDocumentSha256}]);
  assert.equal(Object.keys(copiedSource.contextMatched).length,1);
  const originalNoReview={...original,offer:{...o,context:{...receipt,independentEvidenceVerified:false}}};
  const unreviewed=build([originalNoReview],maps,[],"2026-12-01T00:05:00Z",rev);
  const noReview=grade([{...f,doc:unreviewed}],[...maps,...proof],[originalNoReview]);
  assert.equal(Object.keys(noReview.contextMatched).length,1); // original reviewed offer supplies its exact opponent
  assert.ok(Object.keys(noReview.contextMatched)[0].includes("opponent"));
  a.rows[0].forecast.contextChallengers.mapPool={...a.rows[0].forecast.contextChallengers.mapPool,projection:999};
  assert.equal(Object.keys(grade([f],[...maps,...proof],[original]).contextMatched).length,4);
 }
});
test("copies that disagree on map identities or any graded context are quarantined",()=>{
 const variation=(fields)=>({...file,doc:{...file.doc,rows:[{...row(0),...fields}]}});
 for(const fields of [{mapId:"replacement"},{mapName:"alternate"},{role:"changed"},{lan:true}]){
  assert.equal(collectMaps([file,variation(fields)]).length,11);
 }
});
