'use strict';
// Public shadow research only. Raw operator responses never leave process memory.
const fs=require('node:fs'), path=require('node:path');
const {git,load}=require('./pickfinder-public-evidence-audit.cjs');
const {sha}=require('./pickfinder-public-archive.cjs');
const {history,save}=require('./pickfinder-public-model-validation.cjs');
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const {generate,researchTier}=require('./native-individual-research.cjs');
const {nativeIndex}=require('./pickfinder-native-history-reconciliation.cjs');
const {finalFor}=require('./pickfinder-reviewed-history-model.cjs');
const {toRows}=require('./collect-live-partner-nhl-nfl.cjs');
const {COLUMNS}=require('../src/partner-prizepicks-board.cjs');
const {classify}=require('../src/partner-direction-tier-evidence.cjs');

const MAX_AGE=300000, LEAD=900000, dt=Date.parse;
const FOLDER='nhl-public-sog-forecasts', GRADES='nhl-public-sog-grades';
const FORECAST='nhl_public_sog_shadow_forecasts_v1', GRADE='nhl_public_sog_shadow_grades_v1';
const REPORT='nhl_public_sog_shadow_status_v1';
const PARTNER='https://partner-api.prizepicks.com/projections?league_id=8&per_page=250&single_stat=true';
const today=()=>new Date().toISOString();
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const revision=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const line=x=>Number.isFinite(x)&&x>=.5&&x%1===.5;
const fresh=(t,at)=>dt(t)<=at&&at-dt(t)<=MAX_AGE;
const exactTime=x=>typeof x==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(dt(x));
const full=x=>x==null||['full','game','full game','full_game'].includes(String(x).trim().toLowerCase());
const text=x=>String(x??'').normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
const key=x=>JSON.stringify(x);
const diag=(out,k)=>{out[k]=(out[k]||0)+1;};
const offerScope=x=>key([text(x.player),text(x.team),text(x.opponent),dt(x.startAt),x.line]);
const decisionId=x=>key([String(x.gameId),String(x.playerId),x.line]);
const personGame=x=>key([String(x.gameId),String(x.playerId)]);
const sideFor=q=>q>.5?'Higher':q<.5?'Lower':null;
const probability=x=>Number.isFinite(x)&&x>=0&&x<=1;

