'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./pickfinder-public-archive.cjs'),{load,analyze,coverage,git,scope}=require('./pickfinder-public-evidence-audit.cjs');
const availability=require('./pickfinder-nba-official-availability.cjs');
const nba=require('../src/nba-research-pipeline-v1.cjs'),{official}=require('./grade-nba-frozen-research-v1.cjs'),{summarize}=require('../src/lineup-dependence-bounds-research.cjs');
const dt=Date.parse,et=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const now=()=>new Date().toISOString();
const OUT='research/pickfinder-public-validation-v1',SEASONS=['2023-24','2024-25','2025-26','2026-27'];
const aliases={player_points:'points',player_rebounds:'rebounds',player_assists:'assists',player_made_threes:'threePointersMade',player_steals:'steals',player_blocks:'blocks',player_turnovers:'turnovers','player_points_+_rebounds_+_assists':'pointsReboundsAssists','player_points_+_rebounds':'pointsRebounds','player_points_+_assists':'pointsAssists','player_rebounds_+_assists':'reboundsAssists'};
function save(root,kind,doc){const raw=JSON.stringify(doc)+'\n',d=sha(raw),rel=OUT+'/'+kind+'/'+d+'.json',file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});if(!fs.existsSync(file))fs.writeFileSync(file,raw,{flag:'wx'});return {rel,digest:d};}
function history(root,kind){const d=path.join(root,OUT,kind);if(!fs.existsSync(d))return [];return fs.readdirSync(d).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).flatMap(n=>{try{const rel=OUT+'/'+kind+'/'+n,raw=fs.readFileSync(path.join(root,rel));if(sha(raw)!==n.slice(0,-5))return [];const cs=git(root,['log','--format=%H','--',rel]).split('\n');if(cs.length!==1||!/^[a-f0-9]{40}$/.test(cs[0]))return [];return [{doc:JSON.parse(raw),rel,digest:n.slice(0,-5),first:git(root,['show','-s','--format=%cI',cs[0]]),commit:cs[0]}];}catch{return [];}});}
async function get(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json','User-Agent':'Public sports research/1.0'}});if(!r.ok)throw Error('http_'+r.status);const raw=await r.text();if(raw.length>40e6)throw Error('size');return {doc:JSON.parse(raw),digest:sha(raw)};}
async function nbaSources(root,clock){
 const cached=history(root,'nba-history'),out=[],status={};let calls=0;
 for(const season of SEASONS){const prev=cached.filter(x=>x.doc.season===season).sort((a,b)=>dt(b.doc.capturedAt)-dt(a.doc.capturedAt))[0];
  if(prev&&(season!=='2026-27'&&prev.doc.seasonCompletenessVerified===true||dt(clock)-dt(prev.doc.capturedAt)<20*3600000)){out.push(prev.doc);status[season]='cached';continue;}
  try{const u=new URL('https://stats.nba.com/stats/leaguegamelog');for(const [k,v] of Object.entries({Counter:'0',DateFrom:'',DateTo:'',Direction:'ASC',LeagueID:'00',PlayerOrTeam:'P',Season:season,SeasonType:'Regular Season',Sorter:'DATE'}))u.searchParams.set(k,v);
   calls++;const d=await get(u);const a=nba.normalizeLogs(d.doc,season,now());a.sourceResponseSha256=d.digest;save(root,'nba-history',a);out.push(a);status[season]='observed';
  }catch{status[season]='pending';if(prev)out.push(prev.doc);}
 }
 let schedule=null;for(const url of ['https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json','https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json'])try{calls++;const d=await get(url);schedule=nba.schedule(d.doc,now());schedule.sourceResponseSha256=d.digest;save(root,'nba-schedule',schedule);break;}catch{}
 if(!schedule){try{const at=now(),client=async(...args)=>{calls++;return fetch(...args);};schedule=await require('./nba-official-preview-schedule.cjs').collect(et(at),at,client);save(root,'nba-schedule',schedule);}catch{}}
 return {histories:out,schedule,status,calls};
}
// Public NBA CDN final box scores are an independent fallback for unavailable
// LeagueGameLog. Keep their provenance distinct; never label them season-complete.
function finalHistory(doc,g,observedAt,digest){
 const stats=official(doc,g.gameId,g.startAt,observedAt);
 if(!stats||! /^[a-f0-9]{64}$/.test(digest)||g.status!==3||et(g.startAt)>=et(observedAt))return null;
 const game=doc.game,rows=[];
 const sides=[game.homeTeam,game.awayTeam];
 if(sides[0].teamTricode!==g.home||sides[1].teamTricode!==g.away||!Number.isInteger(sides[0].score)||!Number.isInteger(sides[1].score)||sides[0].score===sides[1].score)return null;
 for(const [i,t] of sides.entries())for(const p of t.players){
  const x=stats.get(p.personId);if(!x)continue;
  const m=/^PT(\d+)M(\d+(?:\.\d+)?)S$/.exec(p.statistics?.minutes||'');
  const minutes=m?Number(m[1])+Number(m[2])/60:0;
  const player=[p.firstName,p.familyName].filter(Boolean).join(' ').trim();
  if(!player||minutes<=0||minutes>70)continue;
  rows.push({...x,player,gameDate:et(g.startAt),opponent:sides[1-i].teamTricode,home:i===0,minutes,wl:t.score>sides[1-i].score?'W':'L'});
 }
 if(sides.some(t=>rows.filter(p=>p.team===t.teamTricode).length<5))return null;
 return {kind:'nba_official_cdn_final_history_v1',source:'cdn.nba.com final boxscore',sourceResponseSha256:digest,capturedAt:observedAt,gameId:g.gameId,startAt:g.startAt,historicalAppearancesOnly:true,officialFinalClockVerified:true,seasonCompletenessVerified:false,originalPlatformSettlementVerified:false,rows};
}
// When the CDN season schedule is unavailable, corroborate dated official NBA
// game routes with ESPN final status. The actual boxscore still independently
// verifies the NBA ID, final status, clock, teams and player results.
function datedFinalGames(html,doc,date,{historicalSeasonTypes=false}={}){
 const routes=require('./nba-public-schedule-corroboration.cjs').links(html,{includeHistoricalSeasonTypes:historicalSeasonTypes}),out=[],seen=new Set();
 if(!Array.isArray(doc?.events)||doc.events.length>15)return out;
 for(const e of doc.events){
  const c=e.competitions?.[0],s=c?.status?.type;
  if(s?.state!=='post'||s.completed!==true||s.name!=='STATUS_FINAL'||!Number.isFinite(dt(c.date))||et(c.date)!==date)continue;
  const h=c.competitors?.filter(x=>x.homeAway==='home'),a=c.competitors?.filter(x=>x.homeAway==='away');
  if(h?.length!==1||a?.length!==1||c.competitors.length!==2)continue;
  const home=nba.teams(h[0].team?.abbreviation),away=nba.teams(a[0].team?.abbreviation),ids=routes.get(away+'@'+home);
  if(ids?.size!==1||home===away)continue;
  const gameId=Number([...ids][0]);if(seen.has(gameId))continue;seen.add(gameId);
  out.push({gameId,startAt:c.date,home,away,status:3,source:'NBA dated game route plus ESPN final'});
 }
 return out;
}
async function recentFinalSchedule(clock,client=fetch){
 const games=[],failures=[];let calls=0;
 const read=async(url,accept)=>{calls++;const r=await client(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:accept,'User-Agent':'NBA schedule research/1.0'}});if(!r.ok)throw Error('http_'+r.status);const raw=await r.text();if(raw.length>8e6)throw Error('size');return raw;};
 for(const i of [1,2]){const date=et(dt(clock)-i*86400000);try{
  const html=await read('https://www.nba.com/games?date='+date,'text/html');
  const raw=await read('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','')+'&limit=100','application/json');
  for(const g of datedFinalGames(html,JSON.parse(raw),date))games.push({...g,routeResponseSha256:sha(html),independentResponseSha256:sha(raw)});
 }catch{failures.push(date);}}
 return {games,calls,failedDates:failures};
}
async function recoverFinalHistory(root,schedule,clock,fetchBox=get,fetchPage=require('./nba-official-web-boxscore.cjs').read){
 const prior=history(root,'nba-final-history'),done=new Set(prior.map(x=>x.doc.gameId));
 const candidates=(schedule?.games||[]).filter(g=>g.status===3&&et(g.startAt)<et(clock)&&dt(clock)-dt(g.startAt)<45*86400000&&!done.has(g.gameId)).sort((a,b)=>dt(b.startAt)-dt(a.startAt)).slice(0,12);
 let calls=0,archived=0,rows=0;
 for(const g of candidates)try{
  calls++;
  const dated=g.source==='NBA dated game route plus ESPN final'&&[g.routeResponseSha256,g.independentResponseSha256].every(d=>/^[a-f0-9]{64}$/.test(d));
  const d=dated?await fetchPage(g):await fetchBox('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_'+String(g.gameId).padStart(10,'0')+'.json');
  const x=finalHistory(d.doc,g,now(),d.digest);
  if(!x)continue;
  if(dated){
   x.kind='nba_official_web_final_history_v1';x.source='nba.com official game box score';x.sourceUrl=d.sourceUrl;
   x.scheduleEvidence={source:g.source,routeResponseSha256:g.routeResponseSha256,independentResponseSha256:g.independentResponseSha256};
  }
  save(root,'nba-final-history',x);archived++;rows+=x.rows.length;
 }catch{}
 return {calls,archived,rows,seasonCompletenessVerified:false};
}
function candidates(events,h,schedule,clock){
 const byName=new Map();for(const [id,rows] of h.players){const recent=rows.filter(r=>r.gameDate<et(clock)).at(-1);if(!recent)continue;const k=nba.norm(recent.player),a=byName.get(k)||[];a.push(recent);byName.set(k,a);}
 const out=[];for(const e of events.filter(e=>e.sport==='nba')){
  const names=e.players.map(p=>({name:p,rows:byName.get(nba.norm(p))||[]})),unique=names.filter(x=>x.rows.length===1).map(x=>x.rows[0]);
  const games=schedule.games.filter(g=>g.status===1&&dt(g.startAt)>dt(clock)+900000).map(g=>({g,matched:unique.filter(p=>[g.home,g.away].includes(p.team))})).filter(x=>x.matched.length>=3&&new Set(x.matched.map(p=>p.team)).size===2&&x.matched.length===unique.length);
  out.push({sourceEventId:e.sourceEventId,players:e.players.length,exactNameCandidates:unique.length,possibleGames:games.map(x=>({gameId:x.g.gameId,startAt:x.g.startAt,home:x.g.home,away:x.g.away,playerIds:x.matched.map(p=>p.playerId)})),independentReviewVerified:false,reason:'historical_team_and_name_candidates_only'});
 }return out;
}
function reviewed(root,clock){return history(root,'reviewed-crosswalks').filter(x=>dt(x.first)<=dt(clock)&&x.doc.kind==='pickfinder_public_independent_crosswalk_v1').flatMap(x=>(x.doc.rows||[]).filter(y=>y.independentReviewVerified===true&&/^[a-f0-9]{64}$/.test(y.identityEvidenceSha256||'')&&dt(y.verifiedAt)<=dt(x.first)+999&&dt(y.verifiedAt)<=dt(clock)).map(y=>({...y,reviewCommit:x.commit})));}
// Preregistered shadow pair for NBA low-count stats. Both arms use the same
// Poisson link; only the challenger mixes in the as-of PickFinder average.
const lowCountPairRevision='nba_low_count_avg_l10_equal_weight_v1';
function lowCountPair(market,line,side,nativeMean,average){
 if(!['steals','blocks','turnovers','threePointersMade'].includes(market)||
    !Number.isFinite(line)||line<0||line>30||line%1!==0.5||
    !['Higher','Lower'].includes(side)||
    ![nativeMean,average].every(n=>Number.isFinite(n)&&n>=0&&n<=30))return null;
 const {poissonCdf}=require('../src/prop-probabilities.cjs');
 const selected=mean=>{
  const lower=poissonCdf(Math.floor(line),mean);
  return side==='Higher'?1-lower:lower;
 };
 return {revision:lowCountPairRevision,featureOff:selected(nativeMean),
         featureOn:selected((nativeMean+average)/2)};
}
// Preregistered shadow arm. The empirical native forecast contributes a fixed
// 20-game prior weight; H2H contributes only explicitly counted games.
const matchupPairRevision = 'nba_h2h_native_prior20_v1';
function matchupPair(offer, game, nativeHigher, sample) {
 if (!sample || !Number.isInteger(sample.games) || sample.games < 4 || sample.games > 100 ||
     !Number.isInteger(sample.higher) || sample.higher < 0 || sample.higher > sample.games ||
     !Number.isFinite(dt(game.startAt)) || !Number.isFinite(nativeHigher) || nativeHigher < 0 || nativeHigher > 1 ||
     !Number.isFinite(dt(offer.startAt)) || Math.abs(dt(offer.startAt) - dt(game.startAt)) > 300000 ||
     !['Higher','Lower'].includes(offer.side)) return null;
 const featureOn = (20 * nativeHigher + sample.higher) / (20 + sample.games);
 const selected = probability => offer.side === 'Higher' ? probability : 1 - probability;
 return {revision:matchupPairRevision, featureOn:selected(featureOn), featureOff:selected(nativeHigher),
     historicalHigher:sample.higher, historicalGames:sample.games};
}

