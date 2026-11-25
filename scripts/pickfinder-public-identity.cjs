'use strict';
// Independent source-native event and player facts; no private repository, paid endpoints or inferred start clocks.
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./pickfinder-public-archive.cjs'),{load,git}=require('./pickfinder-public-evidence-audit.cjs');
const {pandaFixture,dotaIndex,dotaDetail}=require('./esports-free-source-adapters.cjs');
const dt=Date.parse,now=()=>new Date().toISOString(),name=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const leagues={nba:'basketball/nba',nfl:'football/nfl',nhl:'hockey/nhl',mlb:'baseball/mlb',wnba:'basketball/wnba','college-football':'football/college-football','college-basketball':'basketball/mens-college-basketball',tennis:'tennis/atp',soccer:'soccer/eng.1'};
const titles={cs2:'csgo',valorant:'valorant',dota2:'dota2',lol:'lol',cod:'codmw'};
const OUT='research/pickfinder-public-identity-v1';
const day=x=>new Date(x).toISOString().slice(0,10);
const pause=()=>new Promise(r=>setTimeout(r,350));
const validTime=x=>typeof x==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(dt(x));
function save(root,kind,doc){const raw=JSON.stringify(doc)+'\n',digest=sha(raw),d=path.join(root,OUT,kind);fs.mkdirSync(d,{recursive:true});const file=path.join(d,digest+'.json');if(!fs.existsSync(file))fs.writeFileSync(file,raw,{flag:'wx'});return digest;}
async function request(url,headers={},client=fetch){
 const r=await client(url,{redirect:'error',headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(15000)});if(!r.ok){const e=Error('http_'+r.status);e.status=r.status;throw e;}
 const reader=r.body.getReader(),parts=[];let n=0;try{for(;;){const x=await reader.read();if(x.done)break;n+=x.value.length;if(n>12e6){await reader.cancel();throw Error('size');}parts.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
 const raw=Buffer.concat(parts);return {data:JSON.parse(raw.toString('utf8')),sourceDigest:sha(raw),observedAt:now(),url};
}
function espnEvents(d,sport){
 if(!Array.isArray(d.events))throw Error('events');
 const rows=[],seen=new Set();for(const e of d.events){
  if(!id(String(e.id||''))||!validTime(e.date)||!Array.isArray(e.competitions)||e.competitions.length!==1)continue;
  const c=e.competitions[0],teams=c.competitors;
  if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>!id(String(t.team?.id||''))||!t.team?.displayName)||teams[0].team.id===teams[1].team.id||!['pre','in','post'].includes(e.status?.type?.state))continue;
  const eventId=String(e.id);if(seen.has(eventId))throw Error('duplicate event');seen.add(eventId);
  rows.push({sport,namespace:'espn:'+sport,eventId,startAt:e.date,status:e.status.type.state,completed:e.status.type.completed===true,teams:teams.map(t=>({id:String(t.team.id),name:t.team.displayName,abbr:t.team.abbreviation||null,homeAway:t.homeAway||null}))});
 }return rows;
}
function espnRoster(d,team){
 if(String(d.team?.id||'')!==team.id||!Array.isArray(d.athletes))throw Error('roster team');
 const rows=[],seen=new Set();for(const a of d.athletes.flatMap(x=>Array.isArray(x.items)?x.items:[x])){
  if(!id(String(a.id||''))||!name(a.fullName||a.displayName))continue;
  if(seen.has(String(a.id)))throw Error('duplicate roster player');seen.add(String(a.id));
  rows.push({playerId:String(a.id),name:a.fullName||a.displayName,teamId:team.id,team:team.abbr,position:a.position?.abbreviation||null});
 }if(!rows.length)throw Error('empty roster');return rows;
}
function nhlEvents(d){
 if(!Array.isArray(d.gameWeek))throw Error('NHL schedule');
 const out=[];for(const day of d.gameWeek)for(const g of day.games||[]){if(!Number.isSafeInteger(g.id)||!validTime(g.startTimeUTC)||!g.homeTeam?.abbrev||!g.awayTeam?.abbrev||g.homeTeam.abbrev===g.awayTeam.abbrev)continue;
 out.push({sport:'nhl',namespace:'nhl:official',eventId:String(g.id),startAt:g.startTimeUTC,status:['FUT','PRE'].includes(g.gameState)?'pre':['OFF','FINAL'].includes(g.gameState)?'post':'in',completed:['OFF','FINAL'].includes(g.gameState),teams:[{id:g.homeTeam.abbrev,abbr:g.homeTeam.abbrev,name:g.homeTeam.placeName?.default||g.homeTeam.abbrev,homeAway:'home'},{id:g.awayTeam.abbrev,abbr:g.awayTeam.abbrev,name:g.awayTeam.placeName?.default||g.awayTeam.abbrev,homeAway:'away'}]});}
 return out;
}
function nhlRoster(d,team){
 if(!['forwards','defensemen','goalies'].every(k=>Array.isArray(d[k])))throw Error('NHL roster');
 const rows=['forwards','defensemen','goalies'].flatMap(k=>d[k].filter(x=>Number.isSafeInteger(x.id)&&x.firstName?.default&&x.lastName?.default).map(x=>({playerId:String(x.id),name:x.firstName.default+' '+x.lastName.default,teamId:team.id,team:team.abbr,position:x.positionCode||null})));
 if(!rows.length||new Set(rows.map(x=>x.playerId)).size!==rows.length)throw Error('NHL roster IDs');return rows;
}
function groupOffers(archive){
 const groups=new Map();
 for(const b of archive.latest){
  const meta=new Map();for(const f of b.researchObservations||[]){if(f.origin!=='board'||!['Team','Opponent','Matchup'].includes(f.metric)||typeof f.value!=='string'||f.value.length>100)continue;const k=JSON.stringify([f.detailId,f.observedAt]),a=meta.get(k)||{};if(a[f.metric]&&a[f.metric]!==f.value)a.conflict=true;else a[f.metric]=f.value;meta.set(k,a);}
  for(const o of [...b.offers,...b.unpricedTierObservations]){
   if(!o.eventId||!name(o.player)||!o.detailId)continue;const k=JSON.stringify([o.sport,o.eventId]),g=groups.get(k)||{sport:o.sport,eventId:o.eventId,players:new Map(),startTimes:new Set(),observations:0,manifestDigests:new Set()};
   const p=g.players.get(o.player)||{name:o.player,sourceTeams:new Set(),sourceOpponents:new Set(),detailIds:new Set()};
   p.detailIds.add(o.detailId);const m=meta.get(JSON.stringify([o.detailId,o.observedAt]));
   if(m&&!m.conflict){if(m.Team)p.sourceTeams.add(name(m.Team));if(m.Opponent)p.sourceOpponents.add(name(m.Opponent));}
   if(validTime(o.startAt))g.startTimes.add(new Date(o.startAt).toISOString());g.players.set(o.player,p);g.observations++;g.manifestDigests.add(b.digest);groups.set(k,g);
  }
 }
 return [...groups.values()].map(g=>({...g,startTimes:[...g.startTimes],manifestDigests:[...g.manifestDigests],players:[...g.players.values()].map(p=>({...p,sourceTeams:[...p.sourceTeams],sourceOpponents:[...p.sourceOpponents],detailIds:[...p.detailIds]}))}));
}
function match(group,events,rosters,at){
 const by=new Map();for(const r of rosters){const k=name(r.name),a=by.get(k)||[];if(!a.some(x=>x.playerId===r.playerId&&x.teamId===r.teamId))a.push(r);by.set(k,a);}
 const matched=group.players.map(p=>({p,matches:by.get(name(p.name))||[]})),unique=matched.filter(x=>x.matches.length===1);
 const poss=events.filter(g=>g.sport===group.sport&&g.status==='pre'&&dt(g.startAt)>dt(at)+900000).flatMap(g=>{
  const teamIds=g.teams.map(t=>t.id),pairs=unique.filter(x=>teamIds.includes(x.matches[0].teamId));
  if(pairs.length<2||new Set(pairs.map(x=>x.matches[0].teamId)).size!==2||pairs.length!==unique.length)return [];
  const timeCorroborated=group.startTimes.length===1&&Math.abs(dt(group.startTimes[0])-dt(g.startAt))<=300000;
  return [{eventId:g.eventId,namespace:g.namespace,startAt:g.startAt,teams:g.teams,matchedPlayers:pairs.length,timeCorroborated}];
 });
 const selected=poss.length===1?poss[0]:null,players=matched.map(({p,matches})=>{
  const v=matches.length===1?matches[0]:null,team=selected?.teams.find(t=>t.id===v?.teamId),opponent=selected?.teams.find(t=>t.id!==v?.teamId);
  const teamMatches=(raw,t)=>raw.length===1&&[name(t?.abbr),name(t?.name)].filter(Boolean).includes(raw[0]);
  const sourceContextVerified=!!(selected?.timeCorroborated&&v&&team&&opponent&&teamMatches(p.sourceTeams,team)&&teamMatches(p.sourceOpponents,opponent));
  return {sourcePlayer:p.name,sourceDetailIds:p.detailIds,sourceTeams:p.sourceTeams,sourceOpponents:p.sourceOpponents,candidates:matches.map(x=>({playerId:x.playerId,teamId:x.teamId,team:x.team})),uniqueRosterCandidate:!!v,sourceContextCorroborated:sourceContextVerified,independentReviewVerified:false};
 });
 return {sport:group.sport,sourceEventId:group.eventId,sourceManifestDigests:group.manifestDigests,sourceStartTimes:group.startTimes,observations:group.observations,possibleEvents:poss,players,independentReviewVerified:false,originalPlatformVerified:false};
}
function nhlFinal(d,event){
 if(String(d.id)!==event.eventId||!['FINAL','OFF'].includes(d.gameState)||!validTime(d.startTimeUTC)||Math.abs(dt(d.startTimeUTC)-dt(event.startAt))>300000)throw Error('final event mismatch');
 const rows=[];for(const side of ['home','away']){
  const team=d[side+'Team']?.abbrev,roster=d.playerByGameStats?.[side+'Team'];if(!event.teams.some(t=>t.abbr===team)||!roster)throw Error('final team');
  for(const k of ['forwards','defensemen','goalies'])for(const p of roster[k]||[]){
   if(!Number.isSafeInteger(p.playerId)||typeof p.toi!=='string'||!/^\d+:[0-5]\d$/.test(p.toi)||p.toi==='00:00'||p.toi==='0:00')continue;
   const stats={};for(const v of ['goals','assists','points','sog','hits','blockedShots','saves','goalsAgainst'])if(Number.isInteger(p[v])&&p[v]>=0)stats[v]=p[v];
   if(Object.keys(stats).length)rows.push({playerId:String(p.playerId),team,stats,toi:p.toi,appeared:true});
  }
 }if(!rows.length||new Set(rows.map(p=>p.playerId)).size!==rows.length)throw Error('final identities');return rows;
}
async function main(root){
 const archive=load(root),groups=groupOffers(archive),at=now(),start=day(Date.now()-7*86400000).replaceAll('-',''),end=day(Date.now()+72*3600000).replaceAll('-',''),sources={},reports=[],nativeHistory={};let requests=0;
 async function get(url,headers){requests++;return request(url,headers);}
 // Only sports with actual observed source events. Official NHL first; ESPN source IDs remain separate namespaces.
 for(const [sport,league] of Object.entries(leagues)){
  const gs=groups.filter(g=>g.sport===sport);if(!gs.length){sources[sport]={state:'no_source_events_observed'};continue;}
  const official=sport==='nhl',source=official?'nhl:official':'espn:'+sport;let events=[],roster=[],failedTeams=0,proofs=[];
  try{
   if(official){
    const d=await get('https://api-web.nhle.com/v1/schedule/'+day(Date.now()));
    events=nhlEvents(d.data);proofs.push({url:d.url,digest:d.sourceDigest,observedAt:d.observedAt});
   }else{
    // Individual dates avoid rejected range requests. No sport-wide absence claims.
    const unique=new Map(),conflicts=new Set();let failures=0,successfulDays=0,lastError=null;
    for(let offset=0;offset<=3;offset++){
     const date=day(Date.now()+offset*86400000).replaceAll('-','');
     try{const d=await get('https://site.api.espn.com/apis/site/v2/sports/'+league+'/scoreboard?dates='+date+'&limit=100');
      const rows=espnEvents(d.data,sport);successfulDays++;
      proofs.push({url:d.url,digest:d.sourceDigest,observedAt:d.observedAt});
      for(const g of rows){const old=unique.get(g.eventId);if(old&&(old.startAt!==g.startAt||JSON.stringify(old.teams)!==JSON.stringify(g.teams)))conflicts.add(g.eventId);else unique.set(g.eventId,g);}
     }catch(e){failures++;lastError=e;if([401,403,429].includes(e.status))break;}
    }
    if(!successfulDays)throw lastError||Error('schedule unavailable');
    events=[...unique.values()].filter(g=>!conflicts.has(g.eventId));
    proofs.push({individualDateRequests:true,successfulDays,failedDays:failures,conflictingEvents:conflicts.size});
   }
   const teams=[...new Map(events.filter(g=>g.status==='pre'&&dt(g.startAt)>dt(at)&&dt(g.startAt)<dt(at)+72*3600000).flatMap(g=>g.teams).map(t=>[t.id,t])).values()];
   if(['nba','nhl','nfl','mlb','wnba','college-football','college-basketball'].includes(sport))for(const team of teams.slice(0,40)){
    try{const season=new Date().getUTCFullYear()-(new Date().getUTCMonth()<6?1:0),yr=String(season)+String(season+1);
     const d=await get(official?'https://api-web.nhle.com/v1/roster/'+team.id+'/'+yr:'https://site.api.espn.com/apis/site/v2/sports/'+league+'/teams/'+team.id+'/roster');
     const p=official?nhlRoster(d.data,team):espnRoster(d.data,team);roster.push(...p);proofs.push({url:d.url,digest:d.sourceDigest,observedAt:d.observedAt,teamId:team.id});
    }catch(e){failedTeams++;if([401,403,429].includes(e.status))break;}await pause();
   }
   if(official){
    let finalEvents=events.filter(g=>g.completed&&dt(g.startAt)<dt(at));
    try{const prev=await get('https://api-web.nhle.com/v1/schedule/'+day(Date.now()-7*86400000));proofs.push({url:prev.url,digest:prev.sourceDigest,observedAt:prev.observedAt});finalEvents.push(...nhlEvents(prev.data).filter(g=>g.completed&&dt(g.startAt)<dt(at)));}catch{}
    finalEvents=[...new Map(finalEvents.map(g=>[g.eventId,g])).values()].sort((a,b)=>dt(b.startAt)-dt(a.startAt)).slice(0,12);
    const finals=[];for(const g of finalEvents){try{const d=await get('https://api-web.nhle.com/v1/gamecenter/'+g.eventId+'/boxscore');finals.push({event:g,observedAt:d.observedAt,sourceDigest:d.sourceDigest,rows:nhlFinal(d.data,g)});}catch(e){if([401,403,429].includes(e.status))break;}await pause();}
    if(finals.length)save(root,'nhl-final-stat-facts',{kind:'nhl_official_recent_final_stats_v1',observedAt:now(),games:finals,originalPlatformSettlementVerified:false});
    nativeHistory.nhl={finalGames:finals.length,playerAppearances:finals.reduce((s,x)=>s+x.rows.length,0),completeHistoricalSeasons:false};
   }
   if(events.length)save(root,'native-facts',{kind:'independent_public_sport_identity_facts_v1',sport,source,observedAt:now(),events,roster,proofs,originalPlatformIdentityVerified:false});
   const rows=gs.map(g=>match(g,events,roster,now()));reports.push(...rows);
   sources[sport]={state:'observed',source,events:events.length,upcoming:events.filter(g=>g.status==='pre').length,rosterPlayers:roster.length,failedTeams,sourceEvents:gs.length,uniqueEventCandidates:rows.filter(x=>x.possibleEvents.length===1).length,uniquePlayerCandidates:rows.reduce((s,x)=>s+x.players.filter(p=>p.uniqueRosterCandidate).length,0),sourceContextCorroborated:rows.reduce((s,x)=>s+x.players.filter(p=>p.sourceContextCorroborated).length,0),independentReviewVerified:0};
  }catch(e){sources[sport]={state:'source_pending',source,reason:e.status?'http_'+e.status:'network_or_schema',sourceEvents:gs.length};}
 }
 // Free fixture access only if explicitly authorized and confirmed no-charge; no paid details or raw accounts.
 const env=process.env,k=env.PANDASCORE_API_KEY||env.PANDASCORE_TOKEN||env.PANDASCORE;
 for(const [sport,prefix] of Object.entries(titles)){
  const gs=groups.filter(g=>g.sport===sport);sources[sport]={state:gs.length?'fixture_source_pending':'no_source_events_observed',sourceEvents:gs.length,independentReviewVerified:0};
  if(!gs.length||!k||env.PANDASCORE_BETTING_DATA_AUTHORIZED!=='1'||env.PANDASCORE_NO_CHARGE_CONFIRMED!=='1')continue;
  try{const d=await get('https://api.pandascore.co/'+prefix+'/matches/upcoming?per_page=20',{Authorization:'Bearer '+k}),title={cs2:'CS2',valorant:'VALORANT',dota2:'DOTA2',lol:'LOL',cod:'COD'}[sport];
   if(!Array.isArray(d.data))throw Error('fixture');const fixtures=d.data.map(x=>pandaFixture(x,title,Date.now())).filter(Boolean);
   // Count-only; provider IDs and histories need separate redistribution review.
   sources[sport]={...sources[sport],state:'independent_fixture_source_observed',upcomingFixtures:fixtures.length,sourceDigest:d.sourceDigest,sourceObservedAt:d.observedAt,playerIdentityVerified:0};
  }catch(e){sources[sport].reason=e.status?'http_'+e.status:'network_or_schema';if([401,403,429].includes(e.status))break;}
 }
 if(groups.some(g=>g.sport==='dota2')){
  try{const d=await get('https://api.opendota.com/api/proMatches');if(!Array.isArray(d.data))throw Error('index');
   const entries=d.data.map(x=>dotaIndex(x,Date.now())).filter(Boolean).slice(0,6),finals=[];
   for(const e of entries){try{const z=await get('https://api.opendota.com/api/matches/'+e.providerGameId),v=dotaDetail(z.data,e,Date.now());finals.push({game:v.game,playerCount:v.players.length,sourceDigest:z.sourceDigest,observedAt:z.observedAt});}catch(err){if([401,403,429].includes(err.status))break;}await new Promise(r=>setTimeout(r,1100));}
   nativeHistory.dota2={verifiedProviderMatchShapes:finals.length,playerRows:finals.reduce((s,x)=>s+x.playerCount,0),seriesMapScopeVerified:false};if(finals.length)save(root,'dota-match-receipts',{kind:'opendota_index_detail_reconciliation_v1',observedAt:now(),indexDigest:d.sourceDigest,finals,originalOfferMatched:false});
  }catch{nativeHistory.dota2={state:'pending'};}
 }
 if(reports.length)save(root,'candidate-crosswalks',{kind:'public_pickfinder_identity_candidate_v1',observedAt:now(),rows:reports,independentReviewVerified:false,productionApproved:false});
 const summary={kind:'public_pickfinder_identity_health_v1',generatedAt:now(),archiveRevision:git(root,['rev-parse','HEAD']),sourceEvents:groups.length,sources,nativeHistory,independentlyReviewedCrosswalks:0,paidRequests:0,publicRequests:requests,privateRepoUsed:false,modelApproved:false};
 fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data/pickfinder-public-identity-health.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}
module.exports={espnEvents,espnRoster,nhlEvents,nhlRoster,groupOffers,match,nhlFinal};
if(require.main===module)main(fs.realpathSync(process.argv[2]||'.')).catch(()=>{console.error('Public identity audit failed closed');process.exitCode=1;});