function candidates(archive,clock,{latestIncluded=false}={}){
 const at=dt(clock),out=[],excluded={};
 for(const b of archive.latest){
  if(b.m.sport!=='nhl'||b.m.book!=='prizepicks')continue;
  if(b.m.boardState!=='populated') {diag(excluded,'board_'+(['empty','partial','disabled'].includes(b.m.boardState)?b.m.boardState:'unknown'));continue;}
  if(b.m.pageTraversalComplete!==true){diag(excluded,'incomplete_traversal');continue;}
  if(!hash(b.digest)||!(dt(b.first)<=at)||!fresh(b.m.lastObservedAt,at)){diag(excluded,'stale_or_uncommitted_board');continue;}
  const offers=[];
  for(const o of b.offers){
   if(o.market!=='player_shots_on_goal'||o.sport!=='nhl'||o.book!=='prizepicks')continue;
   if(!o.eventId||!o.detailId||!full(o.period)||o.mapRange!=null||o.gameMode!=null||researchTier(o)!=='standard'||!line(o.line)){diag(excluded,'nonstandard_or_unsupported_scope');continue;}
   if(!exactTime(o.startAt)){diag(excluded,'missing_exact_pickfinder_start');continue;}
   if(dt(o.startAt)<=at+LEAD){diag(excluded,'too_close_or_started');continue;}
   if(!fresh(o.observedAt,at)||dt(o.observedAt)>dt(b.first)+999){diag(excluded,'stale_or_uncommitted_offer');continue;}
   offers.push(o);
  }
  if(offers.length)out.push({...b,offers});
 }
 if(!out.length&&!Object.keys(excluded).length)diag(excluded,latestIncluded?'no_standard_sog_on_board':'no_pickfinder_nhl_prizepicks_board');
 return {boards:out,excluded};
}
function exactNhlMatchups(boards){
 const matches=new Map();
 for(const b of boards){
  const context=new Map();
  for(const x of b.researchObservations){
   if(x.origin!=='board'||!['Team','Opponent'].includes(x.metric))continue;
   const k=key([x.detailId,x.observedAt]),v=context.get(k)||{Team:new Set(),Opponent:new Set()};
   v[x.metric].add(text(x.value));context.set(k,v);
  }
  for(const o of b.offers){
   const v=context.get(key([o.detailId,o.observedAt]));
   if(v?.Team.size!==1||v?.Opponent.size!==1)continue;
   const teams=[...v.Team,...v.Opponent].sort(),start=dt(o.startAt);
   if(teams[0]&&teams[0]!==teams[1])matches.set(key([start,...teams]),{start,teams});
  }
 }
 return matches;
}
async function prepareOfficial(root,manifestDigest,{clock=today,get}={}){
 const {request,nhlEvents,nhlRoster,save:saveOfficial}=require('./pickfinder-public-identity.cjs');
 const at=clock(),archive=load(root,'nhl',{latestOnly:true,...(manifestDigest&&{digests:[manifestDigest]})});
 if(archive.invalid.length)return {state:'invalid_board',officialRequests:0};
 const matchups=exactNhlMatchups(candidates(archive,at).boards);
 if(!matchups.size)return {state:'no_fresh_exact_matchups',officialRequests:0};
 const officialKey=e=>key([dt(e.startAt),...e.teams.map(t=>text(t.abbr)).sort()]);
 const originals=receipts(root,'research/pickfinder-public-identity-v1/native-facts','independent_public_sport_identity_facts_v1',at)
  .filter(h=>h.doc.sport==='nhl'&&h.doc.source==='nhl:official').sort((a,b)=>dt(b.doc.observedAt)-dt(a.doc.observedAt));
 const targeted=receipts(root,'research/pickfinder-public-identity-v1/nhl-sog-native-facts','independent_public_sport_identity_facts_v1',at);
 const existing=[...originals,...targeted].sort((a,b)=>dt(b.doc.observedAt)-dt(a.doc.observedAt))[0]?.doc;
 if(existing&&dt(at)-dt(existing.observedAt)<=3300000&&[...matchups.keys()].every(k=>
   (existing.events||[]).some(e=>e.status==='pre'&&officialKey(e)===k&&e.teams.every(t=>(existing.roster||[]).some(p=>p.teamId===t.id))))){
  return {state:'existing_official_context',officialRequests:0};
 }
 const prefix='https://api-web.nhle.com/v1/',date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)),season=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
 let officialRequests=0;
 const read=async url=>{officialRequests++;return (get||request)(url);};
 try{
  const schedule=await read(prefix+'schedule/'+date);
  const events=nhlEvents(schedule.data).filter(e=>e.status==='pre'&&matchups.has(officialKey(e))&&dt(e.startAt)>dt(clock())+LEAD);
  if(!events.length||new Set(events.map(officialKey)).size!==events.length)return {state:'no_unique_official_matchups',officialRequests};
  const teams=[...new Map(events.flatMap(e=>e.teams).map(t=>[t.id,t])).values()];
  if(teams.length>20||teams.some(t=>!/^[A-Z]{2,4}$/.test(t.id)))return {state:'official_request_bound',officialRequests};
  const roster=[],proofs=[{url:schedule.url,digest:schedule.sourceDigest,observedAt:schedule.observedAt}];
  for(let i=0;i<teams.length;i+=4){
   const next=clock();
   if(!candidates(archive,next).boards.length)return {state:'official_context_deadline',officialRequests};
   const batch=await Promise.allSettled(teams.slice(i,i+4).map(async t=>{
    const r=await read(prefix+'roster/'+t.id+'/'+season+(season+1));
    return {roster:nhlRoster(r.data,t),proof:{url:r.url,digest:r.sourceDigest,observedAt:r.observedAt,teamId:t.id}};
   }));
   for(const r of batch)if(r.status==='fulfilled'){roster.push(...r.value.roster);proofs.push(r.value.proof);}
   if(batch.some(r=>r.status==='rejected'&&[401,403,429].includes(r.reason?.status)))break;
  }
  const eligible=events.filter(e=>e.teams.every(t=>roster.some(p=>p.teamId===t.id)));
  if(!eligible.length)return {state:'official_rosters_unavailable',officialRequests};
  saveOfficial(root,'nhl-sog-native-facts',{kind:'independent_public_sport_identity_facts_v1',sport:'nhl',source:'nhl:official',
   observedAt:clock(),events:eligible,roster,proofs,coverageScope:'targeted_nhl_sog_shadow_subset',originalPlatformIdentityVerified:false});
  return {state:'staged_targeted_official_context',events:eligible.length,officialRequests};
 }catch{return {state:'official_schedule_or_rosters_unavailable',officialRequests};}
}
async function readPartner(client=fetch,clock=today){
 const r=await client(PARTNER,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('partner_http_unavailable');
 const body=await r.json(),observedAt=clock();
 const {rows}=toRows(body,{sport:'NHL',leagueId:8,minimumRows:0});
 const grouped=new Map();
 for(const raw of rows){
  const x=Object.fromEntries(COLUMNS.map((k,i)=>[k,raw[i]]));
  const {sourceReportedDirections:sides,sourceProjectionTier:tier}=classify(x.tier,x.offeredWagerTypes);
  if(text(x.market)!=='shots on goal'||tier!=='standard'||x.period!=='Full'||x.combo||
    x.position==='G'||!x.player||!x.team||!x.opponent||x.team===x.opponent||
    !exactTime(x.eventStartsAt)||dt(x.eventStartsAt)<=dt(observedAt)+LEAD||
    x.status!=='pre_game'||x.inGame||x.isLive||!line(x.line))continue;
  const k=offerScope({...x,startAt:x.eventStartsAt}),a=grouped.get(k)||[];
  // Keep duplicates, including differently scoped sides, as ambiguity.
  a.push(sides);grouped.set(k,a);
 }
 // Aggregate commitment to the validated response, not a published offer/ID.
 return {observedAt,bodyDigest:sha(JSON.stringify(body)),observedRows:rows.length,groups:grouped};
}
function makeForecasts(modelRows,partner,known,clock){
 const excluded={},found=new Map(),conflicts=new Set(),at=dt(clock),frozenPlayers=new Set([...known.values()].map(f=>personGame(f.row)));
 for(const p of modelRows){
  if(p.sport!=='NHL'||p.book!=='prizepicks'||p.market!=='shotsOnGoal'||p.tier!=='standard'||
    p.researchOnly!==true||p.modelApproved!==false||p.originalPlatformVerified!==false||
    !p.sourceDetailId||!p.sourceEventId||!hash(p.manifestDigest)||!revision(p.modelRevision)||
    !Array.isArray(p.historyDigests)||p.historyDigests.length<1||!p.historyDigests.every(hash)||
    !Number.isSafeInteger(p.priorObservations)||p.priorObservations<5||
    !p.playerId||!p.gameId||!p.player||!p.team||!p.opponent||!line(p.line)||
    !probability(p.probability)||p.pushProbability!==0||!Number.isFinite(p.projection)||p.projection<0){diag(excluded,'model_evidence_unavailable');continue;}
  if(!fresh(partner.observedAt,at)||!fresh(p.sourceObservedAt,at)||
    !(dt(p.forecastAt)<=at)||!(dt(p.startAt)>at+LEAD)){diag(excluded,'forecast_window_closed');continue;}
  const a=partner.groups.get(offerScope(p));
  if(!a||a.length!==1){diag(excluded,a?'ambiguous_partner_match':'no_exact_partner_match');continue;}
  if(!a[0].includes('Higher')||!a[0].includes('Lower')){diag(excluded,'partner_both_sides_unverified');continue;}
  if(!['Higher','Lower'].includes(p.side)){diag(excluded,'unknown_pickfinder_direction');continue;}
  const id=decisionId(p),scope=personGame(p),group=found.get(scope)||{id,sides:new Map()};
  // Predeclare one threshold per player/game. No line shopping or double counting.
  if(frozenPlayers.has(scope)){diag(excluded,'already_frozen_player_game');continue;}
  if(group.id!==id){conflicts.add(scope);continue;}
  const old=group.sides.get(p.side);
  if(old&&key(old)!==key(p)){conflicts.add(scope);continue;}
  group.sides.set(p.side,p);found.set(scope,group);
 }
 const rows=[];
 for(const [scope,{sides}] of found){
  if(conflicts.has(scope)){diag(excluded,'ambiguous_threshold_or_row');continue;}
  const h=sides.get('Higher'),l=sides.get('Lower');
  if(!h||!l){diag(excluded,'pickfinder_both_sides_unverified');continue;}
  if(Math.abs(h.probability+l.probability-1)>1e-9||h.manifestDigest!==l.manifestDigest||
     h.sourceEventId!==l.sourceEventId||h.sourceDetailId!==l.sourceDetailId||
     h.sourceObservedAt!==l.sourceObservedAt||h.startAt!==l.startAt||h.modelRevision!==l.modelRevision||
     h.projection!==l.projection){diag(excluded,'inconsistent_pickfinder_pair');continue;}
  const side=sideFor(h.probability);
  if(!side){diag(excluded,'model_tie');continue;}
  if(known.has(decisionId(h))){diag(excluded,'already_frozen');continue;}
  // Projection and source fields are derived from the permitted PickFinder and
  // official archives. No partner payload, projection ID, player ID or URL is stored.
  const {sport,book,gameId,playerId,team,opponent,startAt,forecastAt,sourceObservedAt,
   modelRevision,historyDigests,manifestDigest,sourceDetailId,sourceEventId,projection,method,priorObservations,line:threshold}=h;
  rows.push({sport,book,gameId,playerId,team,opponent,startAt,forecastAt,sourceObservedAt,modelRevision,
   historyDigests,manifestDigest,sourceDetailId,sourceEventId,projection,method,priorObservations,line:threshold,
   market:'shotsOnGoal',tier:'standard',period:'full_game',side,higherProbability:h.probability,
   partnerObservedAt:partner.observedAt,partnerResponseDigest:partner.bodyDigest,
   researchOnly:true,modelApproved:false,originalPlatformVerified:false});
 }
 return {rows,excluded};
}
function validForecast(p,at){
 return p?.sport==='NHL'&&p.book==='prizepicks'&&p.market==='shotsOnGoal'&&p.tier==='standard'&&
  p.period==='full_game'&&p.gameId&&p.playerId&&p.team&&p.opponent&&p.team!==p.opponent&&
  p.sourceDetailId&&p.sourceEventId&&line(p.line)&&probability(p.higherProbability)&&p.side===sideFor(p.higherProbability)&&
  ['Higher','Lower'].includes(p.side)&&p.researchOnly===true&&p.modelApproved===false&&p.originalPlatformVerified===false&&
  Number.isFinite(p.projection)&&p.projection>=0&&Number.isSafeInteger(p.priorObservations)&&p.priorObservations>=5&&
  revision(p.modelRevision)&&hash(p.manifestDigest)&&hash(p.partnerResponseDigest)&&
  Array.isArray(p.historyDigests)&&p.historyDigests.length>0&&p.historyDigests.every(hash)&&
  dt(p.startAt)>at+LEAD&&dt(p.forecastAt)<=at&&dt(p.sourceObservedAt)<=dt(p.forecastAt)&&
  fresh(p.sourceObservedAt,at)&&fresh(p.partnerObservedAt,at);
}
function committed(frames,clock){
 const found=new Map(),conflicted=new Set();
 for(const f of frames){
  const t=dt(f.first);
  if(f.doc.kind!==FORECAST||!hash(f.digest)||!(t<=dt(clock))||!(dt(f.doc.generatedAt)<=t+999))continue;
  for(const row of f.doc.rows||[]){
   if(!validForecast(row,t+999)||dt(row.startAt)<=t+999+LEAD)continue;
   const k=personGame(row),old=found.get(k);
   if(old&&old.first===t&&key(row)!==key(old.row))conflicted.add(k);
   else if(!old||t<old.first){found.set(k,{row,digest:f.digest,first:t});conflicted.delete(k);}
  }
 }
 return new Map([...found].filter(([k])=>!conflicted.has(k)).map(([,f])=>[decisionId(f.row),f]));
}
function officialGrades(forecasts,index,clock){
 const out=[];
 for(const [id,{row,digest}] of forecasts){
  const f=finalFor({...row,reviewedHistoryPair:{nativeMetric:'sog'}},index,clock);
  if(!f||f.actual<0)continue;
  out.push({id,forecastDigest:digest,officialFinalDigest:f.digest,officialFinalAvailableAt:f.availableAt,
   actual:f.actual,higher:Number(f.actual>row.line)});
 }
 return out;
}
function verifiedGrades(frames,official,clock){
 const byId=new Map(official.map(g=>[g.id,g])),out=new Map();
 for(const f of frames){
  if(f.doc.kind!==GRADE||!(dt(f.first)<=dt(clock))||!(dt(f.doc.generatedAt)<=dt(f.first)+999))continue;
  for(const g of f.doc.rows||[]){
   const v=byId.get(g.id);
   if(v&&Object.keys(v).every(k=>v[k]===g[k])&&dt(v.officialFinalAvailableAt)<=dt(f.first))out.set(g.id,v);
  }
 }
 return out;
}
function scoreboard(forecasts,grades){
 let n=0,brier=0,logLoss=0,modelWins=0,alwaysHigherWins=0;
 const games=new Set(),slates=new Set(),gamesScores=new Map();
 const reliability=Array.from({length:10},()=>({n:0,confidence:0,actual:0}));
 for(const g of grades){
  const f=forecasts.get(g.id);if(!f)continue;
  const {row:p}=f, q=p.higherProbability, y=g.higher;
  n++;games.add(String(p.gameId));slates.add(new Date(p.startAt).toISOString().slice(0,10));brier+=(q-y)**2;
  const bin=reliability[Math.min(9,Math.floor(q*10))];bin.n++;bin.confidence+=q;bin.actual+=y;
  logLoss-=Math.log(Math.max(.0001,y?q:1-q));
  const win=Number(Number(p.side==='Higher')===y);
  modelWins+=win;alwaysHigherWins+=y;
  const game=gamesScores.get(String(p.gameId))||{n:0,m:0,h:0};
  game.n++;game.m+=win;game.h+=y;gamesScores.set(String(p.gameId),game);
 }
 const summary={decisions:n,distinctGames:games.size,distinctStartUtcDates:slates.size,modelWins,alwaysHigherWins,alwaysLowerWins:n-alwaysHigherWins,
  brier:n?brier/n:null,logLoss:n?logLoss/n:null,
  neutralBrier:n ? .25 : null,neutralLogLoss:n?Math.log(2):null,
  calibration:reliability.map((v,i)=>({from:i/10,to:(i+1)/10,n:v.n,meanEstimate:v.n?v.confidence/v.n:null,observedHigherRate:v.n?v.actual/v.n:null})),
  minimumReviewSampleReached:n>=100&&games.size>=30&&slates.size>=10};
 const avg=f=>games.size?[...gamesScores.values()].reduce((a,v)=>a+f(v),0)/games.size:null;
 return {...summary,gameEqualModelHitRate:avg(v=>v.m/v.n),gameEqualAlwaysHigherHitRate:avg(v=>v.h/v.n),gameEqualAlwaysLowerHitRate:avg(v=>1-v.h/v.n)};
}

async function run(root,{mode='grade',manifestDigest=null,clock=today,fetchPartner=readPartner}={}){
 const at=clock(),forecasts=committed(history(root,FOLDER),at);
 const needFinals=[...forecasts.values()].some(f=>dt(f.row.startAt)<dt(at));
 const base='research/pickfinder-public-identity-v1/';
 const finalReceipts=needFinals?receipts(root,base+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',at):[];
 const official=needFinals?officialGrades(forecasts,nativeIndex({facts:[],nhlFinals:finalReceipts,nflSeasons:[]},at),at):[];
 const verified=verifiedGrades(history(root,GRADES),official,at);
 const pending=official.filter(g=>!verified.has(g.id));
 if(pending.length)save(root,GRADES,{kind:GRADE,generatedAt:clock(),rows:pending});
 const result={mode,candidateOffers:0,projectedSides:0,matchedDecisions:0,partnerRequests:0,partnerObservedRows:null,
  excluded:{},newStagedGrades:pending.length};
 if(mode==='capture'){
  if(manifestDigest!==null&&!hash(manifestDigest))throw Error('invalid_manifest_reference');
  const archive=load(root,'nhl',{latestOnly:true,...(manifestDigest&&{digests:[manifestDigest]})});
  if(archive.invalid.length){diag(result.excluded,'invalid_public_archive');return publish(root,result,forecasts,verified,clock);}
  const {boards,excluded}=candidates(archive,clock(),{latestIncluded:archive.latest.some(b=>b.m.book==='prizepicks')});
  result.excluded=excluded;result.candidateOffers=boards.reduce((n,b)=>n+b.offers.length,0);
  if(boards.length){
   const stamp=clock(),snapshot={manifests:boards,latest:boards,invalid:[]};
   const {build}=require('./prizepicks-native-context-readiness.cjs');
   const officialRoot='research/pickfinder-public-identity-v1/';
   const facts=receipts(root,officialRoot+'native-facts','independent_public_sport_identity_facts_v1',stamp);
   facts.push(...receipts(root,officialRoot+'nhl-sog-native-facts','independent_public_sport_identity_facts_v1',stamp));
   const ctx=build({facts,nhlFinals:receipts(root,officialRoot+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',stamp),
    nflSeasons:[],archive:snapshot,clock:stamp,revision:git(root,['rev-parse','HEAD'])});
   const report=generate(ctx);
   result.projectedSides=report.rows.length;
   Object.assign(result.excluded,report.excluded);
   if(!ctx.scopes.some(s=>s.sport==='NHL'))diag(result.excluded,ctx.status.NHL?.reason||'official_nhl_context_unavailable');
   if(report.rows.length&&report.rows.some(p=>fresh(p.sourceObservedAt,dt(clock()))&&dt(p.startAt)>dt(clock())+LEAD)){
    let partner;
    result.partnerRequests=1;
    try{partner=await fetchPartner();}catch{diag(result.excluded,'partner_snapshot_unavailable_or_incomplete');}
    if(partner){
     result.partnerObservedRows=partner.observedRows;
     const {rows,excluded:reasons}=makeForecasts(report.rows,partner,forecasts,clock());
     Object.assign(result.excluded,reasons);
     const generatedAt=clock(),current=rows.filter(r=>validForecast(r,dt(generatedAt)));
     result.matchedDecisions=current.length;
     if(current.length)save(root,FOLDER,{kind:FORECAST,generatedAt,rows:current});
    }
   }else if(report.rows.length)diag(result.excluded,'forecast_window_closed');
  }
 }
 return publish(root,result,forecasts,verified,clock);
}
function publish(root,result,forecasts,verified,clock){
 const report={kind:REPORT,generatedAt:clock(),lastRun:result,committedForecasts:forecasts.size,
  performance:scoreboard(forecasts,verified.values()),paidRequests:0,privateRepoUsed:false,
  researchOnly:true,modelApproved:false,productionChanged:false};
 const file=path.join(root,'data','nhl-public-sog-shadow.json');
 // Grading refreshes totals without erasing the last capture's gate diagnostics.
 if(result.mode==='grade')try{
  const prior=JSON.parse(fs.readFileSync(file));
  if(prior.kind===REPORT)report.lastCapture=prior.lastCapture??(prior.lastRun?.mode==='capture'?prior.lastRun:null);
 }catch{}
 if(result.mode==='capture')report.lastCapture=result;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');return report;
}
function canPublishForecast(frame,at=Date.now()){
 return frame?.kind===FORECAST&&dt(frame.generatedAt)<=at&&Array.isArray(frame.rows)&&frame.rows.length>0&&
  frame.rows.every(p=>validForecast(p,at+999));
}
module.exports={candidates,exactNhlMatchups,prepareOfficial,readPartner,makeForecasts,validForecast,committed,officialGrades,verifiedGrades,scoreboard,run,canPublishForecast};
if(require.main===module)(async()=>{
 const [mode='grade',arg]=process.argv.slice(2);
 if(mode==='verify'){
  const raw=fs.readFileSync(arg);
  if(path.basename(arg)!==sha(raw)+'.json'||!canPublishForecast(JSON.parse(raw)))throw Error('late_or_invalid_forecast_archive');
 }else if(mode==='prepare'){
  if(arg&&!hash(arg))throw Error('invalid_manifest_reference');
  console.log(JSON.stringify(await prepareOfficial(process.cwd(),arg||null)));
 }else{
  if(!['capture','grade'].includes(mode))throw Error('unknown_mode');
  console.log(JSON.stringify(await run(process.cwd(),{mode,manifestDigest:arg||null})));
 }
})().catch(()=>{console.error('NHL public SOG pilot stopped without relaxing its evidence gates');process.exitCode=1;});