const workloadPairRevision = 'nba_native_minutes_low_count_v1';
function workloadPair(h, player, cutoff) {
 if (!['threePointersMade','blocks'].includes(player.market)) return null;
 const {forecast}=require('./nba-low-count-accuracy-research.cjs');
 const {poissonCdf}=require('../src/prop-probabilities.cjs');
 const prior=(h.players.get(player.playerId)||[]).filter(row=>row.team===player.team&&row.gameDate<cutoff);
 const result=forecast(prior.map(row=>({exposure:row.minutes,values:row})),player.market,player.line);
 if (!result) return null;
 const nativeHigher=Math.max(.0001,Math.min(.9999,1-poissonCdf(Math.floor(player.line),result.mean)));
 const selected=probability=>player.offeredSide==='Higher'?probability:1-probability;
 return {revision:workloadPairRevision,featureOn:selected(result.workloadPoisson),
     featureOff:selected(nativeHigher),historyGames:result.history};
}

const reviewedHistoryRevision='nba_independently_reviewed_history_prior20_v1';
const reviewedHistoryMinimum=3;
function reviewedHistoryPair(index,row,clock){
 const {market,line,offeredSide,rawSelectedEstimate}=row;
 if(!index?.size||!Object.values(aliases).includes(market)||!Number.isFinite(line)||line<0||
    !Number.isInteger(line-.5)||!['Higher','Lower'].includes(offeredSide)||
    !Number.isFinite(rawSelectedEstimate)||rawSelectedEstimate<0||rawSelectedEstimate>1)return null;
 const {historyForModel}=require('./pickfinder-native-history-reconciliation.cjs');
 const joined=historyForModel(index,{sport:'nba',playerId:row.playerId,market,asOf:clock,gameStartAt:row.gameStartAt});
 const facts=joined.filter(f=>String(f.eventId)!==String(row.gameId)&&Number.isSafeInteger(f.value)&&f.value>=0).slice(-10);
 if(new Set(facts.map(f=>f.eventId)).size!==facts.length||facts.length<reviewedHistoryMinimum)return null;
 const wins=facts.filter(f=>offeredSide==='Higher'?f.value>line:f.value<line).length;
 // Fixed shrinkage to the same model's selected-side estimate. The matched
 // archive can overlap the native history, so it is never counted as independent training.
 return {revision:reviewedHistoryRevision,featureOn:(20*rawSelectedEstimate+wins)/(20+facts.length),
   featureOff:rawSelectedEstimate,historyGames:facts.length,facts};
}

