'use strict';
// Existing reviewed-identity gate, original immutable forecast archive and independent grader.
// Alternate source rows stay in memory; no wagers or model promotion.
const fs=require('node:fs'),path=require('node:path'),{load,analyze,git}=require('./pickfinder-public-evidence-audit.cjs');
const {reviewed,history,save,modelRows}=require('./pickfinder-public-model-validation.cjs'),nba=require('../src/nba-research-pipeline-v1.cjs');
const dt=Date.parse,now=()=>new Date().toISOString();
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const key=x=>JSON.stringify([x.book,x.gameId,x.playerId,x.market,x.line,x.offeredSide,x.tier??null]);
function choose({archive,historyRows,reviewRows,schedule,clock,revision,prior=[],digests}){
 if(!Array.isArray(historyRows)||!historyRows.length||!Array.isArray(digests)||digests.length!==4||!digests.every(isHash))throw Error('four-season input provenance');
 if(archive.invalid.length)throw Error('invalid source manifests');
 if(!schedule||schedule.kind!=='nba_official_schedule_v1'||!Number.isFinite(dt(schedule.capturedAt))||dt(schedule.capturedAt)>dt(clock)||dt(clock)-dt(schedule.capturedAt)>3600000)return {rows:[],reason:'no_fresh_committed_official_schedule'};
 if(!reviewRows.length)return {rows:[],reason:'no_independently_reviewed_crosswalk'};
 const h=nba.indexHistory([{rows:historyRows}]),features=analyze(archive,clock).featureRows.filter(x=>Number.isFinite(dt(x.offer.startAt))&&dt(x.offer.startAt)>dt(clock)+900000&&dt(x.offer.observedAt)<dt(x.offer.startAt));
 const seen=new Set(prior.map(key));
 const rows=modelRows({features,h,schedule,reviewed:reviewRows,clock,revision}).filter(r=>{
  const source=features.find(x=>x.manifestDigest===r.sourceManifestDigest&&x.offer.detailId===r.sourceDetailId&&x.offer.book===r.book&&x.offer.side===r.offeredSide&&x.offer.line===r.line);
  if(!source||Math.abs(dt(source.offer.startAt)-dt(r.gameStartAt))>300000||seen.has(key(r)))return false;
  seen.add(key(r));return true;
 }).map(r=>({...r,historySource:'SportsDataverse NBA Stats-derived mirror',historySourceDigests:digests,originalPlatformVerified:false,researchOnly:true,modelApproved:false}));
 return {rows,reason:rows.length?'eligible_research_only':'no_fresh_eligible_offers'};
}
function run(root,payload,clock=now()){
 if(payload?.kind!=='nba_mirror_prospective_input_v1')throw Error('input');
 const revision=git(root,['rev-parse','HEAD']),reviews=reviewed(root,clock);
 const schedules=history(root,'nba-schedule').filter(x=>dt(x.first)<=dt(clock)&&dt(x.doc.capturedAt)<=dt(x.first)+999).sort((a,b)=>dt(b.doc.capturedAt)-dt(a.doc.capturedAt));
 const latest=schedules[0],prior=history(root,'nba-forecasts').flatMap(x=>x.doc.rows||[]);
 const selected=choose({archive:load(root),historyRows:payload.rows,reviewRows:reviews,schedule:latest?.doc,clock,revision,prior,digests:payload.digests});
 let receipt=null;
 if(selected.rows.length)receipt=save(root,'nba-forecasts',{kind:'pickfinder_public_nba_shadow_forecasts_v1',generatedAt:clock,rows:selected.rows,modelRevision:revision,historySourceDigests:payload.digests,scheduleDigest:latest.digest,researchOnly:true,originalPlatformVerified:false});
 return {kind:'nba_mirror_prospective_bridge_v1',generatedAt:clock,reviewedCrosswalkRows:reviews.length,newForecastRows:selected.rows.length,reason:selected.reason,forecastDigest:receipt?.digest??null,earliestGameStartAt:selected.rows.map(x=>x.gameStartAt).sort()[0]??null,rawHistoryRowsPublished:0,modelApproved:false,originalPlatformVerified:false};
}
if(require.main===module)try{console.log(JSON.stringify(run(process.argv[2],JSON.parse(fs.readFileSync(0,'utf8')))));}catch{console.error('NBA prospective bridge failed closed');process.exitCode=1;}
module.exports={choose,run};
