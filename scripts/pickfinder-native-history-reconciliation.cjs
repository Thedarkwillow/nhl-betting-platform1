'use strict';
// Offline historical candidate matching. A native match is not a reviewed provider ID,
// a historical settlement, a prospective feature, or permission to skip collection.
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const {sha}=require('./pickfinder-public-archive.cjs');
const {day,fullDate}=require('./pickfinder-public-history-cache.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
const {indexDetails,extraMetrics}=require('./pickfinder-nba-official-stat-details.cjs');
const dt=Date.parse, norm=x=>String(x??'').trim().toLowerCase(), key=x=>JSON.stringify(x);
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const nativeRoot='research/pickfinder-public-identity-v1/';
const toiSeconds=x=>{const m=typeof x==='string'&&/^(\d{1,3}):([0-5]\d)$/.exec(x.trim());return m?Number(m[1])*60+Number(m[2]):null;};
// Exact labels from the committed full-game NHL profile layout, not the
// similarly named first-period columns or a projection/summary table.
const currentNhlHeaders={assists:['asts'],blockedShots:['bs'],hits:['hit']};
const currentNbaHeaders={rebounds:['rebs'],assists:['asts'],steals:['stls'],blocks:['blks'],turnovers:['to']};
const currentNflHeaders={receptions:['recs'],targets:['tgts'],passing_tds:['pass td'],rushing_tds:['rush td'],receiving_tds:['rec td'],completions:['pass comp'],passing_interceptions:['int'],fg_made:['fgs'],pat_made:['xp'],kicking_points:['kpts'],carries:['rush att']};
const nhlMetrics={'time on ice':'iceTimeSeconds',goals:'goals',assists:'assists',points:'points','shots on goal':'sog','sog':'sog',hits:'hits','blocked shots':'blockedShots','saves':'saves'};
const nflMetrics={'passing yards':'passing_yards','rushing yards':'rushing_yards','receiving yards':'receiving_yards','receptions':'receptions','passing touchdowns':'passing_tds','rushing touchdowns':'rushing_tds','receiving touchdowns':'receiving_tds','passing attempts':'attempts','passing completions':'completions','receiving targets':'targets','rushing attempts':'carries','interceptions thrown':'passing_interceptions','field goals made':'fg_made','extra points made':'pat_made','kicking points':'kicking_points'};
// Explicit source slugs from the existing PickFinder model adapter; native stat keys
// are intentionally separate from projection-engine metric names.
const sourceMarkets={
 nhl:{player_time_on_ice:'time on ice',player_goals:'goals',player_assists:'assists',player_points:'points',player_shots_on_goal:'shots on goal',player_blocked_shots:'blocked shots',player_saves:'saves',player_hits:'hits'},
 nfl:{player_receiving_yards:'receiving yards',player_passing_yards:'passing yards',player_rushing_yards:'rushing yards',player_rushing_attempts:'rushing attempts',player_passing_attempts:'passing attempts',player_passing_completions:'passing completions',player_passing_touchdowns:'passing touchdowns',player_pass_yds:'passing yards',player_pass_attempts:'passing attempts',player_pass_completions:'passing completions',player_pass_tds:'passing touchdowns',player_pass_interceptions:'interceptions thrown',player_rush_yds:'rushing yards',player_rush_attempts:'rushing attempts',player_reception_yds:'receiving yards',player_receptions:'receptions',player_receiving_targets:'receiving targets',player_field_goals:'field goals made',player_field_goals_made:'field goals made',player_extra_points_made:'extra points made',player_kicking_points:'kicking points'}
};
const columnAliases={iceTimeSeconds:['toi','ice time'],goals:['g'],assists:['a'],points:['pts'],sog:['shots on goal'],blockedShots:['blk','blocks','blocked shots'],saves:['sv'],hits:['hits'],passing_yards:['pass yards','pass yds'],rushing_yards:['rush yards','rush yds'],receiving_yards:['rec yards','rec yds'],receptions:['rec'],passing_tds:['pass tds'],rushing_tds:['rush tds'],receiving_tds:['rec tds'],attempts:['pass attempts','pass att'],completions:['pass completions','pass cmp'],targets:['rec targets','tgt'],carries:['rush attempts','carries'],passing_interceptions:['pass int','interceptions thrown']};
// Exact official NBA log market mappings; no synthesized tip-off time.
const nbaMetrics={player_minutes_played:'minutesPlayed',player_points:'points',player_rebounds:'rebounds',player_assists:'assists',player_made_threes:'threePointersMade',player_steals:'steals',player_blocks:'blocks',player_turnovers:'turnovers','player_points_+_rebounds_+_assists':'pointsReboundsAssists','player_points_+_rebounds':'pointsRebounds','player_points_+_assists':'pointsAssists','player_rebounds_+_assists':'reboundsAssists',points:'points',rebounds:'rebounds',assists:'assists'};
Object.assign(columnAliases,{minutesPlayed:['min','minutes'],rebounds:['reb'],threePointersMade:['3pm','fg3m'],steals:['stl'],blocks:['blk'],turnovers:['tov'],pointsReboundsAssists:['pra','pts+reb+ast','pts + reb + ast'],pointsRebounds:['pr','pts+reb'],pointsAssists:['pa','pts+ast'],reboundsAssists:['ra','reb+ast']});
const dateFormats=['UTC','America/New_York','America/Los_Angeles'].map(timeZone=>new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}));
function dates(t){const d=new Date(t);if(!Number.isFinite(+d))return [];return [...new Set(dateFormats.map(f=>f.format(d)))];}
function nativeIndex({facts,nhlFinals,nflSeasons,nbaHistories=[],nbaFinalHistories=[],nbaFinalStatDetails=[]},clock){
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
  for(const p of g.rows||[]){if(p.appeared!==true||!p.stats||!e.teams.some(t=>t.abbr===p.team))continue;add('nhl',p.playerId,e.eventId,e.startAt,p.team,e.teams.find(t=>t.abbr!==p.team)?.abbr,{...p.stats,...(toiSeconds(p.toi)>0?{iceTimeSeconds:toiSeconds(p.toi)}:{})},h);}
 }
 for(const h of nflSeasons){
  for(const p of h.doc.rosters||[])addName('nfl',p.name,p.gsisId);
  const final=new Map((h.doc.games||[]).filter(g=>g.completedScoreObserved===true&&dt(g.startAt)<dt(h.doc.observedAt)).map(g=>[g.gameId,g]));
  for(const p of h.doc.playerRows||[]){const g=final.get(p.gameId);if(!g||p.week!==g.week||dt(p.gameStartAt)!==dt(g.startAt)||[p.team,p.opponent].sort().join('|')!==[g.home,g.away].sort().join('|')||!p.stats)continue;const s=p.stats,kicks=[s.fg_made,s.pat_made],attempted=Number(s.fg_att)>0||Number(s.pat_att)>0;
   const points=kicks.every(x=>Number.isSafeInteger(x)&&x>=0)&&(attempted||kicks.some(x=>x>0))?3*s.fg_made+s.pat_made:null;
   const stats=points!==null&&!Number.isFinite(s.kicking_points)?{...s,kicking_points:points}:s;
   add('nfl',p.playerId,g.gameId,g.startAt,p.team,p.opponent,stats,h);}
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
 for(const h of nbaFinalHistories){
  const d=h.doc;if(!(d.kind==='nba_official_cdn_final_history_v1'&&d.source==='cdn.nba.com final boxscore'||d.kind==='nba_official_web_final_history_v1'&&d.source==='nba.com official game box score')||d.officialFinalClockVerified!==true||!hash(d.sourceResponseSha256)||!hash(h.digest)||!Number.isFinite(dt(d.capturedAt))||!Number.isFinite(dt(h.first))||dt(d.capturedAt)>dt(h.first)+999||dt(h.first)>at)continue;
  for(const p of d.rows||[]){if(p.officialGameFinalVerified!==true||p.identityVerified!==true||p.appeared!==true||p.gameId!==d.gameId||!day(p.gameDate)||!p.player||!Number.isSafeInteger(p.playerId)||!['W','L'].includes(p.wl))continue;
   addName('nba',p.player,p.playerId);
   const stats=Object.fromEntries([...new Set([...Object.values(nbaMetrics),'prizePicksFantasyScore'])].filter(m=>Number.isFinite(p[m])).map(m=>[m,p[m]]));
   if(Number.isFinite(p.minutes)&&p.minutes>0&&p.minutes<=73)stats.minutesPlayed=p.minutes;
   const k=key(['nba',String(p.playerId),String(p.gameId)]);
   // Do not overwrite an independent league-log receipt; exclude disagreements.
   const old=games.get(k);
   if(old){if(old.gameDate!==p.gameDate||old.team!==p.team||old.opp!==p.opponent||Object.keys(stats).some(m=>Number.isFinite(old.stats[m])&&old.stats[m]!==stats[m]))conflicts.add(k);continue;}
   if(!Number.isFinite(dt(d.startAt))||dt(d.startAt)>=dt(d.capturedAt))continue;
   games.set(k,{sport:'nba',id:String(p.playerId),event:String(p.gameId),start:d.startAt,gameDate:p.gameDate,team:p.team,opp:p.opponent,stats,digest:h.digest,first:h.first});
  }
 }
 const byPlayer=new Map();for(const [k,g] of games)if(!conflicts.has(k)){const p=key([g.sport,g.id]),a=byPlayer.get(p)||[];a.push({...g,dates:g.gameDate?[g.gameDate]:dates(g.start)});byPlayer.set(p,a);}
 const nativeCoverage={};for(const g of games.values()){if(conflicts.has(key([g.sport,g.id,g.event])))continue;const x=nativeCoverage[g.sport]??={playerGameRows:0};x.playerGameRows++;}
 return {names,byPlayer,conflicts:conflicts.size,nativeCoverage,extendedNba:indexDetails(nbaFinalStatDetails,nbaFinalHistories,at)};
}
// Reassemble only contiguous chunks from the same archived observation and scope.
// Collector writes chunks consecutively with exact part numbers; never merge across rows.
function* structuredFields(fields){
 for(let i=0;i<fields.length;i++){
  const f=fields[i],m=/^(row \d+) part 1$/.exec(f.metric||'');
  if(!m){if(!/ part \d+$/.test(f.metric||''))yield f;continue;}
  const signature=x=>key([x.origin,x.tab,x.scope,x.observedAt,x.window??null,x.filterSelection??null,x.period??null,x.mapRange??null,x.gameMode??null,x.headerLayout??null]);
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
function nbaNameIds(index,name){
 if(!/ (?:jr|sr)\.?$/.test(name))return index.names.get(key(['nba',name]));
 const bare=name.replace(/\.$/,'');
 return new Set([...(index.names.get(key(['nba',bare]))||[]),...(index.names.get(key(['nba',bare+'.']))||[])]);
}
// This exact archived Portland profile omits a generation suffix. NBA's official
// player page /player/1629057/robert_williams binds the short URL name to Robert
// Williams III, and official scorebooks corroborate the same native ID and team.
// Do not generalize to other profiles, teams, or approved cache/model use.
function reviewedLayoutAlias(r,index){
 if(r.sport!=='nba'||r.market!=='player_turnovers'||norm(r.player)!=='robert williams'||
  profilePath(r.sport,r.detailId)!=='/players/nba/drgx5hfd7wpqhff')return undefined;
 const id='1629057',canonical=nbaNameIds(index,'robert williams iii'),short=nbaNameIds(index,'robert williams');
 if(canonical?.size!==1||!canonical.has(id)||short&&[...short].some(x=>x!==id))return null;
 const games=(index.byPlayer.get(key(['nba',id]))||[]).filter(g=>g.team==='POR'&&Number.isFinite(dt(g.start)));
 return new Set(games.map(g=>g.event)).size>=2?{id,team:'POR'}:null;
}
function matchRow(r,f,index,clock,{allowNbaExtendedFinals=false,logMarket,allowObservedNhlHeaders=false,allowCurrentNbaHeaders=false,allowCurrentNflHeaders=false}={}){
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
 const metrics=r.sport==='nhl'?nhlMetrics:nflMetrics,market=logMarket??sourceMarkets[r.sport]?.[norm(r.market)]??norm(r.market);
 const extra=r.sport==='nba'&&(allowNbaExtendedFinals||allowCurrentNbaHeaders)?extraMetrics[market]:null;
 // Published rule: prizepicks.com/playbook-article/how-to-play-prizepicks-nba-fantasy-scoring-system
 // This formula is PrizePicks-specific. Neither a shared-book profile nor an
 // unbound generic fantasy field is accepted as an original settled outcome.
 const ppFantasy=r.sport==='nba'&&allowNbaExtendedFinals&&market==='player_fantasy_score_all_'&&
  r.book==='prizepicks'&&Array.isArray(r.books)&&r.books.length===1&&r.books[0]==='prizepicks';
 const m=r.sport==='nba'?nbaMetrics[market]??extra?.[0]??(ppFantasy?'prizePicksFantasyScore':null):metrics[market];if(!m||m==='minutesPlayed'&&!allowCurrentNbaHeaders||r.sport==='nfl'&&!allowCurrentNflHeaders&&['fg_made','pat_made','kicking_points'].includes(m))return reject('unsupported_market');
 if(String(f.scope||'').endsWith(' | [header truncated]'))return reject('header_truncated');
 const headers=String(f.scope||'').split(' | ').map(norm),dateColumns=headers.map((x,i)=>['date','game date'].includes(x)?i:-1).filter(i=>i>=0),i=dateColumns.length===1?dateColumns[0]:-1,opponents=headers.map((x,i)=>['opponent','opp'].includes(x)?i:-1).filter(i=>i>=0),j=opponents.length===1?opponents[0]:-1;
 if(headers.some(x=>/\b(?:line|odds|projection|average|hit rate|payout)\b/.test(x)))return reject('not_final_stat_table');
 const aliases=new Set(extra?[extra[1]]:ppFantasy?['fp']:[market,norm(m),...(columnAliases[m]||[]),...(r.sport==='nhl'&&allowObservedNhlHeaders?currentNhlHeaders[m]||[]:[]),...(r.sport==='nba'&&allowCurrentNbaHeaders?currentNbaHeaders[m]||[]:[]),...(r.sport==='nfl'&&allowCurrentNflHeaders?currentNflHeaders[m]||[]:[])]);
 const indices=headers.map((x,i)=>aliases.has(x)?i:-1).filter(i=>i>=0);
 // Repeated unrelated headings are allowed only when the date, opponent and
 // requested stat are each unique and the full row still aligns positionally.
 if(i<0||j<0||indices.length!==1)return reject('missing_exact_columns');
 // Overview-only evidence must also have an explicit per-game result marker; otherwise stay unresolved.
 if(!namedLog&&!windowLog&&(!headers.includes('w/l')&&!headers.includes('result')&&!headers.includes('min')&&!headers.includes('minutes')&&!headers.includes('toi')))return reject('overview_game_log_unverified');
 let cells;try{cells=JSON.parse(f.value)}catch{return reject('row_json');}
 if(!Array.isArray(cells)||cells.some(c=>!c||c.value!==null&&typeof c.value!=='string'))return reject('row_shape');
 if(cells.length!==headers.length)return {reason:'row_column_count_mismatch',shape:headers.length+':'+cells.length};
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
 const decimalMinutes=m==='iceTimeSeconds'&&allowObservedNhlHeaders&&/^\d{1,3}\.\d{2}$/.test(v);
 if(m==='minutesPlayed'&&!/^\d{1,2}(?:\.\d0?)?$/.test(v))return reject('nba_minutes_precision');
 const value=m==='iceTimeSeconds'&&!decimalMinutes?toiSeconds(v):/^-?\d+(?:\.\d+)?$/.test(v)?Number(v):null;
 if(!/^[A-Z]{2,4}$/.test(opp)||!Number.isFinite(value))return reject('stat_or_opponent_shape');
 // In the retrospective layout-only matcher a final dot on Jr./Sr. is formatting,
 // never a license to remove the suffix. Preserve ambiguity across both variants.
 const alias=allowNbaExtendedFinals?reviewedLayoutAlias(r,index):undefined;
 if(alias===null)return reject('native_identity_ambiguous');
 const ids=alias?new Set([alias.id]):r.sport==='nba'&&allowNbaExtendedFinals?nbaNameIds(index,norm(r.player)):index.names.get(key([r.sport,norm(r.player)]));if(ids?.size!==1)return reject('native_identity_ambiguous');
 const id=[...ids][0],matches=(index.byPlayer.get(key([r.sport,id]))||[]).filter(g=>(g.gameDate?g.gameDate<f.observedAt.slice(0,10):dt(g.start)<dt(f.observedAt))&&g.opp===opp&&(!alias||g.team===alias.team)&&g.dates.some(d=>date?d===date:d.endsWith(suffix)));
 if(matches.length!==1)return reject(matches.length?'ambiguous_native_game':'no_matching_native_game');
 const g=matches[0],data=extra?index.extendedNba?.get(key([id,g.event])):g,evidence=extra?data?.metricEvidence[m]:g;
 if(!evidence)return reject('missing_native_stat_details');
 const nativeValue=data.stats[m];
 if(!Number.isFinite(nativeValue)||(decimalMinutes?Number((nativeValue/60).toFixed(2)):m==='minutesPlayed'?Math.round(nativeValue*10)/10:nativeValue)!==value)return reject('native_result_mismatch');return {candidate:{sport:r.sport,playerId:id,eventId:g.event,officialStartAt:g.start,officialGameDate:g.gameDate??null,market:m,value:nativeValue,nativeDigest:evidence.digest,nativeAvailableAt:evidence.first,profileObservedAt:f.observedAt,sourceDate:raw,sourceDateYearRecovered:!date,providerIdentityReviewed:false,modelApproved:false}};
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
// The same source profile can recur with many thresholds, dates and filters.
// Keep provider-path identity evidence separate from native-stat cache keys.
function profilePath(sport,detailId){
 try{
  const u=new URL(detailId,'https://www.pickfinder.app');
  if(u.origin!=='https://www.pickfinder.app'||!/^\/players\/[a-z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(u.pathname)||u.pathname.split('/')[2]!==sport)return null;
  return u.pathname;
 }catch{return null;}
}
function identityEvidence(rows,clock){
 const groups=new Map(),reverse=new Map(),bySport={};let invalid=0;
 for(const x of rows.values()){
  const path=profilePath(x.sport,x.sourceDetailId);
  if(!path||!x.playerId||!x.eventId||!x.sourcePlayer||!hash(x.nativeDigest)||!hash(x.profileDigest)||!Number.isFinite(dt(x.profileAvailableAt))||!Number.isFinite(dt(x.nativeAvailableAt))||!Number.isFinite(dt(x.profileObservedAt))||dt(x.profileObservedAt)>dt(x.profileAvailableAt)+999||Math.max(dt(x.profileAvailableAt),dt(x.nativeAvailableAt))>dt(clock)){invalid++;continue;}
  const k=key([x.sport,path]),g=groups.get(k)||{sport:x.sport,path,ids:new Set(),names:new Set(),games:new Set(),facts:new Set(),nativeDigests:new Set(),profileDigests:new Set()};
  g.ids.add(x.playerId);g.names.add(norm(x.sourcePlayer));g.games.add(x.eventId);g.facts.add(key([x.eventId,x.market,x.value]));g.nativeDigests.add(x.nativeDigest);g.profileDigests.add(x.profileDigest);groups.set(k,g);
  const n=key([x.sport,x.playerId]),paths=reverse.get(n)||new Set();paths.add(path);reverse.set(n,paths);
 }
 const reviewCandidates=[];
 for(const g of groups.values()){
  const st=bySport[g.sport]??={profiles:0,conflictingProfiles:0,unresolvedSingleGame:0,multipleGameCandidates:0,distinctGameFacts:0};
  st.profiles++;
  const id=[...g.ids][0];
  if(g.ids.size!==1||g.names.size!==1||reverse.get(key([g.sport,id])).size!==1){st.conflictingProfiles++;continue;}
  if(g.games.size<2){st.unresolvedSingleGame++;continue;}
  st.multipleGameCandidates++;st.distinctGameFacts+=g.facts.size;
  reviewCandidates.push({sport:g.sport,profilePath:g.path,nativePlayerId:id,sourcePlayer:[...g.names][0],distinctGames:g.games.size,distinctFacts:g.facts.size,nativeDigests:[...g.nativeDigests].sort(),profileDigests:[...g.profileDigests].sort(),independentReviewVerified:false,modelApproved:false});
 }
 return {reviewCandidates,summary:{profiles:groups.size,invalidEvidence:invalid,multipleGameCandidates:reviewCandidates.length,bySport,independentReviewVerified:false,modelApproved:false}};
}
// A separate immutable review receipt must bind the exact profile path, native ID,
// name and evidence digests. Automated statistical matches cannot self-approve.
function reviewedHistory(rows,reviewCandidates,reviews,clock){
 const groups=new Map(),rejects={};const fail=k=>{rejects[k]=(rejects[k]||0)+1;};
 const validTime=t=>Number.isFinite(dt(t));
 const candidateByPath=new Map(reviewCandidates.map(x=>[key([x.sport,x.profilePath]),x]));
 for(const h of reviews){
  if(!hash(h.digest)||!validTime(h.first)||dt(h.first)>dt(clock))continue;
  for(const x of h.doc.rows||[]){
   const k=key([x.sport,x.profilePath]),c=candidateByPath.get(k);
   if(!c||x.independentReviewVerified!==true||!hash(x.identityEvidenceSha256)||!validTime(x.verifiedAt)||dt(x.verifiedAt)>dt(h.first)+999||dt(x.verifiedAt)>dt(clock)||String(x.nativePlayerId)!==c.nativePlayerId||norm(x.sourcePlayer)!==c.sourcePlayer||!Array.isArray(x.nativeDigests)||!Array.isArray(x.profileDigests)||!x.nativeDigests.length||!x.profileDigests.length||!x.nativeDigests.every(d=>hash(d)&&c.nativeDigests.includes(d))||!x.profileDigests.every(d=>hash(d)&&c.profileDigests.includes(d))){fail('review_evidence_unmatched');continue;}
   const g=groups.get(k)||[];g.push({...x,reviewAvailableAt:h.first,reviewDigest:h.digest});groups.set(k,g);
  }
 }
 const accepted=new Map(),bad=new Set();
 for(const x of rows.values()){
  const g=groups.get(key([x.sport,profilePath(x.sport,x.sourceDetailId)]))||[];
  const exact=g.filter(y=>String(y.nativePlayerId)===x.playerId&&y.nativeDigests.includes(x.nativeDigest)&&y.profileDigests.includes(x.profileDigest));
  if(exact.length!==1||!validTime(x.profileAvailableAt)||!validTime(x.nativeAvailableAt)||!validTime(x.profileObservedAt)||dt(x.profileObservedAt)>dt(x.profileAvailableAt)+999)continue;
  const y=exact[0],availableAt=new Date(Math.max(dt(x.profileAvailableAt),dt(x.nativeAvailableAt),dt(y.reviewAvailableAt),dt(y.verifiedAt))).toISOString();
  if(dt(availableAt)>dt(clock))continue;
  const k=key([x.sport,x.playerId,x.eventId,x.market]),old=accepted.get(k);
  if(old&&old.value!==x.value){bad.add(k);continue;}
  if(!old||dt(availableAt)<dt(old.availableAt))accepted.set(k,{...x,availableAt,reviewDigest:y.reviewDigest,providerIdentityReviewed:true,modelApproved:false,collectionSkipAuthorized:false});
 }
 for(const k of bad)accepted.delete(k);
 return {index:accepted,summary:{reviewedProfiles:groups.size,reviewedHistoricalFacts:accepted.size,conflicts:bad.size,rejects,modelApproved:false}};
}
function historyForModel(index,{sport,playerId,market,asOf,gameStartAt}){
 if(!Number.isFinite(dt(asOf))||!Number.isFinite(dt(gameStartAt))||dt(asOf)>=dt(gameStartAt))return [];
 return [...index.values()].filter(x=>x.sport===sport&&x.playerId===String(playerId)&&x.market===market&&x.providerIdentityReviewed===true&&Number.isFinite(dt(x.availableAt))&&dt(x.availableAt)<=dt(asOf)&&Number.isFinite(dt(x.officialStartAt))&&dt(x.officialStartAt)<dt(asOf)).sort((a,b)=>dt(a.officialStartAt)-dt(b.officialStartAt)).map(x=>({eventId:x.eventId,value:x.value,knownAt:x.availableAt,reviewDigest:x.reviewDigest,nativeDigest:x.nativeDigest,profileDigest:x.profileDigest}));
}
// Use at most one explicit source label per NBA metric. MatchRow still requires
// one aligned stat column, an independently resolved appearance, and exact value.
const nbaLogMarkets=[...new Map(Object.entries(nbaMetrics).filter(([m])=>m.startsWith('player_')).map(([m,v])=>[v,m]))];
function audit(documents,index,clock,reviews=[],{expandCurrentNhlLogs=false,expandCurrentNbaLogs=false,expandCurrentNflLogs=false}={}){
 const rows=new Map(),bySport={};let candidates=0,reassembledRows=0;
 for(const {doc,digest,first} of documents)for(const r of doc.records||[]){if(!['nhl','nfl','nba','cs2','valorant','dota2','lol','cod'].includes(r.sport))continue;
  const s=bySport[r.sport]??={attempts:0,candidates:0,reasons:{}};
  for(const f of structuredFields(r.research||[])){if(f.origin!=='profile'||!/^row \d+$/.test(f.metric||''))continue;s.attempts++;if(f.reassembled)reassembledRows++;const primary=sourceMarkets.nhl[norm(r.market)]??norm(r.market);
  let markets=[undefined];
  if(expandCurrentNhlLogs&&r.sport==='nhl')markets.push(...Object.keys(nhlMetrics).filter(m=>m!=='sog'&&nhlMetrics[m]!==nhlMetrics[primary]));
  if(expandCurrentNbaLogs&&r.sport==='nba'){
   const header=new Set(String(f.scope||'').split(' | ').map(norm)),base=nbaMetrics[norm(r.market)];
   if((header.has('date')||header.has('game date'))&&(header.has('opp')||header.has('opponent')))
    markets.push(...nbaLogMarkets.filter(([metric,m])=>metric!==base&&
     [m,norm(metric),...(columnAliases[metric]||[]),...(currentNbaHeaders[metric]||[])].some(x=>header.has(x))).map(([,m])=>m),
      ...Object.entries(extraMetrics).filter(([market,[,label]])=>market!==norm(r.market)&&header.has(label)).map(([market])=>market));
  }
  if(expandCurrentNflLogs&&r.sport==='nfl'){
   const header=new Set(String(f.scope||'').split(' | ').map(norm)),base=nflMetrics[sourceMarkets.nfl[norm(r.market)]??norm(r.market)];
   if((header.has('date')||header.has('game date'))&&(header.has('opp')||header.has('opponent')))
    markets.push(...Object.entries(nflMetrics).filter(([m,metric])=>metric!==base&&
     [m,norm(metric),...(columnAliases[metric]||[]),...(currentNflHeaders[metric]||[])].some(x=>header.has(x))).map(([m])=>m));
  }
  for(const logMarket of markets){const x=matchRow(r,f,index,clock,{logMarket,allowObservedNhlHeaders:expandCurrentNhlLogs,allowCurrentNbaHeaders:expandCurrentNbaLogs,allowCurrentNflHeaders:expandCurrentNflLogs});if(!x.candidate){if(logMarket)continue;s.reasons[x.reason]=(s.reasons[x.reason]||0)+1;if(x.reason==='row_column_count_mismatch'){const h=s.rowColumnCounts??={};const k=Object.hasOwn(h,x.shape)||Object.keys(h).length<40?x.shape:'other';h[k]=(h[k]||0)+1;}if(x.reason==='missing_exact_columns'){const shape=columnShape(f);const h=s.columnShapes??={};const k=Object.hasOwn(h,shape)||Object.keys(h).length<40?shape:'other_shapes';h[k]=(h[k]||0)+1;}continue;}s.candidates++;candidates++;
   const c=x.candidate,k=sha(key([r.sport,r.detailId,r.market,c.playerId,c.eventId,c.market,c.value,f.filterSelection??null,f.tab,f.scope]));
   const next={...c,profileDigest:digest,profileAvailableAt:first??null,sourceDetailId:r.detailId,sourcePlayer:r.player,cacheKey:k},old=rows.get(k);
   // Archive filenames are content hashes, not chronology. For an identical
   // research fact retain the earliest valid committed evidence, not whichever
   // hash sorts first. Invalid clocks cannot displace a valid observation.
   const available=x=>hash(x.nativeDigest)&&hash(x.profileDigest)&&Number.isFinite(dt(x.nativeAvailableAt))&&Number.isFinite(dt(x.profileAvailableAt))&&Number.isFinite(dt(x.profileObservedAt))&&dt(x.profileObservedAt)<=dt(x.profileAvailableAt)+999&&Math.max(dt(x.nativeAvailableAt),dt(x.profileAvailableAt))<=dt(clock)?Math.max(dt(x.nativeAvailableAt),dt(x.profileAvailableAt)):Infinity;
   if(!old||available(next)<available(old))rows.set(k,next);}}
 }
 const cached=candidateCache(rows,clock),identities=identityEvidence(rows,clock),reviewed=reviewedHistory(rows,identities.reviewCandidates,reviews,clock);
 return {rows,cache:cached.index,identityCandidates:identities.reviewCandidates,reviewedCache:reviewed.index,summary:{kind:'pickfinder_native_history_candidate_reconciliation_v1',bySport,nativeCoverage:index.nativeCoverage??{},identityEvidence:identities.summary,reviewedHistory:reviewed.summary,reassembledRows,reusableResearchCandidates:cached.index.size,researchCacheConflicts:cached.conflicts,candidates,distinctCandidates:rows.size,conflictingNativeGames:index.conflicts,independentlyReviewedProviderIdentities:reviewed.summary.reviewedProfiles,qualifiedCacheEntries:reviewed.index.size,qualifiedModelInputs:0,paidRequests:0,requestsSkipped:0,modelApproved:false}};
}
function indexFromArchive(root,clock){return nativeIndex({facts:receipts(root,nativeRoot+'native-facts','independent_public_sport_identity_facts_v1',clock),nhlFinals:receipts(root,nativeRoot+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',clock),nflSeasons:receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock),nbaHistories:require('./pickfinder-public-model-validation.cjs').history(root,'nba-history'),nbaFinalHistories:require('./pickfinder-public-model-validation.cjs').history(root,'nba-final-history'),nbaFinalStatDetails:require('./pickfinder-public-model-validation.cjs').history(root,'nba-final-stat-details')},clock);}
function fromArchive(root,documents,clock,index=indexFromArchive(root,clock),options){return audit(documents,index,clock,receipts(root,nativeRoot+'historical-reviewed-identities','pickfinder_historical_reviewed_identity_v1',clock),options);}
module.exports={nativeIndex,indexFromArchive,matchRow,audit,fromArchive,structuredFields,columnShape,candidateCache,lookupCandidate,identityEvidence,profilePath,reviewedHistory,historyForModel};
