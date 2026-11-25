'use strict';
// Restricted normalized provider records are consumed in memory only.
// Only aggregate counts may leave this module's production entry point.
const nba=require('../src/nba-research-pipeline-v1.cjs');
const {evaluateOther}=require('./prizepicks-multisport-model-bridge.cjs');
const {indexReviews}=require('./pickfinder-reviewed-game-context.cjs');
const {gameReviewReceipts}=require('./public-nba-mirror-prospective-bridge.cjs');
const {history,aliases}=require('./pickfinder-public-model-validation.cjs');
const {load,quotes,scope}=require('./pickfinder-public-evidence-audit.cjs');
const dt=Date.parse,hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const rev=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fresh=(x,at,ms)=>Number.isFinite(dt(x))&&dt(x)<=at&&at-dt(x)<=ms;
const full=x=>['full game','full_game','full','game'].includes(String(x||'').toLowerCase());
const eastern=x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
const allowed=new Set(['points','rebounds','assists','threePointersMade','steals','blocks','turnovers','pointsReboundsAssists','pointsRebounds','pointsAssists','reboundsAssists']);
function prepare({historyRows,historyDigests,schedule,receipts,archive,clock,revision}){
 const at=dt(clock);
 if(!Number.isFinite(at)||!rev(revision)||!Array.isArray(historyRows)||!historyRows.length||!Array.isArray(historyDigests)||historyDigests.length!==4||!historyDigests.every(hash))throw Error('model_context');
 if(schedule?.kind!=='nba_official_schedule_v1'||!fresh(schedule.capturedAt,at,3600000)||!Array.isArray(schedule.games))throw Error('schedule_context');
 if(archive.invalid.length)throw Error('invalid_public_archive');
 const sources=new Map(),valid=receipts.filter(f=>hash(f.digest)&&rev(f.commit)&&Number.isFinite(dt(f.first))&&dt(f.first)<=at);
 const reviewIndex=indexReviews(valid.map(f=>f.doc),clock);
 for(const f of valid)for(const [k,v] of indexReviews([f.doc],clock)){
  if(!v||reviewIndex.get(k)?.signature!==v.signature||dt(f.first)+900000>=dt(v.g.scheduleStartAt)||dt(v.r.observedAt)>dt(f.first)+999||dt(v.g.observedAt)>dt(f.first)+999)continue;
  if(!sources.has(k))sources.set(k,f);
 }
 const players=new Map();
 for(const [k,v] of reviewIndex){
  if(!v||!sources.has(k))continue;
  const {r,g}=v,id=Number(r.nbaPlayerId),gid=Number(g.nbaGameId),team=nba.teams(r.team),opp=nba.teams(r.opponent);
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(gid)||gid<1||team===opp)continue;
  const matches=schedule.games.filter(x=>x.gameId===gid&&x.status===1&&dt(x.startAt)===dt(g.scheduleStartAt)&&dt(x.startAt)>at+900000&&x.home===g.home&&x.away===g.away);
  if(matches.length!==1)continue;
  const key=JSON.stringify([nba.norm(r.player),team,opp]),a=players.get(key)||[];
  a.push({id,gid,start:matches[0].startAt,receipt:sources.get(k),name:r.player,eventId:g.eventId,playerPath:r.playerPath});players.set(key,a);
 }
 return {h:nba.indexHistory([{rows:historyRows}]),historyDigests:[...historyDigests],players,schedule,archive,revision,preparedAt:clock};
}
function evaluate(rows,context,clock){
 const at=dt(clock),excluded={},predictions=[],seen=new Set();
 if(!Number.isFinite(at)||!Array.isArray(rows))throw Error('input');
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const row of rows){
  if(row?.provider!=='PrizePicksAPI'||row.productionEligible!==false||row.originalAppAvailabilityVerified!==false){reject('invalid_provider_provenance');continue;}
  if(row.sport!=='NBA'){
   // A separate independently reviewed sport context is mandatory; never use NBA history.
   if(!context?.other){reject('sport_adapter_not_connected');continue;}
   const other=evaluateOther([row],context.other,clock);
   for(const [k,n] of Object.entries(other.excluded))excluded[k]=(excluded[k]||0)+n;
   for(const p of other.predictions){const k=JSON.stringify([p.sport,p.nativePlayerId,p.nativeGameId,p.market,p.period,p.line,p.side,p.tier]);if(seen.has(k)){reject('duplicate_direction');continue;}seen.add(k);predictions.push(p);}
   continue;
  }
  if(!context||!fresh(context.preparedAt,at,3600000)||!fresh(context.schedule.capturedAt,at,3600000)){reject('missing_or_stale_model_context');continue;}
  if(!fresh(row.receivedAt,at,900000)||!fresh(row.observedAt,at,900000)||dt(row.observedAt)>dt(row.receivedAt)||dt(row.startsAt)<=at+900000||!Number.isFinite(dt(row.startsAt))||!full(row.period)||!Number.isFinite(row.line)||row.line<0||!row.providerOfferId||!row.player||!row.team||!row.opponent){reject('freshness_or_scope');continue;}
  const metric=nba.market(row.stat),team=nba.teams(row.team),opponent=nba.teams(row.opponent);
  if(!allowed.has(metric)||team===opponent){reject('unsupported_market');continue;}
  const matches=(context.players.get(JSON.stringify([nba.norm(row.player),team,opponent]))||[]).filter(x=>dt(x.start)===dt(row.startsAt));
  const unique=new Map(matches.map(x=>[JSON.stringify([x.id,x.gid,x.start]),x]));
  if(unique.size!==1){reject('unverified_player_or_event');continue;}
  const p=[...unique.values()][0],cut=eastern(clock),logs=context.h.players.get(p.id)||[],latest=logs.filter(x=>x.gameDate<cut).at(-1);
  if(!latest||latest.team!==team||nba.norm(latest.player)!==nba.norm(row.player)||dt(cut)-dt(latest.gameDate)>45*86400000){reject('history_identity_or_team');continue;}
  const projection=nba.project(context.h,{playerId:p.id,gameId:p.gid,team,opponent,market:metric,line:row.line},cut);
  if(!projection||!Number.isFinite(projection.higher)||projection.higher<0||projection.higher>1||!Number.isFinite(projection.projection)){reject('insufficient_model_history');continue;}
  for(const [side,s] of Object.entries(row.selections||{})){
   if(!['Higher','Lower'].includes(side)||s?.available!==true||!['standard','goblin','demon'].includes(s.tier)||side==='Lower'&&s.tier!=='standard')continue;
   const k=JSON.stringify([p.id,p.gid,metric,row.line,side,s.tier]);
   if(seen.has(k)){reject('duplicate_direction');continue;}seen.add(k);
   const corroboration=context.archive.latest.filter(b=>b.m.sport==='nba'&&b.m.book==='prizepicks'&&dt(b.first)<=at).flatMap(b=>(b.offers||[]).filter(o=>{let u;try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{return false;}return u.origin==='https://www.pickfinder.app'&&u.pathname===p.playerPath&&o.eventId===p.eventId&&o.player===p.name&&aliases[o.market]===metric&&!o.period&&!o.mapRange&&!o.gameMode&&o.book==='prizepicks'&&o.line===row.line&&o.side===side&&o.tier===s.tier&&dt(o.startAt)===dt(p.start)&&fresh(o.observedAt,at,300000)&&Math.abs(dt(o.observedAt)-dt(row.observedAt))<=300000;}).map(o=>({o,b})));
   const q=corroboration.length===1?quotes(corroboration[0].o,corroboration[0].b.sportsbookQuotes||[],clock):[];
   const marketBenchmark=q.length?q.reduce((sum,x)=>sum+(side==='Higher'?x.higher:1-x.higher),0)/q.length:null;
   predictions.push({sport:'NBA',nativePlayerId:p.id,nativeGameId:p.gid,player:row.player,market:metric,line:row.line,side,tier:s.tier,projection:projection.projection,rawConditionalEstimate:side==='Higher'?projection.higher:1-projection.higher,forecastAt:clock,sourceObservedAt:row.observedAt,gameStartAt:p.start,modelRevision:context.revision,identityEvidenceSha256:p.receipt.digest,historyDigests:context.historyDigests,providerOfferId:row.providerOfferId,originalPlatformVerified:false,calibrated:false,expectedValue:null,modelApproved:false,restricted:true,pickfinderCorroborated:corroboration.length===1,matchedSportsbooks:q.length,marketBenchmark});
  }
 }
 predictions.sort((a,b)=>a.tier.localeCompare(b.tier)||(b.rawConditionalEstimate??-1)-(a.rawConditionalEstimate??-1));
 return {predictions,excluded};
}
function summarize(result){
 const byTier={};let corroborated=0,marketBenchmarked=0;for(const p of result.predictions){byTier[p.tier]=(byTier[p.tier]||0)+1;if(p.pickfinderCorroborated)corroborated++;if(p.matchedSportsbooks>0)marketBenchmarked++;}
 return {kind:'restricted_prizepicks_model_bridge_v1',predictedDirections:result.predictions.length,byTier,pickfinderCorroboratedDirections:corroborated,marketBenchmarkedDirections:marketBenchmarked,excluded:result.excluded,rawRowsPublished:0,individualForecastsPublished:0,individualForecastsPersisted:0,modelApproved:false,calibrated:false,originalPlatformVerified:false};
}
async function fromCommitted(root,payload,clock,revision,{refreshSchedule=false}={}){
 const schedules=history(root,'nba-schedule').filter(x=>dt(x.first)<=dt(clock)&&dt(x.doc.capturedAt)<=dt(x.first)+999).sort((a,b)=>dt(b.doc.capturedAt)-dt(a.doc.capturedAt));
 let schedule=schedules[0]?.doc;
 if(refreshSchedule&&!fresh(schedule?.capturedAt,dt(clock),3600000)){schedule=await require('./nba-official-preview-schedule.cjs').collect(eastern(clock),clock);clock=new Date().toISOString();}
 return prepare({historyRows:payload.rows,historyDigests:payload.digests,schedule,receipts:gameReviewReceipts(root,clock),archive:load(root),clock,revision});
}
module.exports={prepare,evaluate,summarize,fromCommitted};
if(require.main===module)(async()=>{const fs=require('node:fs'),{execFileSync}=require('node:child_process');const payload=JSON.parse(fs.readFileSync(0,'utf8'));if(payload.kind!=='nba_mirror_prospective_input_v1')throw Error('context_kind');const root=process.cwd(),clock=new Date().toISOString(),revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const context=await fromCommitted(root,payload,clock,revision,{refreshSchedule:true});console.log(JSON.stringify({kind:'direct_model_context_preflight_v1',historyRows:context.h.rows.length,reviewedPlayerScopes:context.players.size,scheduleGames:context.schedule.games.length,sourceScheduleAt:context.schedule.capturedAt,paidRequests:0,rawRowsPublished:0,modelApproved:false}));if(!context.players.size)process.exitCode=1;})().catch(()=>{console.error('Direct model context preflight failed closed');process.exitCode=1;});