function reviewedNbaHistory(root,clock){
 const {committedProfiles}=require('./pickfinder-archived-model-inputs.cjs');
 const {fromArchive,nativeIndex}=require('./pickfinder-native-history-reconciliation.cjs');
 const profiles=function*(){
  for(const file of committedProfiles(root)){
   const records=(file.doc.records||[]).filter(x=>x.sport==='nba');
   if(records.length)yield {...file,doc:{records}};
  }
 };
 const index=nativeIndex({facts:[],nhlFinals:[],nflSeasons:[],nbaHistories:history(root,'nba-history'),
   nbaFinalHistories:history(root,'nba-final-history')},clock);
 return fromArchive(root,profiles(),clock,index).reviewedCache;
}
function withReviewedHistory(root,rows,clock){
 if(!rows.length)return rows;
 const reviewedCache=reviewedNbaHistory(root,clock);
 const enriched=rows.map(row=>{
  const pair=reviewedHistoryPair(reviewedCache,row,clock);
  return pair?{...row,reviewedHistoryPair:pair}:row;
 });
 return require('./native-context-prospective-pairs.cjs').attachNativeContext(root,enriched,clock,'NBA');
}

function modelRows({features,h,schedule,reviewed:crosswalk,clock,revision,injuryReceipts=[]}){
 const by=new Map();for(const x of crosswalk){const k=scope(x),a=by.get(k)||[];a.push(x);by.set(k,a);}
 const rows=[];for(const x of features){const o=x.offer,m=aliases[o.market];if(!Number.isFinite(dt(x.manifestFirst))||dt(x.manifestFirst)>dt(clock)||o.sport!=='nba'||!m||o.period||o.mapRange||o.gameMode||!Number.isFinite(dt(o.observedAt))||dt(o.observedAt)>dt(clock)||dt(clock)-dt(o.observedAt)>30*60000)continue;
  const ids=by.get(scope(o))||[];if(ids.length!==1)continue;const id=ids[0],g=schedule.games.find(g=>g.gameId===id.nativeEventId);
  if(!g||g.status!==1||dt(g.startAt)<=dt(clock)+900000||!Number.isInteger(id.nativePlayerId)||!h.players.has(id.nativePlayerId)||!['Higher','Lower'].includes(o.side)||![g.home,g.away].includes(id.team)||id.nativeMarket!==m||id.sourcePlayer!==o.player||id.verifiedStartAt!==g.startAt)continue;
  if(!h.players.get(id.nativePlayerId).some(p=>nba.norm(p.player)===nba.norm(o.player)))continue;
  const p={playerId:id.nativePlayerId,gameId:g.gameId,gameStartAt:g.startAt,team:id.team,opponent:id.team===g.home?g.away:g.home,market:m,line:o.line,offeredSide:o.side};
  const status=injuryReceipts.length?availability.statusFor(injuryReceipts,{team:p.team,name:id.sourcePlayer},g,clock):null;
  if(status?.status==='out')continue;
  const pred=nba.project(h,p,et(clock));if(!pred)continue;
  const pair=lowCountPair(m,o.line,o.side,pred.projection,x.features?.['Avg L10']);
  const matchup=dt(o.observedAt)<=dt(x.manifestFirst)+999?matchupPair(o,g,pred.higher,x.matchup):null;
  const workload=workloadPair(h,p,et(clock));
  rows.push({...p,...(status?{officialAvailability:status}:{}),...(workload?{workloadPair:workload}:{}),...(matchup?{matchupPair:matchup}:{}),...(pair?{lowCountPair:pair}:{}),sourceManifestDigest:x.manifestDigest,sourceEventId:o.eventId,sourceDetailId:o.detailId,book:o.book,tier:o.tier,sourceObservedAt:o.observedAt,reviewCommit:id.reviewCommit,rawSelectedEstimate:o.side==='Higher'?pred.higher:1-pred.higher,baselineSelectedEstimate:o.side==='Higher'?pred.baselineHigher:1-pred.baselineHigher,projection:pred.projection,probabilityConditionalOnDecided:true,features:x.features,quoteBenchmarks:x.quotes.filter(q=>dt(q.observedAt)<=dt(clock)&&dt(clock)-dt(q.observedAt)<=300000),modelRevision:revision,researchOnly:true,originalPlatformVerified:false,modelApproved:false});
 }return rows;
}
// Share the immutable offer scope across prediction entry points. A new repository
// revision does not make an existing player/event/threshold/side a new offer.
const forecastOfferKey = row => JSON.stringify([row.book,row.gameId,row.playerId,row.market,
    row.line,row.offeredSide,row.tier??null]);
