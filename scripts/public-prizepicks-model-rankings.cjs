'use strict';
// Public, already-authorized PickFinder sporting observations only. Read existing frozen
// model outputs; no new model fitting, paid requests, private archive or wager actions.
const fs=require('node:fs'),path=require('node:path');
const {load,quotes,scope}=require('./pickfinder-public-evidence-audit.cjs');
const {history,aliases}=require('./pickfinder-public-model-validation.cjs');
const dt=Date.parse,hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const rev=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fresh=(t,at,ms)=>Number.isFinite(dt(t))&&dt(t)<=at&&at-dt(t)<=ms;
const tiers=['standard','goblin','demon'];
function build({archive,forecasts,grades=[],clock}){
 const at=dt(clock);if(!Number.isFinite(at))throw Error('clock');
 const sports=['nba','nhl','nfl','cs2','valorant','dota2','lol','cod'];
 const bySport=Object.fromEntries(sports.map(s=>[s,{freshOffers:0,archivedModelRows:0,rankedRows:0,reason:'no_public_model_adapter_output'}]));
 const offers=new Map(),excluded={},rows=[],seen=new Set();
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 const key=(event,detail,market,line,side,tier)=>JSON.stringify([event,detail,market,line,side,tier]);
 const books=archive.latest.filter(b=>b.m.book==='prizepicks');
 if(archive.invalid.length===0)for(const b of books){
  if(!bySport[b.m.sport]||!hash(b.digest)||!Number.isFinite(dt(b.first))||dt(b.first)>at)continue;
  for(const o of b.offers||[]){
   if(o.book!=='prizepicks'||o.sport!==b.m.sport||!fresh(o.observedAt,at,30*60000)||dt(o.observedAt)>dt(b.first)+999||!Number.isFinite(dt(o.startAt))||dt(o.startAt)<=at+900000||!Number.isFinite(o.line)||!['Higher','Lower'].includes(o.side)||!tiers.includes(o.tier)||!o.eventId||!o.detailId||!o.player)continue;
   bySport[o.sport].freshOffers++;
   const k=key(o.eventId,o.detailId,o.market,o.line,o.side,o.tier),a=offers.get(k)||[];
   a.push({o,b});offers.set(k,a);
  }
 }
 for(const f of forecasts){
  if(f.doc?.kind!=='pickfinder_public_nba_shadow_forecasts_v1'||!hash(f.digest)||!rev(f.commit)||!Number.isFinite(dt(f.first))||dt(f.first)>at||!Number.isFinite(dt(f.doc.generatedAt))||dt(f.doc.generatedAt)>dt(f.first)+999)continue;
  for(const p of f.doc.rows||[]){
   if(p.book!=='prizepicks')continue;
   bySport.nba.archivedModelRows++;
   if(archive.invalid.length){reject('invalid_archive');continue;}
   if(p.researchOnly!==true||p.originalPlatformVerified!==false||p.modelApproved!==false||p.probabilityConditionalOnDecided!==true||!rev(p.modelRevision||f.doc.modelRevision)||!rev(p.reviewCommit)||!hash(p.identityEvidenceSha256)||!hash(p.sourceManifestDigest)||!fresh(p.sourceObservedAt,at,30*60000)||dt(p.sourceObservedAt)>dt(f.doc.generatedAt)||!fresh(f.doc.generatedAt,at,30*60000)||!Number.isFinite(dt(p.gameStartAt))||dt(f.first)+900000>=dt(p.gameStartAt)||dt(p.gameStartAt)<=at+900000||!Number.isFinite(p.rawSelectedEstimate)||p.rawSelectedEstimate<0||p.rawSelectedEstimate>1||!Number.isFinite(p.projection)||!Number.isFinite(p.line)||!tiers.includes(p.tier)){reject('forecast_provenance_or_freshness');continue;}
   const market=Object.keys(aliases).find(k=>aliases[k]===p.market);
   const matches=offers.get(key(p.sourceEventId,p.sourceDetailId,market,p.line,p.offeredSide,p.tier))||[];
   if(matches.length!==1){reject('no_unique_current_exact_offer');continue;}
   const {o,b}=matches[0];
   if(b.digest!==p.sourceManifestDigest||o.observedAt!==p.sourceObservedAt||dt(b.first)>dt(f.first)||dt(o.startAt)!==dt(p.gameStartAt)||o.period||o.mapRange||o.gameMode){reject('source_scope_mismatch');continue;}
   const id=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.offeredSide,p.tier]);
   if(seen.has(id)){reject('duplicate_forecast');continue;}seen.add(id);
   const q=quotes(o,b.sportsbookQuotes||[],f.doc.generatedAt).filter(x=>fresh(x.observedAt,at,300000));
   const marketEstimate=q.length?q.reduce((s,x)=>s+(p.offeredSide==='Higher'?x.higher:1-x.higher),0)/q.length:null;
   const opposite=archive.latest.filter(x=>x.m.sport==='nba'&&x.m.book==='underdog').flatMap(x=>x.offers||[]).filter(x=>scope(x)===scope(o)&&x.line===o.line&&x.side===o.side&&fresh(x.observedAt,at,30*60000)&&Math.abs(dt(x.observedAt)-dt(o.observedAt))<=300000);
   rows.push({sport:'nba',book:'prizepicks',player:o.player,market:p.market,line:p.line,side:p.offeredSide,tier:p.tier,projection:p.projection,rawConditionalEstimate:p.rawSelectedEstimate,observedAt:o.observedAt,forecastAt:f.doc.generatedAt,gameStartAt:p.gameStartAt,forecastDigest:f.digest,modelRevision:p.modelRevision||f.doc.modelRevision,marketEstimate,matchedSportsbooks:q.length,exactOtherPlatformObservations:opposite.length,calibrated:false,modelApproved:false,originalPlatformVerified:false,expectedValue:null});
  }
 }
 rows.sort((a,b)=>a.tier.localeCompare(b.tier)||b.rawConditionalEstimate-a.rawConditionalEstimate||a.player.localeCompare(b.player));
 const rank={};for(const row of rows){row.rankWithinTier=rank[row.tier]=(rank[row.tier]||0)+1;bySport[row.sport].rankedRows++;}
 for(const [s,v] of Object.entries(bySport))v.reason=archive.invalid.length?'invalid_archive':v.rankedRows?'research_only':s==='nba'?v.freshOffers?'no_matching_fresh_immutable_forecast':'no_fresh_clock_verified_offers':'no_public_model_adapter_output';
 return {kind:'public_prizepicks_model_ranking_v1',generatedAt:clock,rows,bySport,excluded,archivedForecastFrames:forecasts.length,archivedGradeFrames:grades.length,modelApproved:false,calibrated:false,originalPlatformVerified:false,paidRequests:0,privateRepoUsed:false,source:'authorized PickFinder sporting evidence + existing frozen NBA model receipts',researchOnly:true};
}
function run(root,clock=new Date().toISOString()){
 const result=build({archive:load(root),forecasts:history(root,'nba-forecasts'),grades:history(root,'nba-grades'),clock});
 fs.writeFileSync(path.join(root,'data/prizepicks-model-rankings.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({kind:result.kind,rankedRows:result.rows.length,bySport:result.bySport,excluded:result.excluded,archivedForecastFrames:result.archivedForecastFrames,archivedGradeFrames:result.archivedGradeFrames,paidRequests:0,privateRepoUsed:false}));
 return result;
}
module.exports={build,run};
if(require.main===module)try{run(fs.realpathSync(process.argv[2]||'.'));}catch{console.error('Public ranking evidence failed closed');process.exitCode=1;}
