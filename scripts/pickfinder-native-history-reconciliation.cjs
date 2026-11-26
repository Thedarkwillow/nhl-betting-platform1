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
const nflMetrics={'passing yards':'passing_yards','rushing yards':'rushing_yards','receiving yards':'receiving_yards','receptions':'receptions','passing touchdowns':'passing_tds','rushing touchdowns':'rushing_tds','receiving touchdowns':'receiving_tds','passing attempts':'attempts','passing completions':'completions','receiving targets':'targets'};
const dateFormats=['UTC','America/New_York','America/Los_Angeles'].map(timeZone=>new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}));
function dates(t){const d=new Date(t);if(!Number.isFinite(+d))return [];return [...new Set(dateFormats.map(f=>f.format(d)))];}
function nativeIndex({facts,nhlFinals,nflSeasons},clock){
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
 const byPlayer=new Map();for(const [k,g] of games)if(!conflicts.has(k)){const p=key([g.sport,g.id]),a=byPlayer.get(p)||[];a.push({...g,dates:dates(g.start)});byPlayer.set(p,a);}
 return {names,byPlayer,conflicts:conflicts.size};
}
function matchRow(r,f,index,clock){
 const reject=reason=>({reason});
 if(!['nhl','nfl'].includes(r.sport))return reject('native_adapter_unavailable');
 if(r.status!=='sampled'||r.truncated!==false||r.coverageVersion!==VERSION||f.origin!=='profile'||!/^row \d+$/.test(f.metric||'')||r.period||r.mapRange||r.gameMode||f.period||f.mapRange||f.gameMode)return reject('unsupported_scope');
 if(!/game\s*log|historical stats|player stats/i.test(f.tab||''))return reject('not_game_log');
 if(!Number.isFinite(dt(f.observedAt))||dt(f.observedAt)>dt(clock))return reject('observation_clock');
 const metrics=r.sport==='nhl'?nhlMetrics:nflMetrics,m=metrics[norm(r.market)];if(!m)return reject('unsupported_market');
 const headers=String(f.scope||'').split(' | ').map(norm),i=headers.indexOf('date'),j=headers.indexOf('opponent');
 const aliases=new Set([norm(r.market),norm(m),...(m==='sog'?['sog','shots']:[])]);
 const indices=headers.map((x,i)=>aliases.has(x)?i:-1).filter(i=>i>=0);
 if(i<0||j<0||indices.length!==1||new Set(headers).size!==headers.length)return reject('missing_exact_columns');
 let cells;try{cells=JSON.parse(f.value)}catch{return reject('row_json');}
 if(!Array.isArray(cells)||cells.length!==headers.length||cells.some(c=>typeof c?.value!=='string'))return reject('row_shape');
 const raw=cells[i].value.trim(),date=fullDate(raw),md=raw.match(/^(\d{1,2})\/(\d{1,2})$/);
 if(!date&&!md)return reject('date_shape');
 const suffix=md?'-'+md[1].padStart(2,'0')+'-'+md[2].padStart(2,'0'):null;
 if(suffix&&!day('2000'+suffix))return reject('date_shape');
 const opp=cells[j].value.trim().replace(/^(?:vs\.?|@)\s*/i,''),v=cells[indices[0]].value.trim();
 if(!/^[A-Z]{2,4}$/.test(opp)||!/^[-]?\d+(?:\.\d+)?$/.test(v))return reject('stat_or_opponent_shape');
 const ids=index.names.get(key([r.sport,norm(r.player)]));if(ids?.size!==1)return reject('native_identity_ambiguous');
 const id=[...ids][0],matches=(index.byPlayer.get(key([r.sport,id]))||[]).filter(g=>dt(g.start)<dt(f.observedAt)&&g.opp===opp&&g.dates.some(d=>date?d===date:d.endsWith(suffix)));
 if(matches.length!==1)return reject(matches.length?'ambiguous_native_game':'no_matching_native_game');
 const g=matches[0];if(!Number.isFinite(g.stats[m])||g.stats[m]!==Number(v))return reject('native_result_mismatch');return {candidate:{sport:r.sport,playerId:id,eventId:g.event,officialStartAt:g.start,market:m,value:Number(v),nativeDigest:g.digest,nativeAvailableAt:g.first,profileObservedAt:f.observedAt,sourceDate:raw,sourceDateYearRecovered:!date,providerIdentityReviewed:false,modelApproved:false}};
}
function audit(documents,index,clock){
 const rows=new Map(),bySport={};let candidates=0;
 for(const {doc,digest} of documents)for(const r of doc.records||[]){if(!['nhl','nfl','nba','cs2','valorant','dota2','lol','cod'].includes(r.sport))continue;
  const s=bySport[r.sport]??={attempts:0,candidates:0,reasons:{}};
  for(const f of r.research||[]){if(f.origin!=='profile'||!/^row \d+$/.test(f.metric||''))continue;s.attempts++;const x=matchRow(r,f,index,clock);if(!x.candidate){s.reasons[x.reason]=(s.reasons[x.reason]||0)+1;continue;}s.candidates++;candidates++;
   const c=x.candidate,k=sha(key([r.sport,r.detailId,r.market,c.playerId,c.eventId,c.market,c.value,f.filterSelection??null,f.tab,f.scope]));
   if(!rows.has(k))rows.set(k,{...c,profileDigest:digest,cacheKey:k});}
 }
 return {rows,summary:{kind:'pickfinder_native_history_candidate_reconciliation_v1',bySport,candidates,distinctCandidates:rows.size,conflictingNativeGames:index.conflicts,independentlyReviewedProviderIdentities:0,qualifiedCacheEntries:0,qualifiedModelInputs:0,paidRequests:0,requestsSkipped:0,modelApproved:false}};
}
function fromArchive(root,documents,clock){return audit(documents,nativeIndex({facts:receipts(root,nativeRoot+'native-facts','independent_public_sport_identity_facts_v1',clock),nhlFinals:receipts(root,nativeRoot+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',clock),nflSeasons:receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock)},clock),clock);}
module.exports={nativeIndex,matchRow,audit,fromArchive};
