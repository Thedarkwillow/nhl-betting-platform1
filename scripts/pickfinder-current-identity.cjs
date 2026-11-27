'use strict';
// Current profile reconciliation in the existing PickFinder identity pipeline. No provider requests.
const fs=require('node:fs'),path=require('node:path');
const {sha,iterate,archiveRevision}=require('./pickfinder-public-archive.cjs');
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const {indexReviews}=require('./pickfinder-reviewed-game-context.cjs');
const profiler=require('./pickfinder-public-nba-context.cjs');
const dir='research/pickfinder-public-identity-v1/';
const origin='https://www.pickfinder.app';
const routes={val:'valorant',cbb:'college-basketball',cfb:'college-football'};
const date=Date.parse,hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const isoDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&time(x+'T00:00:00Z')&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const norm=x=>String(x??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const time=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(date(x));
const key=(...x)=>JSON.stringify(x);
const flags={operatorOfferVerified:false,settlementVerified:false,statisticalModelEligible:false};
function sourceScope(o){
 let u;try{u=new URL(o.detailId,origin);}catch{return null;}
 const p=u.searchParams.get('prop')?.split(':'),route=u.pathname.split('/')[2];
 if(u.origin!==origin||!/^\/players\/[a-z0-9-]+\/[a-zA-Z0-9_-]+$/.test(u.pathname)||
    (routes[route]||route)!==o.sport||[...u.searchParams.keys()].join(',')!=='prop'||
    p?.length!==4||!p[0]||p[1]!==o.market||p[2]!==o.eventId||!norm(o.player))return null;
 return {...o,playerPath:u.pathname};
}
function captureProfileContext(row,s,at){
 const t=sourceScope(row);
 if(!t||!time(at)||!s?.routeVerified||!s.playerLabelVerified)return null;
 const one=label=>{const a=[...new Set((s.entries||[]).filter(x=>norm(x.label)===label).map(x=>x.value.trim()).filter(Boolean))];return a.length===1?a[0]:null;};
 const clocks=[...new Set([...(s.clocks||[]).map(x=>x.value),...(s.entries||[]).filter(x=>/^(?:game|match|event|scheduled)\s*(?:start|time)/i.test(x.label)).map(x=>x.value)].filter(time).map(x=>new Date(x).toISOString()))];
 if(clocks.length>1)return {conflictingClock:true,observedAt:at};
 const team=one('team'),opponent=one('opponent'),startAt=clocks[0]||null,rawDay=one('game date utc')||one('event date utc'),gameDateUtc=isoDay(rawDay)?rawDay:null;
 if(!team||!opponent||norm(team)===norm(opponent))return null;
  const local=profiler.localMatchup(s.entries||[]);
 const label=one('matchup');
 const display=local&&norm(local.team)===norm(team)&&norm(local.opponent)===norm(opponent)?
  {displayedMatchupLabel:label,displayedLocalMatchup:local,browserClock:profiler.browserClockEvidence(s),providerDisplayZoneVerified:false}:{};
 return {team,opponent,startAt,gameDateUtc,observedAt:at,...display};
}
function candidates(o,contexts,facts){
 const start=contexts.startAt,at=date(o.currentProfileAttemptedAt);
 const matches=[],newest=new Map();
 for(const f of facts){
  const d=f.doc,host=d.source==='nhl:official'&&d.sport==='nhl'?'https://api-web.nhle.com/v1/':
   d.source==='espn:'+o.sport?'https://site.api.espn.com/apis/site/v2/sports/':null;
  if(d.sport!==o.sport||!host||!hash(f.digest)||!Array.isArray(d.proofs)||(!time(start)&&!isoDay(contexts.gameDateUtc))||
     !Number.isFinite(date(f.first))||date(f.first)>at||at-date(d.observedAt)>36*3600000)continue;
  const proofs=d.proofs.filter(p=>hash(p.digest)&&typeof p.url==='string'&&p.url.startsWith(host)&&
   time(p.observedAt)&&date(p.observedAt)<=date(d.observedAt));
  if(!proofs.some(p=>/\/(?:scoreboard\?|schedule\/)/.test(p.url)))continue;
  for(const g of d.events||[]){
   if(g.sport!==o.sport||g.namespace!==d.source||!g.eventId||!time(g.startAt)||date(g.startAt)<=at||
      (time(start)?Math.abs(date(start)-date(g.startAt))>300000:new Date(g.startAt).toISOString().slice(0,10)!==contexts.gameDateUtc)||g.teams?.length!==2||g.teams[0].id===g.teams[1].id)continue;
   const own=g.teams.filter(t=>[t.name,t.abbr].map(norm).includes(norm(contexts.team)));
   const opp=g.teams.filter(t=>[t.name,t.abbr].map(norm).includes(norm(contexts.opponent)));
   if(own.length!==1||opp.length!==1||own[0].id===opp[0].id)continue;
   const proof=proofs.find(p=>p.teamId===own[0].id&&/\/roster(?:\/|$)/.test(p.url));
   if(!proof)continue;
   const eventKey=key(g.namespace,g.eventId,own[0].id),receiptTime=date(proof.observedAt);
   newest.set(eventKey,Math.max(newest.get(eventKey)||0,receiptTime));
   for(const p of d.roster||[])if(p.teamId===own[0].id&&p.playerId&&[p.name,...(p.aliases||[])].map(norm).includes(norm(o.player)))
    matches.push({namespace:d.source,playerId:p.playerId,eventId:g.eventId,team:own[0].abbr,opponent:opp[0].abbr,startAt:g.startAt,receiptDigest:f.digest,eventKey,receiptTime});
  }
 }
 return matches.filter(x=>newest.get(x.eventKey)===x.receiptTime).map(({eventKey,receiptTime,...row})=>row);
}
// Existing immutable final-stat sources only. This is statistical source
// eligibility, not admission to a forecasting model or operator settlement.
function verifiedStats(m,finals,clock){
 if(!m||date(m.startAt)>=date(clock))return null;
 const matches=[];
 for(const f of finals){
  if(!hash(f.digest)||!time(f.first)||date(f.first)>date(clock))continue;
  const d=f.doc;
  if(m.namespace==='nba:official'&&['nba_official_web_final_history_v1','nba_official_cdn_final_history_v1'].includes(d.kind)&&
   d.officialFinalClockVerified===true&&String(d.gameId)===String(m.eventId)&&date(d.startAt)===date(m.startAt)&&
   time(d.capturedAt)&&date(d.capturedAt)>date(m.startAt)&&date(d.capturedAt)<=date(f.first)+999){
   for(const p of d.rows||[])if(String(p.playerId)===String(m.playerId)&&p.team===m.team&&p.opponent===m.opponent&&p.appeared===true&&p.identityVerified===true&&p.officialGameFinalVerified===true)
    matches.push({digest:f.digest,values:Object.fromEntries(['points','rebounds','assists','blocks','steals','turnovers','threePointersMade'].filter(k=>Number.isSafeInteger(p[k])&&p[k]>=0).map(k=>[k,p[k]]))});
  }
  if(m.namespace==='nhl:official'&&d.kind==='nhl_official_recent_final_stats_v1')for(const g of d.games||[]){
   if(String(g.event?.eventId)!==String(m.eventId)||g.event?.completed!==true||g.event.status!=='post'||
      date(g.event.startAt)!==date(m.startAt)||!hash(g.sourceDigest)||!time(g.observedAt)||date(g.observedAt)<=date(m.startAt)||date(g.observedAt)>date(f.first)+999||
      g.event.teams?.length!==2||![m.team,m.opponent].every(t=>g.event.teams.some(x=>x.abbr===t)))continue;
   for(const p of g.rows||[])if(String(p.playerId)===String(m.playerId)&&p.team===m.team&&p.appeared===true)
    matches.push({digest:f.digest,values:Object.fromEntries(['goals','assists','points','sog','hits','blockedShots','saves','goalsAgainst'].filter(k=>Number.isSafeInteger(p.stats?.[k])&&p.stats[k]>=0).map(k=>[k,p.stats[k]]))});
  }
 }
 if(!matches.length||!Object.keys(matches[0].values).length||new Set(matches.map(x=>JSON.stringify(x.values))).size!==1)return null;
 return {stats:matches[0].values,finalReceiptDigests:[...new Set(matches.map(x=>x.digest))].sort(),
  officialStatEvidenceVerified:true,prospectiveUseApproved:false};
}
function knownIdentityIndex(receipts,clock){
 const out=new Map();
 for(const f of receipts)for(const r of f.doc.rows||[]){
  const namespace={nba:'nba:official',nhl:'nhl:official',nfl:'nfl:gsis'}[r.sport];
  if(!namespace||!hash(f.digest)||!hash(r.identityEvidenceSha256)||r.independentReviewVerified!==true||
     !time(r.verifiedAt)||date(r.verifiedAt)>date(f.first)+999||date(f.first)>date(clock)||
     !new RegExp('^/players/'+r.sport+'/[A-Za-z0-9_-]+$').test(r.profilePath)||
     !norm(r.sourcePlayer)||!(r.sport==='nfl'?/^00-\d{7}$/:/^\d+$/).test(String(r.nativePlayerId)))continue;
  const k=key(r.sport,r.profilePath),bag=out.get(k)||new Map();
  const id=String(r.nativePlayerId);
  const previous=bag.get(id);
  if(!previous)bag.set(id,{sport:r.sport,sourcePlayerPath:r.profilePath,namespace,playerId:id,
    sourceNames:[norm(r.sourcePlayer)],receiptDigest:f.digest});
  else if(!previous.sourceNames.includes(norm(r.sourcePlayer)))previous.sourceNames.push(norm(r.sourcePlayer));
  out.set(k,bag);
 }
 return out;
}
function discoveryCandidates(directory,tables,facts){
 const profiles=new Map(),add=(sport,label,id)=>{
  const n=norm(label);if(!n||!id)return;
  const k=key(sport,n),ids=profiles.get(k)||new Set();
  ids.add(id);profiles.set(k,ids);
 };
 const league=x=>({'dota-2':'dota2','league-of-legends':'lol','call-of-duty':'cod'}[x]||x);
 for(const {doc:d} of facts)for(const r of d.roster||[])
  for(const label of [r.name,...(r.aliases||[])])add(d.sport,label,d.source+':'+r.playerId);
 const listing={scanned:0,oneNameCandidate:0,ambiguousNameCandidates:0,noNameCandidate:0};
 const reference={scanned:0,playerColumnRows:0,oneNameCandidate:0,ambiguousNameCandidates:0,noNameCandidate:0};
 const discover=(o,sport,label)=>{
  const found=profiles.get(key(sport,norm(label)))?.size||0;
  o[found===1?'oneNameCandidate':found>1?'ambiguousNameCandidates':'noNameCandidate']++;
 };
 for(const d of directory.directories)for(const label of d.playerSlugs||[]){listing.scanned++;discover(listing,league(d.league),label);}
 for(const d of tables.sources)for(const t of d.tables){
  const cols=t.columns||[],c=cols.findIndex(x=>/^player(?: name)?$/i.test(String(x).replace(/[↕↑↓]$/u,'').trim()));
  for(const r of t.rows){reference.scanned++;if(c>=0&&norm(r[c])){reference.playerColumnRows++;discover(reference,league(d.league),r[c]);}}
 }
 return {directoryLinks:listing.scanned,referenceRows:reference.scanned,directory:listing,reference,
  directoryStatus:'names_and_links_only',referenceStatus:'no_event_bound_native_identity'};
}
function build(profiles,facts,reviews,directory,tables,{clock,revision,finals=[],known=[],durable={rows:[],players:[],events:[],aliases:[],conflicts:0}}){
 const durableScope=new Map(),durablePlayer=new Map();
 for(const x of durable.rows)if(x.profileDigest)durableScope.set(key(x.sport,x.profileDigest,x.detailId),x);
 for(const x of durable.players){
  const k=key(x.sport,x.sourcePlayerPath),a=durablePlayer.get(k)||[];
  a.push(x);durablePlayer.set(k,a);
 }
 const cached=knownIdentityIndex(known,clock),reviewed=indexReviews(reviews.map(x=>x.doc),clock),rows=[],players=new Map(),bySport={};
 for(const {record,digest} of profiles){
  const o=sourceScope(record),sport=record.sport;
  const s=bySport[sport]??={scopes:0,confirmed:0,needsReview:0,missingEvidence:0,fields:0};
  s.scopes++;s.fields+=(record.research||[]).length;
  let options=[];
  const ctx=o?.independentReconciliationContext;
  if(o){
   const m=sport==='nba'&&reviewed.get(key(o.eventId,o.playerPath));
   if(m&&norm(m.r.player)===norm(o.player)&&date(o.currentProfileAttemptedAt)<date(m.g.scheduleStartAt)&&
      (!ctx?.startAt||Math.abs(date(ctx.startAt)-date(m.g.scheduleStartAt))<=300000)&&
      (!ctx?.team||norm(ctx.team)===norm(m.r.team))&&(!ctx?.opponent||norm(ctx.opponent)===norm(m.r.opponent))){
    const src=reviews.find(f=>date(f.first)<date(m.g.scheduleStartAt)&&
       indexReviews([f.doc],clock).get(key(o.eventId,o.playerPath))?.signature===m.signature);
    if(src)options=[{namespace:'nba:official',playerId:m.r.nbaPlayerId,eventId:m.g.nbaGameId,
       team:m.r.team,opponent:m.r.opponent,startAt:m.g.scheduleStartAt,receiptDigest:src.digest}];
   }
   if(ctx?.team&&ctx?.opponent&&(ctx?.startAt||ctx?.gameDateUtc)&&!options.length)options=candidates(o,ctx,facts);
  }
  const prior=o&&durableScope.get(key(sport,digest,o.detailId));
  if(prior&&!ctx?.conflictingClock)options.push({
   namespace:prior.namespace,playerId:prior.playerId,eventId:prior.eventId,team:prior.team,opponent:prior.opponent,
   startAt:prior.startAt,receiptDigest:prior.nativeReceiptDigest,timezoneReceiptDigests:prior.timezoneReceiptDigests,
   proofAvailableAt:prior.proofAvailableAt,evidenceMethod:'controlled_display_and_independent_schedule_roster'});
  const picks=new Map(options.map(x=>[key(x.namespace,x.playerId,x.eventId,x.team,x.opponent,date(x.startAt)),x]));
  const match=picks.size===1?[...picks.values()][0]:null;
  const identities=o&&cached.get(key(sport,o.playerPath)),knownPlayer=identities?.size===1?[...identities.values()][0]:null;
  const nativePlayers=o?(durablePlayer.get(key(sport,o.playerPath))||[]).filter(x=>norm(x.sourcePlayer)===norm(o.player)):[];
  const cachedIdentity=knownPlayer?.sourceNames.includes(norm(o?.player))?knownPlayer:
   nativePlayers.length===1?nativePlayers[0]:null;
  const idConflict=identities?.size>1||cachedIdentity&&match?.namespace===cachedIdentity.namespace&&String(match.playerId)!==cachedIdentity.playerId;
  const status=idConflict||ctx?.conflictingClock||picks.size>1?'needs_review':match?'confirmed':ctx?.startAt||ctx?.gameDateUtc?'native_event_or_roster_missing':'source_matchup_or_clock_missing';
  const row={sport,scopeKey:record.key,sourcePlayer:record.player,sourcePlayerPath:o?.playerPath??null,
    sourceEventId:record.eventId,profileDigest:digest,status,cachedIdentity:idConflict?null:cachedIdentity,match:status==='confirmed'?match:null,...flags};
  rows.push(row);
  if(row.cachedIdentity){
   const m=row.cachedIdentity,k=key(sport,row.sourcePlayerPath,m.namespace),bag=players.get(k)||new Map();
   bag.set(m.playerId,m);players.set(k,bag);
  }
  if(row.match){
   const k=key(sport,row.sourcePlayerPath,row.match.namespace),ids=players.get(k)||new Map();
   ids.set(String(row.match.playerId),row.match);players.set(k,ids);
  }
 }
 for(const m of durable.players){
  const k=key(m.sport,m.sourcePlayerPath,m.namespace),a=players.get(k)||new Map();
  a.set(String(m.playerId),m);players.set(k,a);
 }
 const registry=[];
 for(const [k,v] of players){
  const [sport,sourcePlayerPath,namespace]=JSON.parse(k);
  if(v.size===1){const [m]=v.values();registry.push({sport,sourcePlayerPath,namespace,playerId:m.playerId,receiptDigest:m.receiptDigest});}
  else for(const r of rows)if(r.sport===sport&&r.sourcePlayerPath===sourcePlayerPath&&r.match?.namespace===namespace){r.status='needs_review';r.match=null;}
 }
 for(const r of rows){r.officialStatistics=verifiedStats(r.match,finals,clock);const s=bySport[r.sport];if(r.match)s.confirmed++;else if(r.status==='needs_review')s.needsReview++;else s.missingEvidence++;}
 return {kind:'pickfinder_current_identity_registry_v1',generatedAt:clock,archiveRevision:revision,
  profiles:rows.length,scopesWithReusedPlayerId:rows.filter(r=>r.cachedIdentity).length,players:new Set(rows.map(r=>key(r.sport,r.sourcePlayerPath||r.sourcePlayer))).size,
  fields:Object.values(bySport).reduce((n,s)=>n+s.fields,0),bySport,rows,registry,
  eventRegistry:durable.events,verifiedTeamAliases:durable.aliases,identityConflicts:durable.conflicts,
  durableEventProfileAssociations:durable.rows.filter(x=>x.profileDigest).length,
  discovery:discoveryCandidates(directory,tables,facts),
  originalPlatformVerified:false,modelApproved:false,paidRequests:0};
}
function run(root,clock=new Date().toISOString()){
 const revision=archiveRevision(root),seen=new Set(),profiles=[],profileDocuments=[],controls=[],reviews=[];
 const git=require('./pickfinder-public-evidence-audit.cjs').git;
 const firstCommit=(kind,digest)=>{
  const rel='research/pickfinder-public-v1/'+kind+'/'+digest+'.json';
  const cs=git(root,['log','--format=%H',revision,'--',rel]).split('\n');
  if(cs.length!==1||!/^[0-9a-f]{40}$/.test(cs[0]))return null;
  const first=git(root,['show','-s','--format=%cI',cs[0]]);
  return date(first)<=date(clock)?first:null;
 };
 for(const {doc,digest} of iterate(root,'profiles',revision,{includeDigest:true})){
  const records=[];
  for(const record of doc.records||[]){
   if(!time(record.currentProfileAttemptedAt)||date(record.currentProfileAttemptedAt)>date(clock))continue;
   const k=key(record.key,record.currentProfileAttemptedAt);
   if(seen.has(k))continue;seen.add(k);profiles.push({record,digest});records.push(record);
  }
  if(records.length){
   const first=firstCommit('profiles',digest);
   if(first)profileDocuments.push({doc:{...doc,records},digest,first});
  }
 }
 const facts=receipts(root,dir+'native-facts','independent_public_sport_identity_facts_v1',clock);
 for(const {doc,digest} of iterate(root,'directory',revision,{includeDigest:true})){
  if(!['pickfinder-independent-nba-matchup-review-v1','pickfinder-controlled-clock-v1'].includes(doc.schema))continue;
  const first=firstCommit('directory',digest);
  if(!first)continue;
  if(doc.schema==='pickfinder-controlled-clock-v1'){controls.push({doc,digest,first});continue;}
  if([...doc.records,...doc.games].every(x=>date(x.observedAt)<=date(first)+999))reviews.push({doc,digest,first});
 }
 const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
 const finals=[...require('./pickfinder-public-model-validation.cjs').history(root,'nba-final-history'),
  ...receipts(root,dir+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',clock)];
 const known=receipts(root,dir+'historical-reviewed-identities','pickfinder_historical_reviewed_identity_v1',clock);
 const durable=require('./pickfinder-durable-identities.cjs').replay({facts,controls,profiles:profileDocuments,clock,revision});
 durable.statisticalCrosswalks=require('./pickfinder-stat-identity-crosswalk.cjs').crosswalk(durable,reviews,
  receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock),clock);
 durable.reviewedStatIdentities=require('./pickfinder-stat-identity-crosswalk.cjs').reviewedStatIdentities(known,durable,clock);
 durable.players.push(...durable.statisticalCrosswalks.map(x=>({...x,receiptDigest:x.crosswalkReceiptDigest})));
 const result=build(profiles,facts,reviews,read('pickfinder-public-research-directory.json'),read('pickfinder-public-research-tables.json'),{clock,revision,finals,known,durable});
 const native=require('./pickfinder-native-history-reconciliation.cjs'),index=native.indexFromArchive(root,clock);
 const audit=native.fromArchive(root,profileDocuments,clock,index,{expandCurrentNhlLogs:true,expandCurrentNbaLogs:true,expandCurrentNflLogs:true});
 result.qualifiedShadowStatistics=require('./pickfinder-durable-identities.cjs').qualifyResearch(audit.cache,durable,clock);
 const goalkeeper=require('./pickfinder-goalie-overview.cjs'),goalieDocs=[];
 for(const {doc,digest} of iterate(root,'capabilities',revision,{includeDigest:true})){
  if(doc.schema!==goalkeeper.schema)continue;
  const first=firstCommit('capabilities',digest);if(first)goalieDocs.push({doc,digest,first});
 }
 const {statistics:goalieStats,...goalieAudit}=goalkeeper.reconcile(goalieDocs,index,facts,finals,durable,clock);
 const qualified=new Map(result.qualifiedShadowStatistics.map(x=>[key(x.sport,x.playerId,x.eventId,x.market),x])), conflicts=new Set();
 for(const x of goalieStats){
  const k=key(x.sport,x.playerId,x.eventId,x.market),prior=qualified.get(k);
  if(prior&&prior.value!==x.value)conflicts.add(k);
  else if(!prior||date(x.availableAt)<date(prior.availableAt))qualified.set(k,x);
 }
 for(const k of conflicts)qualified.delete(k);
 result.qualifiedShadowStatistics=[...qualified.values()];
 result.statisticalCrosswalks=durable.statisticalCrosswalks;
 result.reviewedStatIdentities=durable.reviewedStatIdentities;
 const qualifiedBySportMarket={};
 for(const row of result.qualifiedShadowStatistics){
  const sport=qualifiedBySportMarket[row.sport]??={};
  sport[row.market]=(sport[row.market]||0)+1;
 }
 result.statisticalResearchAudit={
  qualifiedBySportMarket,
  goalieOverview:{...goalieAudit,candidateFacts:goalieStats.length,conflicts:conflicts.size},
  ...audit.summary,
  currentScopesReplayed:profiles.length,archivedProfileReceipts:profileDocuments.length,
  separateEventIdentityGate:true,requiresOriginalOperatorOfferId:false,
  reviewedResearchFacts:audit.reviewedCache.size,
  newlyQualifiedShadowInputs:result.qualifiedShadowStatistics.length,
  officialFinalMetricsForMatchedEvents:result.rows.reduce((n,r)=>n+Object.keys(r.officialStatistics?.stats||{}).length,0),
  newlyQualifiedProductionInputs:0
 };
 fs.writeFileSync(path.join(root,'data/pickfinder-current-identity-registry.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({scopes:result.profiles,players:result.players,fields:result.fields,registry:result.registry.length,events:result.eventRegistry.length,teamAliases:result.verifiedTeamAliases.length,durableAssociations:result.durableEventProfileAssociations,statisticalResearchAudit:result.statisticalResearchAudit,discovery:result.discovery,bySport:result.bySport}));
 return result;
}
module.exports={build,discoveryCandidates,verifiedStats,candidates,captureProfileContext,sourceScope,readVisible:profiler.readVisible,run};
if(require.main===module)run(process.cwd());
