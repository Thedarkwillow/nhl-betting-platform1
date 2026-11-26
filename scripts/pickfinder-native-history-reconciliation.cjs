'use strict';
// Offline historical candidate matching. A native match is not a reviewed provider ID,
// a historical settlement, a prospective feature, or permission to skip collection.
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const {sha}=require('./pickfinder-public-archive.cjs');
const {day,fullDate}=require('./pickfinder-public-history-cache.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
const dt=Date.parse, norm=x=>String(x??'').trim().toLowerCase(), key=x=>JSON.stringify(x);
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const nativeRoot='research/pickfinder-public-identity-v1/';
const nhlMetrics={goals:'goals',assists:'assists',points:'points','shots on goal':'sog','sog':'sog',hits:'hits','blocked shots':'blockedShots','saves':'saves'};
const nflMetrics={'passing yards':'passing_yards','rushing yards':'rushing_yards','receiving yards':'receiving_yards','receptions':'receptions','passing touchdowns':'passing_tds','rushing touchdowns':'rushing_tds','receiving touchdowns':'receiving_tds','passing attempts':'attempts','passing completions':'completions','receiving targets':'targets','rushing attempts':'carries','interceptions thrown':'passing_interceptions'};
// Explicit source slugs from the existing PickFinder model adapter; native stat keys
// are intentionally separate from projection-engine metric names.
const sourceMarkets={
 nhl:{player_goals:'goals',player_assists:'assists',player_points:'points',player_shots_on_goal:'shots on goal',player_blocked_shots:'blocked shots',player_saves:'saves',player_hits:'hits'},
 nfl:{player_receiving_yards:'receiving yards',player_passing_yards:'passing yards',player_rushing_yards:'rushing yards',player_rushing_attempts:'rushing attempts',player_passing_attempts:'passing attempts',player_passing_completions:'passing completions',player_passing_touchdowns:'passing touchdowns',player_pass_yds:'passing yards',player_pass_attempts:'passing attempts',player_pass_completions:'passing completions',player_pass_tds:'passing touchdowns',player_pass_interceptions:'interceptions thrown',player_rush_yds:'rushing yards',player_rush_attempts:'rushing attempts',player_reception_yds:'receiving yards',player_receptions:'receptions',player_receiving_targets:'receiving targets'}
};
const columnAliases={goals:['g'],assists:['a'],points:['pts'],sog:['shots','shots on goal'],blockedShots:['blk','blocks','blocked shots'],saves:['sv'],hits:['hits'],passing_yards:['pass yards','pass yds'],rushing_yards:['rush yards','rush yds'],receiving_yards:['rec yards','rec yds'],receptions:['rec'],passing_tds:['pass tds'],rushing_tds:['rush tds'],receiving_tds:['rec tds'],attempts:['pass attempts','pass att'],completions:['pass completions','pass cmp'],targets:['rec targets','tgt'],carries:['rush attempts','carries'],passing_interceptions:['pass int','interceptions thrown']};
// Exact official NBA log market mappings; no synthesized tip-off time.
const nbaMetrics={player_points:'points',player_rebounds:'rebounds',player_assists:'assists',player_made_threes:'threePointersMade',player_steals:'steals',player_blocks:'blocks',player_turnovers:'turnovers','player_points_+_rebounds_+_assists':'pointsReboundsAssists','player_points_+_rebounds':'pointsRebounds','player_points_+_assists':'pointsAssists','player_rebounds_+_assists':'reboundsAssists',points:'points',rebounds:'rebounds',assists:'assists'};
Object.assign(columnAliases,{rebounds:['reb'],threePointersMade:['3pm','fg3m'],steals:['stl'],blocks:['blk'],turnovers:['tov'],pointsReboundsAssists:['pra','pts+reb+ast','pts + reb + ast'],pointsRebounds:['pr','pts+reb'],pointsAssists:['pa','pts+ast'],reboundsAssists:['ra','reb+ast']});
const dateFormats=['UTC','America/New_York','America/Los_Angeles'].map(timeZone=>new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}));
function dates(t){const d=new Date(t);if(!Number.isFinite(+d))return [];return [...new Set(dateFormats.map(f=>f.format(d)))];}
function nativeIndex({facts,nhlFinals,nflSeasons,nbaHistories=[]},clock){
 const names=new Map(),games=new Map(),conflicts=new Set();
 const at=dt(clock);
 const addName=(sport,name,id)=>{if(!name||!id)return;const k=key([sport,norm(name)]),s=names.get(k)||new Set();s.add(String(id));names.set(k,s);};
 const add=(sport,id,event,start,team,opp,stats,receipt)=>{
  if(!id||!event||!team||!opp||team===opp||!hash(receipt.digest)||!Number.isFinite(dt(start))||!Number.isFinite(dt(receipt.first))||dt(start)>=dt(receipt.first)||dt(receipt.first)>at)return;
  const k=key([sport,String(id),String(event)]),v={sport,id:String(id),event:String(event),start,team,opp,stats,digest:receipt.digest,first:receipt.first};
  const old=games.get(k);if(old&&key([old.start,old.team,old.opp,Object.entries(old.stats).sort()])!==key([start,team,opp,Object.entries(stats).sort()]))conflicts.add(k);
  else if(!old||dt(v.first)<dt(old.first))games.set(k,v);
 };
 for(const h of facts)if(h.doc.sport==='nhl'&&h.doc.source==='nhl:official')for(const p of h.doc.roster||[])addName('nhl',p.name,p.playerId);
 for(const h of nhlFinals)for(const g of h.doc.games||[]){
  const e=g.event;if(e?.namespace!=='nhl:official'||e.completed!==true||e.status!=='post'||e.teams?.length!==2||!hash(g.sourceDigest)||!Number.isFinite(dt(g.observedAt))||dt(e.startAt)>=dt(g.observedAt)||dt(g.observedAt)>dt(h.first)+999)continue;
  for(const p of g.rows||[]){if(p.appeared!==true||!p.stats||!e.teams.some(t=>t.abbr===p.team))continue;add('nhl',p.playerId,e.eventId,e.startAt,p.team,e.teams.find(t=>t.abbr!==p.team)?.abbr,p.stats,h);}
 }
 for(const h of nflSeasons){
  for(const p of h.doc.rosters||[])addName('nfl',p.name,p.gsisId);
  const final=new Map((h.doc.games||[]).filter(g=>g.completedScoreObserved===true&&dt(g.startAt)<dt(h.doc.observedAt)).map(g=>[g.gameId,g]));
  for(const p of h.doc.playerRows||[]){const g=final.get(p.gameId);if(!g||p.week!==g.week||dt(p.gameStartAt)!==dt(g.startAt)||[p.team,p.opponent].sort().join('|')!==[g.home,g.away].sort().join('|')||!p.stats)continue;add('nfl',p.playerId,g.gameId,g.startAt,p.team,p.opponent,p.stats,h);}
 }
 // Official NBA logs establish a game date, not a final or tip-off timestamp.
 for(const h of nbaHistories){
  if(h.doc.kind!=='nba_official_stats_regular_season_log_v1'||h.doc.source!=='stats.nba.com LeagueGameLog'||h.doc.historicalAppearancesOnly!==true||!hash(h.doc.sourceResponseSha256)||!hash(h.digest)||!Number.isFinite(dt(h.first))||dt(h.first)>at||!Number.isFinite(dt(h.doc.capturedAt))||dt(h.doc.capturedAt)>dt(h.first)+999)continue;
  for(const p of h.doc.rows||[]){if(!day(p.gameDate)||p.gameDate>=h.doc.capturedAt.slice(0,10)||!Number.isSafeInteger(p.gameId)||!Number.isSafeInteger(p.playerId)||!p.player||!p.team||!p.opponent||p.team===p.opponent||!['W','L'].includes(p.wl)||!Number.isFinite(p.minutes)||p.minutes<=0)continue;
   addName('nba',p.player,p.playerId);
   const k=key(['nba',String(p.playerId),String(p.gameId)]),stats=Object.fromEntries([...new Set(Object.values(nbaMetrics))].filter(m=>Number.isFinite(p[m])).map(m=>[m,p[m]])),v={sport:'nba',id:String(p.playerId),event:String(p.gameId),start:null,gameDate:p.gameDate,team:p.team,opp:p.opponent,stats,digest:h.digest,first:h.first};
   const old=games.get(k);if(old&&key([old.gameDate,old.team,old.opp,old.stats])!==key([v.gameDate,v.team,v.opp,v.stats]))conflicts.add(k);else if(!old||dt(v.first)<dt(old.first))games.set(k,v);
  }
 }
 const byPlayer=new Map();for(const [k,g] of games)if(!conflicts.has(k)){const p=key([g.sport,g.id]),a=byPlayer.get(p)||[];a.push({...g,dates:g.gameDate?[g.gameDate]:dates(g.start)});byPlayer.set(p,a);}
 return {names,byPlayer,conflicts:conflicts.size};
}
// Reassemble only contiguous chunks from the same archived observation and scope.
// Collector writes chunks consecutively with exact part numbers; never merge across rows.
function* structuredFields(fields){
 for(let i=0;i<fields.length;i++){
  const f=fields[i],m=/^(row \d+) part 1$/.exec(f.metric||'');
  if(!m){if(!/ part \d+$/.test(f.metric||''))yield f;continue;}
  const signature=x=>key([x.origin,x.tab,x.scope,x.observedAt,x.window??null,x.filterSelection??null,x.period??null,x.mapRange??null,x.gameMode??null]);
  const sig=signature(f);let value=f.value,n=2;
  if(typeof value!=='string')continue;
  while(i+1<fields.length&&fields[i+1].metric===m[1]+' part '+n&&signature(fields[i+1])===sig&&typeof fields[i+1].value==='string'&&value.length<16000){value+=fields[++i].value;n++;}
  if(n===2||value.length>16000)continue;
  try{if(Array.isArray(JSON.parse(value)))yield {...f,metric:m[1],value,reassembled:true};}catch{}
 }
}
function columnShape(f){
 const allowed=new Set(['date','game date','opponent','opp','matchup','team','w/l','result','min','minutes','toi','pts','points','reb','ast','g','a','sog','shots','hits','blk','blocks','sv','pass yds','rush yds','rec yds','rec','tgt','line','odds','stat','value','actual','game','map','kills','deaths','assists']);
 const headers=String(f.scope||'').split(' | ').map(norm);
 return headers.slice(0,20).map(h=>allowed.has(h)?h:'other').join('|');
}
function matchRow(r,f,index,clock){
 const reject=reason=>({reason});
 if(!['nhl','nfl','nba'].includes(r.sport))return reject('native_adapter_unavailable');
 if(r.status!=='sampled'||r.truncated!==false||r.coverageVersion!==VERSION||f.origin!=='profile'||!/^row \d+$/.test(f.metric||'')||r.period||r.mapRange||r.gameMode||f.period||f.mapRange||f.gameMode)return reject('unsupported_scope');
 // Base profile tables can contain a Gamelog section even without a named tab.
 // Require the collector's explicit Gamelog window plus the exact date/opponent/stat columns below.
 const namedLog=/game\s*log|historical stats|player stats/i.test(f.tab||'');
 const windowLog=/^Last \d{1,3} Games$/i.test(f.window||'');
 const overview=norm(f.tab)==='player overview';
 if(!namedLog&&!windowLog&&!overview)return reject('not_game_log');
 if(!Number.isFinite(dt(f.observedAt))||dt(f.observedAt)>dt(clock))return reject('observation_clock');
 const metrics=r.sport==='nhl'?nhlMetrics:nflMetrics,market=sourceMarkets[r.sport]?.[norm(r.market)]??norm(r.market),m=r.sport==='nba'?nbaMetrics[norm(r.market)]:metrics[market];if(!m)return reject('unsupported_market');
 const headers=String(f.scope||'').split(' | ').map(norm),dateColumns=headers.map((x,i)=>['date','game date'].includes(x)?i:-1).filter(i=>i>=0),i=dateColumns.length===1?dateColumns[0]:-1,opponents=headers.map((x,i)=>['opponent','opp'].includes(x)?i:-1).filter(i=>i>=0),j=opponents.length===1?opponents[0]:-1;
 if(headers.some(x=>/\b(?:line|odds|projection|average|hit rate|payout)\b/.test(x)))return reject('not_final_stat_table');
 const aliases=new Set([market,norm(m),...(columnAliases[m]||[])]);
 const indices=headers.map((x,i)=>aliases.has(x)?i:-1).filter(i=>i>=0);
 if(i<0||j<0||indices.length!==1||new Set(headers).size!==headers.length)return reject('missing_exact_columns');
 // Overview-only evidence must also have an explicit per-game result marker; otherwise stay unresolved.
 if(!namedLog&&!windowLog&&(!headers.includes('w/l')&&!headers.includes('result')&&!headers.includes('min')&&!headers.includes('minutes')&&!headers.includes('toi')))return reject('overview_game_log_unverified');
 let cells;try{cells=JSON.parse(f.value)}catch{return reject('row_json');}
 if(!Array.isArray(cells)||cells.length!==headers.length||cells.some(c=>!c||c.value!==null&&typeof c.value!=='string'))return reject('row_shape');
 if(typeof cells[i].value!=='string'||typeof cells[indices[0]].value!=='string')return reject('required_cell_missing');
 const raw=cells[i].value.trim(),date=fullDate(raw),md=raw.match(/^(\d{1,2})\/(\d{1,2})$/);
 if(!date&&!md)return reject('date_shape');
 const suffix=md?'-'+md[1].padStart(2,'0')+'-'+md[2].padStart(2,'0'):null;
 if(suffix&&!day('2000'+suffix))return reject('date_shape');
 const shown=(cells[j].value||'').trim().replace(/^(?:vs\.?|@)\s*/i,'');
 const badges=[...new Set((Array.isArray(cells[j].labels)?cells[j].labels:[]).filter(x=>typeof x==='string'&&/^[A-Z]{2,4}$/.test(x)))];
 const opp=shown|| (badges.length===1?badges[0]:'');
 if(badges.length>1||badges.length===1&&shown&&shown!==badges[0])return reject('opponent_evidence_conflict');
 const v=cells[indices[0]].value.trim();
 if(!/^[A-Z]{2,4}$/.test(opp)||!/^[-]?\d+(?:\.\d+)?$/.test(v))return reject('stat_or_opponent_shape');
 const ids=index.names.get(key([r.sport,norm(r.player)]));if(ids?.size!==1)return reject('native_identity_ambiguous');
 const id=[...ids][0],matches=(index.byPlayer.get(key([r.sport,id]))||[]).filter(g=>(g.gameDate?g.gameDate<f.observedAt.slice(0,10):dt(g.start)<dt(f.observedAt))&&g.opp===opp&&g.dates.some(d=>date?d===date:d.endsWith(suffix)));
 if(matches.length!==1)return reject(matches.length?'ambiguous_native_game':'no_matching_native_game');
 const g=matches[0];if(!Number.isFinite(g.stats[m])||g.stats[m]!==Number(v))return reject('native_result_mismatch');return {candidate:{sport:r.sport,playerId:id,eventId:g.event,officialStartAt:g.start,officialGameDate:g.gameDate??null,market:m,value:Number(v),nativeDigest:g.digest,nativeAvailableAt:g.first,profileObservedAt:f.observedAt,sourceDate:raw,sourceDateYearRecovered:!date,providerIdentityReviewed:false,modelApproved:false}};
}
// Reuse exact independently matched statistical facts only as research candidates.
// A match to native history does not constitute a reviewed PickFinder identity.
// No prospective model consumption or collection skip is authorized by this cache.
function candidateCache(rows,clock){
 const cache=new Map(),bad=new Set();
 for(const x of rows.values()){
  if(!hash(x.nativeDigest)||!hash(x.profileDigest)||!Number.isFinite(dt(x.nativeAvailableAt))||!Number.isFinite(dt(x.profileObservedAt))||!Number.isFinite(dt(x.profileAvailableAt))||dt(x.profileObservedAt)>dt(x.profileAvailableAt)+999||Math.max(dt(x.nativeAvailableAt),dt(x.profileAvailableAt))>dt(clock))continue;
  const k=key([x.sport,x.playerId,x.eventId,x.market]),old=cache.get(k);
  if(old&&old.value!==x.value){bad.add(k);continue;}
  if(!old||Math.max(dt(x.nativeAvailableAt),dt(x.profileAvailableAt))<Math.max(dt(old.nativeAvailableAt),dt(old.profileAvailableAt)))cache.set(k,x);
 }
 for(const k of bad)cache.delete(k);
 return {index:cache,conflicts:bad.size};
}
function lookupCandidate(index,{sport,playerId,eventId,market,asOf}){
 const x=index.get(key([sport,playerId,eventId,market]));
 if(!x||!Number.isFinite(dt(asOf))||Math.max(dt(x.nativeAvailableAt),dt(x.profileAvailableAt),dt(x.profileObservedAt))>dt(asOf))return null;
 return {...x,providerIdentityReviewed:false,modelApproved:false,collectionSkipAuthorized:false};
}
function audit(documents,index,clock){
 const rows=new Map(),bySport={};let candidates=0,reassembledRows=0;
 for(const {doc,digest,first} of documents)for(const r of doc.records||[]){if(!['nhl','nfl','nba','cs2','valorant','dota2','lol','cod'].includes(r.sport))continue;
  const s=bySport[r.sport]??={attempts:0,candidates:0,reasons:{}};
  for(const f of structuredFields(r.research||[])){if(f.origin!=='profile'||!/^row \d+$/.test(f.metric||''))continue;s.attempts++;if(f.reassembled)reassembledRows++;const x=matchRow(r,f,index,clock);if(!x.candidate){s.reasons[x.reason]=(s.reasons[x.reason]||0)+1;if(x.reason==='missing_exact_columns'){const shape=columnShape(f);const h=s.columnShapes??={};const k=Object.hasOwn(h,shape)||Object.keys(h).length<40?shape:'other_shapes';h[k]=(h[k]||0)+1;}continue;}s.candidates++;candidates++;
   const c=x.candidate,k=sha(key([r.sport,r.detailId,r.market,c.playerId,c.eventId,c.market,c.value,f.filterSelection??null,f.tab,f.scope]));
   if(!rows.has(k))rows.set(k,{...c,profileDigest:digest,profileAvailableAt:first??null,cacheKey:k});}
 }
 const cached=candidateCache(rows,clock);
 return {rows,cache:cached.index,summary:{kind:'pickfinder_native_history_candidate_reconciliation_v1',bySport,reassembledRows,reusableResearchCandidates:cached.index.size,researchCacheConflicts:cached.conflicts,candidates,distinctCandidates:rows.size,conflictingNativeGames:index.conflicts,independentlyReviewedProviderIdentities:0,qualifiedCacheEntries:0,qualifiedModelInputs:0,paidRequests:0,requestsSkipped:0,modelApproved:false}};
}
function fromArchive(root,documents,clock){return audit(documents,nativeIndex({facts:receipts(root,nativeRoot+'native-facts','independent_public_sport_identity_facts_v1',clock),nhlFinals:receipts(root,nativeRoot+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',clock),nflSeasons:receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock),nbaHistories:require('./pickfinder-public-model-validation.cjs').history(root,'nba-history')},clock),clock);}
module.exports={nativeIndex,matchRow,audit,fromArchive,structuredFields,columnShape,candidateCache,lookupCandidate};
