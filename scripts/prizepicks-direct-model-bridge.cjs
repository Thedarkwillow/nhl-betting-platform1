'use strict';
// Restricted normalized provider records are consumed in memory only.
// Only aggregate counts may leave this module's production entry point.
const nba=require('../src/nba-research-pipeline-v1.cjs');
const {indexReviews}=require('./pickfinder-reviewed-game-context.cjs');
const {gameReviewReceipts}=require('./public-nba-mirror-prospective-bridge.cjs');
const {history}=require('./pickfinder-public-model-validation.cjs');
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
  a.push({id,gid,start:matches[0].startAt,receipt:sources.get(k),name:r.player});players.set(key,a);
 }
 return {h:nba.indexHistory([{rows:historyRows}]),historyDigests:[...historyDigests],players,schedule,archive,revision,preparedAt:clock};
}
function evaluate(rows,context,clock){
 const at=dt(clock),excluded={},predictions=[],seen=new Set();
 if(!Number.isFinite(at)||!Array.isArray(rows))throw Error('input');
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const row of rows){
  if(row?.provider!=='PrizePicksAPI'||row.productionEligible!==false||row.originalAppAvailabilityVerified!==false){reject('invalid_provider_provenance');continue;}
  if(row.sport!=='NBA'){reject('sport_adapter_not_connected');continue;}
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
   predictions.push({sport:'NBA',nativePlayerId:p.id,nativeGameId:p.gid,player:row.player,market:metric,line:row.line,side,tier:s.tier,projection:projection.projection,rawConditionalEstimate:side==='Higher'?projection.higher:1-projection.higher,forecastAt:clock,sourceObservedAt:row.observedAt,gameStartAt:p.start,modelRevision:context.revision,identityEvidenceSha256:p.receipt.digest,historyDigests:context.historyDigests,providerOfferId:row.providerOfferId,originalPlatformVerified:false,calibrated:false,expectedValue:null,modelApproved:false,restricted:true});
  }
 }
 predictions.sort((a,b)=>a.tier.localeCompare(b.tier)||b.rawConditionalEstimate-a.rawConditionalEstimate);
 return {predictions,excluded};
}
function summarize(result){
 const byTier={};for(const p of result.predictions)byTier[p.tier]=(byTier[p.tier]||0)+1;
 return {kind:'restricted_prizepicks_model_bridge_v1',predictedDirections:result.predictions.length,byTier,excluded:result.excluded,rawRowsPublished:0,individualForecastsPublished:0,individualForecastsPersisted:0,modelApproved:false,calibrated:false,originalPlatformVerified:false};
}
function fromCommitted(root,payload,clock,revision){
 const schedules=history(root,'nba-schedule').filter(x=>dt(x.first)<=dt(clock)&&dt(x.doc.capturedAt)<=dt(x.first)+999).sort((a,b)=>dt(b.doc.capturedAt)-dt(a.doc.capturedAt));
 return prepare({historyRows:payload.rows,historyDigests:payload.digests,schedule:schedules[0]?.doc,receipts:gameReviewReceipts(root,clock),archive:load(root),clock,revision});
}
module.exports={prepare,evaluate,summarize,fromCommitted};