function newForecastRows(rows, prior) {
 const seen=new Set(prior.map(forecastOfferKey));
 return rows.filter(row=>{
  const key=forecastOfferKey(row);
  if(seen.has(key))return false;
  seen.add(key);
  return true;
 });
}

function gradingQueue(frames,prior,clock){
 const games=new Map(),selected=[],seen=new Set();let archived=0,pendingNotDue=0,alreadyGraded=0,invalid=0;
 for(const f of [...frames].sort((a,b)=>dt(a.first)-dt(b.first)||a.digest.localeCompare(b.digest)))for(const p of f.doc.rows||[]){
  const revision=f.doc.modelRevision||p.modelRevision;
  const id=JSON.stringify([revision,p.book,p.gameId,p.playerId,p.market,p.line,p.offeredSide,p.tier]);
  const legacyId=JSON.stringify([f.doc.modelRevision,p.book,p.gameId,p.playerId,p.market,p.line,p.offeredSide,p.tier]);
  if(!revision||![f.doc.generatedAt,f.first,p.gameStartAt,clock].every(t=>Number.isFinite(dt(t)))||dt(f.doc.generatedAt)>dt(f.first)+999||dt(f.first)>dt(clock)||dt(f.first)+900000>=dt(p.gameStartAt)){invalid++;continue;}
  if(seen.has(id))continue;seen.add(id);archived++;
  if(prior.has(id)||prior.has(legacyId)){alreadyGraded++;continue;}
  if(dt(clock)-dt(p.gameStartAt)<3*3600000){pendingNotDue++;continue;}
  games.set(p.gameId,p.gameStartAt);selected.push({p,id,forecastDigest:f.digest});
 }
 return {games,selected,archived,pendingNotDue,alreadyGraded,invalid};
}
async function grade(root,clock){
 const frames=history(root,'nba-forecasts'),prior=new Set(history(root,'nba-grades').flatMap(x=>(x.doc.rows||[]).map(y=>y.id)));
 const {games,selected,archived,pendingNotDue,alreadyGraded,invalid}=gradingQueue(frames,prior,clock);
 const finals=new Map(),sourceFailures={},sourceRoutes={};let calls=0;
 const archivedFinals=history(root,'nba-final-history');
 for(const [id,start] of [...games].slice(0,12)){
  const cached=archivedFinals.filter(({doc,first})=>doc.kind==='nba_official_web_final_history_v1'&&doc.source==='nba.com official game box score'&&doc.gameId===id&&dt(doc.startAt)===dt(start)&&doc.officialFinalClockVerified===true&&dt(doc.capturedAt)>dt(start)&&dt(doc.capturedAt)<=dt(first)+999&&dt(first)<=dt(clock)&&/^[a-f0-9]{64}$/.test(doc.sourceResponseSha256));
  if(cached.length===1){
   const doc=cached[0].doc;
   const entries=doc.rows.filter(p=>p.gameId===id&&p.officialGameFinalVerified===true&&p.identityVerified===true&&p.appeared===true).map(p=>[p.playerId,p]);
   const rows=new Map(entries);
   if(rows.size===entries.length&&rows.size>=10){finals.set(id,{rows,observedAt:doc.capturedAt,digest:doc.sourceResponseSha256,source:doc.source});sourceRoutes.archived_official_web=(sourceRoutes.archived_official_web||0)+1;continue;}
  }
  const adapter=require('./nba-bounded-official-final.cjs'),a=await adapter.fetchFinal(id,start,clock);calls+=a.calls;for(const [k,n] of Object.entries(a.failures))sourceFailures[k]=(sourceFailures[k]||0)+n;if(!a.final)continue;const f=a.final,rows=adapter.parse(f.bytes,id,start,f.observedAt);if(rows){sourceRoutes[f.source]=(sourceRoutes[f.source]||0)+1;finals.set(id,{rows,observedAt:f.observedAt,digest:sha(f.bytes),source:f.source});}}
 const rows=[],seen=new Set();for(const x of selected){if(seen.has(x.id))continue;seen.add(x.id);const p=x.p,f=finals.get(p.gameId),stat=f?.rows.get(p.playerId);if(!stat||stat.team!==p.team)continue;const result=nba.gradePaper(p,stat);if(result==='pending')continue;rows.push({id:x.id,forecastDigest:x.forecastDigest,gameId:p.gameId,playerId:p.playerId,market:p.market,actual:stat[p.market],result,modelEstimate:p.rawSelectedEstimate,...(p.reviewedHistoryPair?{reviewedHistoryPair:p.reviewedHistoryPair}:{}),...(p.nativeContextPair?{nativeContextPair:p.nativeContextPair}:{}),...(p.workloadPair?{workloadPair:p.workloadPair}:{}),...(p.matchupPair?{matchupPair:p.matchupPair}:{}),...(p.lowCountPair?{lowCountPair:p.lowCountPair}:{}),baselineEstimate:p.baselineSelectedEstimate??null,modelProjection:p.projection,pickfinderAverage:Number.isFinite(p.features?.['Avg L10'])?p.features['Avg L10']:null,quoteBenchmarks:p.quoteBenchmarks||[],side:p.offeredSide,officialResponseSha256:f.digest,officialObservedAt:f.observedAt,officialSource:f.source});}
 if(rows.length)save(root,'nba-grades',{kind:'pickfinder_public_nba_independent_grades_v1',generatedAt:now(),rows,appSettlementVerified:false});return {registered:selected.length,archivedPregameRows:archived,pendingNotDue,alreadyGraded,invalidPregameRows:invalid,dueForGrade:selected.length,pendingDueAfterRun:selected.length-rows.length,newGrades:rows.length,finalGames:finals.size,calls,sourceFailures,sourceRoutes};
}
function baselineScores(pairs){
 if(!pairs.length)return {decided:0,modelBrier:null,baselineBrier:null,modelLogLoss:null,baselineLogLoss:null};
 const loss=(probability,hit)=>-Math.log(Math.max(1e-15,hit?probability:1-probability));
 let modelBrier=0,baselineBrier=0,modelLogLoss=0,baselineLogLoss=0;
 for(const {modelEstimate,baselineEstimate,result} of pairs){
  const hit=Number(result==='correct');
  modelBrier+=(modelEstimate-hit)**2;
  baselineBrier+=(baselineEstimate-hit)**2;
  modelLogLoss+=loss(modelEstimate,hit);
  baselineLogLoss+=loss(baselineEstimate,hit);
 }
 const n=pairs.length;
 return {decided:n,modelBrier:modelBrier/n,baselineBrier:baselineBrier/n,modelLogLoss:modelLogLoss/n,baselineLogLoss:baselineLogLoss/n};
}
function verifiedComparisonRows(frames,grades,clock){
 const {decided}=require('./rolling-probability-performance.cjs').linkedGrades(frames,grades,clock);
 const official=new Set(['cdn','stats_v3','nba.com official game box score']);
 return decided.filter(r=>official.has(r.officialSource)).map(r=>{
  const p=r.f.p;
  // A grade can establish the outcome, never replace or add a frozen model input.
  const native=p.nativeContextPair;
  const nativeContextPair=native?.metric===p.market&&Number.isFinite(dt(native?.latestArchiveKnownAt))&&
   dt(native.latestArchiveKnownAt)<=dt(r.f.generatedAt)&&Math.abs(native.incumbent-p.rawSelectedEstimate)<1e-12?native:null;
  return {id:r.id,gameId:p.gameId,market:p.market,side:p.offeredSide,result:r.result,actual:r.actual,
   modelEstimate:p.rawSelectedEstimate,baselineEstimate:p.baselineSelectedEstimate??null,
   modelProjection:p.projection,pickfinderAverage:p.features?.['Avg L10'],quoteBenchmarks:p.quoteBenchmarks||[],
   lowCountPair:p.lowCountPair,matchupPair:p.matchupPair,workloadPair:p.workloadPair,
   reviewedHistoryPair:p.reviewedHistoryPair,nativeContextPair};
 });
}
function pairedStats(rows){
 const by={},unique=new Map(),conflicts=new Set();for(const r of rows){if(!r.id)continue;const old=unique.get(r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))conflicts.add(r.id);else if(!old)unique.set(r.id,r);}for(const [id,r] of unique){if(conflicts.has(id)||!['correct','incorrect'].includes(r.result)||!Number.isFinite(r.actual)||!Number.isFinite(r.modelEstimate)||r.modelEstimate<0||r.modelEstimate>1)continue;const a=by[r.market]??={baselinePairs:[],lowCountPairs:[],matchupPairs:[],workloadPairs:[],reviewedHistoryPairs:[],nativeContextPairs:[],n:0,brier:0,logLoss:0,quoteN:0,quoteBrier:0,pairedModelBrier:0,avgN:0,avgMAE:0,pairedProjectionMAE:0};const pair=r.lowCountPair;
 if(pair?.revision===lowCountPairRevision&&[pair.featureOn,pair.featureOff].every(p=>Number.isFinite(p)&&p>=0&&p<=1))
  a.lowCountPairs.push({modelEstimate:pair.featureOn,baselineEstimate:pair.featureOff,result:r.result});
 const matchup=r.matchupPair;
 if(matchup?.revision===matchupPairRevision&&[matchup.featureOn,matchup.featureOff].every(p=>Number.isFinite(p)&&p>=0&&p<=1))
  a.matchupPairs.push({modelEstimate:matchup.featureOn,baselineEstimate:matchup.featureOff,result:r.result});
 const workload=r.workloadPair;
 if(workload?.revision===workloadPairRevision&&[workload.featureOn,workload.featureOff].every(p=>Number.isFinite(p)&&p>=0&&p<=1))
  a.workloadPairs.push({modelEstimate:workload.featureOn,baselineEstimate:workload.featureOff,result:r.result});
 const reviewedHistory=r.reviewedHistoryPair;
 if(reviewedHistory?.revision===reviewedHistoryRevision&&Number.isSafeInteger(reviewedHistory.historyGames)&&
   reviewedHistory.historyGames>=reviewedHistoryMinimum&&[reviewedHistory.featureOn,reviewedHistory.featureOff].every(p=>Number.isFinite(p)&&p>=0&&p<=1))
  a.reviewedHistoryPairs.push({modelEstimate:reviewedHistory.featureOn,baselineEstimate:reviewedHistory.featureOff,result:r.result});
 if(r.nativeContextPair)a.nativeContextPairs.push(r);
 const y=Number(r.result==='correct');if(Number.isFinite(r.baselineEstimate)&&r.baselineEstimate>=0&&r.baselineEstimate<=1)a.baselinePairs.push(r);a.n++;a.brier+=(r.modelEstimate-y)**2;a.logLoss-=Math.log(Math.max(1e-15,y?r.modelEstimate:1-r.modelEstimate));const qs=(r.quoteBenchmarks||[]).filter(q=>Number.isFinite(q.higher)&&q.higher>=0&&q.higher<=1);if(qs.length){const p=qs.reduce((s,q)=>s+(r.side==='Higher'?q.higher:1-q.higher),0)/qs.length;a.quoteN++;a.quoteBrier+=(p-y)**2;a.pairedModelBrier+=(r.modelEstimate-y)**2;}if(Number.isFinite(r.pickfinderAverage)&&Number.isFinite(r.modelProjection)){a.avgN++;a.avgMAE+=Math.abs(r.pickfinderAverage-r.actual);a.pairedProjectionMAE+=Math.abs(r.modelProjection-r.actual);}}
 return Object.fromEntries(Object.entries(by).map(([k,a])=>[k,{nativeContextFeatureComparison:require('./native-context-prospective-pairs.cjs').scores(a.nativeContextPairs),reviewedHistoryFeatureComparison:{revision:reviewedHistoryRevision,...baselineScores(a.reviewedHistoryPairs),
   evenBrier:a.reviewedHistoryPairs.length ? .25 : null,evenLogLoss:a.reviewedHistoryPairs.length?Math.log(2):null},workloadFeatureComparison:{revision:workloadPairRevision,...baselineScores(a.workloadPairs)},matchupFeatureComparison:{revision:matchupPairRevision,...baselineScores(a.matchupPairs)},lowCountFeatureComparison:{revision:lowCountPairRevision,...baselineScores(a.lowCountPairs)},frozenBaselineComparison:baselineScores(a.baselinePairs),decided:a.n,modelBrier:a.brier/a.n,modelLogLoss:a.logLoss/a.n,pairedQuoteN:a.quoteN,quoteBrier:a.quoteN?a.quoteBrier/a.quoteN:null,pairedModelBrier:a.quoteN?a.pairedModelBrier/a.quoteN:null,pairedAverageN:a.avgN,pickfinderAverageMAE:a.avgN?a.avgMAE/a.avgN:null,modelProjectionMAE:a.avgN?a.pairedProjectionMAE/a.avgN:null,approved:false}]));
}
async function main(root){
 const clock=now(),revision=git(root,['rev-parse','HEAD']),archive=load(root),a=analyze(archive,clock);a.summary.researchCoverage=coverage(root);
 const src=await nbaSources(root,clock);a.summary.nbaOfficialSources={history:src.status,schedule:!!src.schedule,scheduleSource:src.schedule?.source||null,requests:src.calls};
 const missingCurrent=src.status['2026-27']==='pending'||!src.histories.some(h=>h.season==='2026-27');
 if(missingCurrent){
  const at=now(),hasFinals=src.schedule?.games?.some(g=>g.status===3&&et(g.startAt)<et(at)&&dt(at)-dt(g.startAt)<45*86400000);
  const fallback=hasFinals?null:await recentFinalSchedule(at);
  a.summary.nbaFinalHistoryRecovery={...await recoverFinalHistory(root,fallback||src.schedule,at),scheduleFallbackCalls:fallback?.calls||0,scheduleFallbackCandidates:fallback?.games.length||0,scheduleFailedDates:fallback?.failedDates||[]};
 }else a.summary.nbaFinalHistoryRecovery={state:'current_league_log_available'};
 const injuryReceipts=history(root,'nba-official-availability');
 const injury=await availability.collect(src.schedule,injuryReceipts,now());
 if(injury.receipt)save(root,'nba-official-availability',injury.receipt);
 a.summary.nbaOfficialAvailability={state:injury.state,requests:injury.calls,
   newlyObservedStatuses:injury.receipt?.rows.length||0,existingCommittedReceipts:injuryReceipts.length,
   nominationsUseOnlyPreexistingReceipts:true,modelApproved:false};
 let rows=[];if(src.histories.length&&src.schedule){const h=nba.indexHistory(src.histories),at=now(),c=candidates(a.events,h,src.schedule,at);save(root,'nba-identity-candidates',{kind:'public_nba_identity_candidates_v1',generatedAt:at,rows:c});a.summary.nbaIdentityCandidates={events:c.length,exactNameCandidates:c.reduce((s,x)=>s+x.exactNameCandidates,0),uniqueScheduleCandidates:c.filter(x=>x.possibleGames.length===1).length,reviewed:false};
 // Historical walk-forward evaluation of existing model only; not a new feature qualification.
 a.summary.nbaRetrospective=nba.backtest(h);
 const existing=history(root,'nba-forecasts').flatMap(frame=>frame.doc.rows||[]);
 rows=withReviewedHistory(root,newForecastRows(modelRows({features:a.featureRows,h,schedule:src.schedule,
   reviewed:reviewed(root,at),clock:at,revision,injuryReceipts}),existing),at);
 if(rows.length)save(root,'nba-forecasts',{kind:'pickfinder_public_nba_shadow_forecasts_v1',generatedAt:at,rows,modelRevision:revision,researchOnly:true,originalPlatformVerified:false});
 }
 a.summary.nbaOfficialAvailability.forecastsWithStatus=rows.filter(row=>row.officialAvailability).length;
 a.summary.nbaReviewedHistoryShadowRows=rows.filter(row=>row.reviewedHistoryPair).length;
 a.summary.nbaWorkloadShadowRows=rows.filter(row=>row.workloadPair).length;
 a.summary.nbaMatchupShadowRows=rows.filter(row=>row.matchupPair).length;
 a.summary.nbaShadowRows=rows.length;a.summary.independentGrading=await grade(root,now());
 const committedFrames=history(root,'nba-forecasts'),committedGrades=history(root,'nba-grades'),gradedAt=now();
 a.summary.prospectiveComparisonEvidence='first_git_forecast_and_official_grade_v1';
 a.summary.prospectiveComparisons=pairedStats(verifiedComparisonRows(committedFrames,committedGrades,gradedAt));
 // Only committed original forecast and grade receipts; new grades enter on the next run.
 a.summary.rollingProbabilityPerformance=require('./rolling-probability-performance.cjs').audit(committedFrames,committedGrades,gradedAt);
 a.summary.competitionDiscovery=await require('./season-aware-discovery.cjs').discover({env:{}});
 a.summary.lineupResearch={sizes:[2,3,4,5,6],qualifiedUnconditionalMarginals:0,automaticLineupsApproved:false,reason:'conditional estimates cannot be used as unconditional all-hit probabilities'};
 a.summary.sportModelStatus=Object.fromEntries(['nba','nhl','nfl','cs2','valorant','dota2','lol','cod'].map(s=>[s,{boardObserved:!!a.summary.bySport[s],independentModelJoin:s==='nba'?rows.length:0,productionApproved:false}]));
 fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data/pickfinder-public-research-health.json'),JSON.stringify(a.summary,null,2)+'\n');
 console.log(JSON.stringify({state:'public_research_validation',manifests:a.summary.archiveManifests,invalid:a.summary.invalidManifests,offerRefs:a.summary.offerRefs,exactComparisons:a.summary.exactComparisons,nbaShadowRows:rows.length,nbaSources:a.summary.nbaOfficialSources,independentGrading:a.summary.independentGrading,paidRequests:0,privateRepoUsed:false}));
}
module.exports={grade,reviewedHistoryPair,reviewedNbaHistory,withReviewedHistory,lowCountPair,matchupPair,workloadPair,newForecastRows,forecastOfferKey,candidates,modelRows,aliases,pairedStats,verifiedComparisonRows,reviewed,history,save,gradingQueue,finalHistory,recoverFinalHistory,datedFinalGames,recentFinalSchedule};
if(require.main===module)main(fs.realpathSync(process.argv[2]||'.')).catch(()=>{console.error('Public research validation failed closed');process.exitCode=1;});
