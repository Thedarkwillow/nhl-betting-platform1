'use strict';
// Existing reviewed-identity gate, original immutable forecast archive and independent grader.
// Alternate source rows stay in memory; no wagers or model promotion.
const fs=require('node:fs'),path=require('node:path'),{load,analyze,git,read,list,scope}=require('./pickfinder-public-evidence-audit.cjs');
const {ROOT}=require('./pickfinder-public-archive.cjs'),{indexReviews}=require('./pickfinder-reviewed-game-context.cjs');
const {reviewed,history,save,modelRows,aliases}=require('./pickfinder-public-model-validation.cjs'),nba=require('../src/nba-research-pipeline-v1.cjs');
const dt=Date.parse,now=()=>new Date().toISOString();
const isHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const key=x=>JSON.stringify([x.book,x.gameId,x.playerId,x.market,x.line,x.offeredSide,x.tier??null]);

// Read immutable reviewed game receipts, not mutable summaries. No receipt creates a
// new quote, overrides a missing board clock, or grants original-platform status.
function gameReviewReceipts(root,clock){
 const receipts=[];
 for(const digest of list(root,'directory')){
  const doc=read(root,'directory',digest);
  if(doc.schema!=='pickfinder-independent-nba-matchup-review-v1')continue;
  const rel=ROOT+'/directory/'+digest+'.json',commits=git(root,['log','--format=%H','--',rel]).split('\n');
  if(commits.length!==1||!/^[a-f0-9]{40}$/.test(commits[0]))continue;
  const first=git(root,['show','-s','--format=%cI',commits[0]]);
  if(!Number.isFinite(dt(first))||dt(first)>dt(clock))continue;
  const observed=[...(doc.games||[]),...(doc.records||[])];
  if(!observed.length||!observed.every(x=>Number.isFinite(dt(x.observedAt))&&dt(x.observedAt)<=dt(first)+999))continue;
  receipts.push({doc,digest,commit:commits[0],first});
 }
 return receipts;
}
function reviewedScopes({archive,schedule,clock,receipts,explicit=[]}){
 if(!schedule||schedule.kind!=='nba_official_schedule_v1'||!Array.isArray(schedule.games))return [];
 const index=indexReviews(receipts.map(x=>x.doc),clock),sources=new Map(),blocked=new Set(),result=new Map(),explicitKeys=new Set(explicit.map(scope));
 for(const f of receipts){
  for(const [k,v] of indexReviews([f.doc],clock)){
   if(!v||index.get(k)?.signature!==v.signature||!isHash(f.digest)||!Number.isFinite(dt(f.first))||dt(f.first)>dt(clock)||dt(f.first)+900000>=dt(v.g.scheduleStartAt))continue;
   if(!sources.has(k))sources.set(k,f);
  }
 }
 for(const b of archive.latest)for(const o of b.offers||[]){
  if(o.sport!=='nba'||!aliases[o.market]||o.period||o.mapRange||o.gameMode||!o.eventId||!o.player)continue;
  let u;try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{continue;}
  const prop=u.searchParams.get('prop')?.split(':')||[];
  if(u.origin!=='https://www.pickfinder.app'||!/^\/players\/nba\/[\w-]+$/.test(u.pathname)||u.searchParams.getAll('prop').length!==1||prop.length!==4||!prop[0]||prop[1]!==o.market||prop[2]!==o.eventId||!Number.isFinite(Number(prop[3])))continue;
  const k=JSON.stringify([o.eventId,u.pathname]),review=index.get(k),source=sources.get(k);
  if(!review||!source||review.r.player!==o.player||!Number.isFinite(dt(o.observedAt))||dt(o.observedAt)>dt(clock)||dt(o.observedAt)>=dt(review.g.scheduleStartAt))continue;
  const {r,g}=review,playerId=Number(r.nbaPlayerId),gameId=Number(g.nbaGameId);
  if(!Number.isSafeInteger(playerId)||playerId<=0||!Number.isSafeInteger(gameId)||gameId<=0)continue;
  const games=schedule.games.filter(x=>x.gameId===gameId&&x.status===1&&dt(x.startAt)===dt(g.scheduleStartAt)&&dt(x.startAt)>dt(clock)+900000&&x.home===g.home&&x.away===g.away);
  if(games.length!==1)continue;
  const row={sport:'nba',detailId:o.detailId,eventId:o.eventId,market:o.market,period:o.period??null,mapRange:o.mapRange??null,gameMode:o.gameMode??null,nativePlayerId:playerId,nativeEventId:gameId,nativeMarket:aliases[o.market],sourcePlayer:r.player,team:r.team,verifiedStartAt:games[0].startAt,verifiedAt:source.first,identityEvidenceSha256:source.digest,reviewCommit:source.commit,independentReviewVerified:true};
  const sk=scope(row);if(explicitKeys.has(sk)||blocked.has(sk))continue;
  const old=result.get(sk);
  if(old&&(old.nativePlayerId!==row.nativePlayerId||old.nativeEventId!==row.nativeEventId||old.team!==row.team)){result.delete(sk);blocked.add(sk);continue;}
  if(!old)result.set(sk,row);
 }
 return [...result.values()];
}

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
 const revision=git(root,['rev-parse','HEAD']),explicit=reviewed(root,clock),archive=load(root);
 const schedules=history(root,'nba-schedule').filter(x=>dt(x.first)<=dt(clock)&&dt(x.doc.capturedAt)<=dt(x.first)+999).sort((a,b)=>dt(b.doc.capturedAt)-dt(a.doc.capturedAt));
 const latest=schedules[0],prior=history(root,'nba-forecasts').flatMap(x=>x.doc.rows||[]);
 const receipts=gameReviewReceipts(root,clock),derived=reviewedScopes({archive,schedule:latest?.doc,clock,receipts,explicit}),reviews=[...explicit,...derived];
 const selected=choose({archive,historyRows:payload.rows,reviewRows:reviews,schedule:latest?.doc,clock,revision,prior,digests:payload.digests});
 let receipt=null;
 if(selected.rows.length)receipt=save(root,'nba-forecasts',{kind:'pickfinder_public_nba_shadow_forecasts_v1',generatedAt:clock,rows:selected.rows,modelRevision:revision,historySourceDigests:payload.digests,scheduleDigest:latest.digest,researchOnly:true,originalPlatformVerified:false});
 return {kind:'nba_mirror_prospective_bridge_v1',generatedAt:clock,reviewedCrosswalkRows:reviews.length,explicitCrosswalkRows:explicit.length,reviewedReceiptScopes:derived.length,immutableGameReviewReceipts:receipts.length,newForecastRows:selected.rows.length,reason:selected.reason,forecastDigest:receipt?.digest??null,earliestGameStartAt:selected.rows.map(x=>x.gameStartAt).sort()[0]??null,rawHistoryRowsPublished:0,modelApproved:false,originalPlatformVerified:false};
}
if(require.main===module)try{console.log(JSON.stringify(run(process.argv[2],JSON.parse(fs.readFileSync(0,'utf8')))));}catch{console.error('NBA prospective bridge failed closed');process.exitCode=1;}
module.exports={choose,run,gameReviewReceipts,reviewedScopes};
