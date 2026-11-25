'use strict';
// Native individual projections and archived offer research. No network, no paid requests.
// An old offer is a historical reference, never a current executable offer.
const {fromArchive}=require('./prizepicks-native-context-readiness.cjs');
const {git}=require('./pickfinder-public-evidence-audit.cjs');
const {project}=require('./prizepicks-multisport-model-bridge.cjs');
const nhl=require('../src/projections.cjs');
const fs=require('node:fs');
const norm=x=>typeof x==='string'?x.trim().toLowerCase():'';
// Legacy browser collector emits null for an isolated ordinary book badge.
// This is a research classification, not independently verified platform tier.
function researchTier(o){
 const tier=norm(o.tier);
 if(['standard','goblin','demon'].includes(tier))return tier;
 if(o.tier===null&&o.source==='pickfinder_premium'&&['prizepicks','underdog'].includes(o.book)&&typeof o.displayedPrice==='string'&&/^[+-]\d{2,4}$/.test(o.displayedPrice)&&Math.abs(Number(o.displayedPrice))>=100)return 'standard';
 return null;
}
function generate(ctx){
 const clock=ctx.preparedAt,at=Date.parse(clock),native=[],rows=[],excluded={};
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const s of ctx.scopes.filter(s=>s.sport==='NHL')){
  const p=nhl.projectPlayer(s.history);
  for(const [market,v] of Object.entries(p.projections))if(v.ready&&Number.isFinite(v.estimate))native.push({sport:s.sport,player:s.name,playerId:s.playerId,gameId:s.gameId,team:s.team,opponent:s.opponent,startAt:s.startAt,market,projection:v.estimate,priorObservations:v.observations,model:p.model,historyDigests:s.historyDigests,forecastAt:clock,modelRevision:ctx.revision,modelApproved:false});
 }
 const seen=new Set();
 for(const b of ctx.archive.latest.filter(b=>['nhl','nfl'].includes(b.m.sport)&&['prizepicks','underdog'].includes(b.m.book))){
  if(Date.parse(b.first)>at)continue;
  for(const o of b.offers){
   const side=({higher:'Higher',lower:'Lower'})[norm(o.side)],tier=researchTier(o);
   if(!o.detailId||!o.eventId){reject('missing_source_ids');continue;}
   if(!Number.isFinite(o.line)){reject('invalid_threshold');continue;}
   if(!side){reject('invalid_direction');continue;}
   if(!['standard','goblin','demon'].includes(tier)){reject('invalid_tier');continue;}
   if(!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)>at){reject('invalid_observation_clock');continue;}
   if(!Number.isFinite(Date.parse(o.startAt))){reject('missing_event_timestamp');continue;}
   if(Date.parse(o.startAt)<=at+900000){reject('event_started_or_too_close');continue;}
   const meta=b.researchObservations.filter(x=>x.detailId===o.detailId&&x.observedAt===o.observedAt&&x.origin==='board');
   const values=k=>[...new Set(meta.filter(x=>x.metric===k).map(x=>norm(x.value)).filter(Boolean))];
   const teams=values('Team'),opponents=values('Opponent');
   if(teams.length!==1||opponents.length!==1){reject('missing_exact_team_context');continue;}
   const a=ctx.scopes.filter(s=>s.sport===b.m.sport.toUpperCase()&&norm(s.name)===norm(o.player)&&norm(s.team)===teams[0]&&norm(s.opponent)===opponents[0]&&Date.parse(s.startAt)===Date.parse(o.startAt));
   if(a.length!==1){reject('native_match');continue;}
   const s=a[0],p=project({sport:s.sport,stat:o.market,period:o.period,line:o.line,observedAt:clock},s,clock,{researchProbabilities:true});
   if(!p){reject('model_scope');continue;}
   const key=JSON.stringify([b.digest,o.detailId,o.eventId,o.market,o.period,o.line,side,tier]);if(seen.has(key))continue;seen.add(key);
   const q=p.probabilities;
   rows.push({sport:s.sport,book:b.m.book,player:s.name,playerId:s.playerId,gameId:s.gameId,team:s.team,opponent:s.opponent,startAt:s.startAt,market:p.metric,line:o.line,side,tier,sourceTier:o.tier,platformTierVerified:false,projection:p.projection,probability:q?q[side.toLowerCase()]:null,pushProbability:q?.push??null,priorObservations:p.prior,method:p.method,sourceObservedAt:o.observedAt,forecastAt:clock,manifestDigest:b.digest,sourceEventId:o.eventId,sourceDetailId:o.detailId,historyDigests:s.historyDigests,modelRevision:ctx.revision,offerFresh:at-Date.parse(o.observedAt)<=300000,originalPlatformVerified:false,calibrated:false,modelApproved:false,expectedValue:null});
  }
 }
 return {kind:'native_individual_research_v1',generatedAt:clock,modelRevision:ctx.revision,native,rows,excluded,paidRequests:0,modelApproved:false};
}
module.exports={generate,researchTier};
if(require.main===module){const root=process.cwd(),clock=new Date().toISOString(),out=generate(fromArchive(root,clock,git(root,['rev-parse','HEAD'])));fs.mkdirSync('individual-research',{recursive:true});fs.writeFileSync('individual-research/forecasts.json',JSON.stringify(out,null,2));console.log(JSON.stringify({native:out.native.length,offers:out.rows.length,excluded:out.excluded}));}
