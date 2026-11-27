'use strict';
// Owner-channel research alerts from already committed public sporting archives.
const {createHash}=require('node:crypto');
const {walkBoards}=require('./pickfinder-public-evidence-audit.cjs');
const {stableDetail}=require('./pickfinder-local-line-alerts.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dt=Date.parse, M=60000, fresh=25*M, previous=12*60*M;
const isDigest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sports=new Set(['nba','nhl','nfl','cs2','valorant','dota2','lol','cod','mlb','wnba','college-basketball','college-football','tennis','soccer']);
const books=new Set(['prizepicks','underdog']);
const tiers=new Set(['standard','goblin','demon','alternate']);
const names={line_change:'Line change',price_change:'Price change',new_prop:'🆕 NEW PROP',removed_prop:'Not seen on latest board',alternate_tier:'🆕 NEW PROP (alternate tier)',reposted_prop:'Reposted prop',discrepancy:'Cross-platform discrepancy',suggestion:'Qualified prop research',collection_status:'Collection status',research_update:'Research update',availability_update:'Official availability update'};
const plain=s=>String(s).replace(/[^\p{L}\p{M}\p{N} .,'()+/&-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,70);
function acceptable(b,now){
 const t=dt(b.m.lastObservedAt), git=dt(b.first);
 return sports.has(b.m.sport)&&books.has(b.m.book)&&Number.isFinite(t)&&t<=now&&Number.isFinite(git)&&git<=now&&t<=git+999&&now-t<=previous+480*M;
}
function complete(b){
 const m=b.m;
 return m.authenticated===true&&m.health?.wrongSport===0&&m.health?.priceConflictKeys===0&&(
  m.boardState==='populated'&&m.pageTraversalComplete===true&&m.lastPageReached===true||
  m.boardState==='empty'&&m.explicitEmpty===true&&m.health?.pages===0&&b.offers.length===0);
}
// A walked but shifting paginated board can still prove individual positive
// observations. It cannot prove that a missing line was absent.
function absenceCoverage(b){
 const m=b.m,h=m.health;
 return complete(b)&&(m.boardState==='empty'||h.repeatOrUnresolvedLinks===0&&
  Array.isArray(h.reasons)&&!h.reasons.includes('possible_display_cap_requires_partition_reconciliation'));
}
function slot(b,now){
 const map=new Map();
 for(const o of b.offers){
  const t=dt(o.observedAt),tier=o.tier||'standard',id=stableDetail(o.detailId);
  if(o.sport!==b.m.sport||o.book!==b.m.book||!id||!o.eventId||!o.market||!o.player||
   !tiers.has(tier)||!['Higher','Lower'].includes(o.side)||!Number.isFinite(o.line)||
   typeof o.displayedPrice!=='string'||!/^[-+]\d{2,4}$/.test(o.displayedPrice)||
   !Number.isFinite(t)||t<dt(b.m.firstObservedAt)||t>dt(b.m.lastObservedAt)||
   o.startAt&&(!Number.isFinite(dt(o.startAt))||dt(o.startAt)<=now))continue;
  const scope=JSON.stringify([o.sport,o.eventId,id,o.player,o.market,o.period??null,o.mapRange??null,o.gameMode??null,tier,o.side]);
  const g=map.get(scope)||new Map();
  const existing=g.get(o.line);
  // Conflicting duplicates mark the entire scope unusable for this comparison.
  g.set(o.line,existing===undefined?{...o,tier}:null);map.set(scope,g);
 }
 const blocked=new Set();
 for(const [scope,rows] of map)if([...rows.values()].some(row=>!row)){
  blocked.add(scope);map.delete(scope);
 }
 return {rows:map,blocked};
}
function event(kind,scope,a,b,line){
 const o=b||a;
 const observedAt=b&&a&&dt(a.observedAt)>dt(b.observedAt)?a.observedAt:o.observedAt;
 return {id:hash([kind==='price_change'?'line_change':kind,scope,a?.book,a?.line,b?.book,b?.line,line]),kind,sport:o.sport,tier:o.tier,books:[...new Set([a?.book,b?.book].filter(Boolean))],observedAt,
  text:[o.sport.toUpperCase(),plain(o.player),plain(o.market),[o.period,o.mapRange,o.gameMode].filter(Boolean).map(plain).join(' / '),plain(o.tier),o.side].filter(Boolean).join(' · ')+' — '+line};
}
// Group only the exact same book, player path, event, market, tier, threshold
// and split. Explicit unpriced rows prove a line was shown, never a direction.
function observedLines(b,now,{retainStarted=false}={}){
 const out=new Map();
 for(const o of [...b.offers,...(b.unpricedTierObservations||[])]){
  const at=dt(o.observedAt),tier=o.tier||'standard',id=stableDetail(o.detailId);
  if(o.book!==b.m.book||o.sport!==b.m.sport||!o.eventId||!o.player||!o.market||!id||
   !tiers.has(tier)||!Number.isFinite(o.line)||!Number.isFinite(at)||at<dt(b.m.firstObservedAt)||at>dt(b.m.lastObservedAt)||
   o.startAt&&(!Number.isFinite(dt(o.startAt))||!retainStarted&&dt(o.startAt)<=now))continue;
  const [path]=JSON.parse(id),scope=JSON.stringify([o.book,o.sport,o.eventId,path,o.player,o.market,o.period??null,o.mapRange??null,o.gameMode??null,tier]);
  const key=JSON.stringify([scope,o.line]),g=out.get(key)||{scope,key,path,row:{...o,tier},sides:new Set(),observedAt:o.observedAt};
  if(['Higher','Lower'].includes(o.side))g.sides.add(o.side);
  if(at<dt(g.observedAt))g.observedAt=o.observedAt;
  out.set(key,g);
 }
 return out;
}
function contextIndex(doc,now){
 const events=new Map(),pairs=new Map();
 if(doc?.kind!=='pickfinder_current_identity_registry_v1'||doc.modelApproved!==false||doc.paidRequests!==0||!(dt(doc.generatedAt)<=now))return {events,pairs};
 const key=(...a)=>JSON.stringify(a),proof=r=>isDigest(r.nativeReceiptDigest??r.receiptDigest)&&
  r.timezoneReceiptDigests?.length===3&&new Set(r.timezoneReceiptDigests).size===3&&r.timezoneReceiptDigests.every(isDigest)&&
  dt(r.proofAvailableAt)<=now&&Number.isFinite(dt(r.startAt));
 const set=(m,k,v)=>{if(!m.has(k))m.set(k,v);else if(JSON.stringify(m.get(k))!==JSON.stringify(v))m.set(k,null);};
 for(const r of doc.eventRegistry||[])if(proof(r))set(events,key(r.sport,r.sourceEventId),r.startAt);
 for(const r of doc.rows||[])if(r.match&&proof(r.match)&&r.match.team&&r.match.opponent)
  set(pairs,key(r.sport,r.sourceEventId,r.sourcePlayerPath),[r.match.team,r.match.opponent]);
 return {events,pairs};
}
// A price-free alternate tile can prove that exact line was on the
// PickFinder board. It cannot prove a direction, price, or original-app
// offer. Only admit this alternate baseline when every distinct rendered
// card is accounted for and the page traversal had no repeated cards.
const unresolvedKeys=['legacyNoEvidence','bookBadgeMissing','tierWithoutExplicitPrice',
 'bookBadgeWithoutExplicitPrice','ambiguousBookGroup','lineMissing'];
function exactMembership(b){
 if(!complete(b)||b.m.boardState!=='populated')return false;
 const h=b.m.health,e=h.unresolvedEvidence,unpriced=b.unpricedTierObservations;
 if(!e||Object.keys(e).length!==unresolvedKeys.length||
    !unresolvedKeys.every(k=>Object.hasOwn(e,k)&&e[k]===(k==='tierWithoutExplicitPrice'?h.unresolvedRows:0))||
    !Number.isSafeInteger(h.unresolvedRows)||h.unresolvedRows<0||
    h.repeatOrUnresolvedLinks!==0||!Number.isSafeInteger(h.appearances)||h.appearances<=0||
    h.appearances!==h.distinctDetailLinks||
    !Array.isArray(h.reasons)||h.reasons.includes('possible_display_cap_requires_partition_reconciliation')||
    !Array.isArray(unpriced)||h.unpricedTierObservations!==unpriced.length||unpriced.length!==h.unresolvedRows||
    b.offers.length!==h.distinctOfferKeys)return false;
 const links=new Map(),tileKeys=new Set();
 for(const [rows,kind] of [[b.offers,'priced'],[unpriced,'unpriced']])for(const o of rows){
  const t=dt(o.observedAt),tier=o.tier||'standard';
  if(o.book!==b.m.book||o.sport!==b.m.sport||!tiers.has(tier)||
     typeof o.player!=='string'||!o.player.trim()||typeof o.eventId!=='string'||!o.eventId||
     typeof o.market!=='string'||!o.market||!Number.isFinite(o.line)||!Number.isFinite(t)||
     t<dt(b.m.firstObservedAt)||t>dt(b.m.lastObservedAt)||
     o.startAt&&!Number.isFinite(dt(o.startAt)))return false;
  if(kind==='unpriced'&&(!['goblin','demon'].includes(tier)||o.side!==null||o.displayedPrice!==null||
     o.originalPlatformVerified!==false||o.eligibleForLockedModel!==false))return false;
  if(kind==='priced'&&(!['Higher','Lower'].includes(o.side)||!/^[-+]\d{2,4}$/.test(o.displayedPrice||'')))return false;
  let u;try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{return false;}
  const p=u.searchParams.getAll('prop'),parts=p.length===1?p[0].split(':'):[];
  if(u.origin!=='https://www.pickfinder.app'||!new RegExp('^/players/'+b.m.sport+'/[\\w-]+$').test(u.pathname)||
     parts.length!==4||!parts[0]||parts[1]!==o.market||parts[2]!==o.eventId||
     !/^-?\d+(?:\.\d+)?$/.test(parts[3])||Number(parts[3])!==o.line)return false;
  const tile=JSON.stringify([u.pathname,p[0]]);
  const witness=JSON.stringify([kind,o.player,o.period??null,o.mapRange??null,o.gameMode??null,tier]);
  if(links.has(o.detailId)&&links.get(o.detailId)!==witness)return false;
  if(kind==='unpriced'&&tileKeys.has(tile))return false;
  links.set(o.detailId,witness);
  tileKeys.add(tile);
 }
 return links.size===h.distinctDetailLinks&&tileKeys.size===links.size;
}
function releaseBaseline(b,old,now,windowMs,membership){
 if(!old)return 'missing_prior_board';
 if(!complete(b)||!complete(old))return 'incomplete_board';
 if(!absenceCoverage(b)||!absenceCoverage(old))return 'unproven_page_membership';
 if(old.m.health.unresolvedRows!==0&&!(membership(old)&&membership(b)))return 'prior_unresolved_rows';
 if(dt(old.m.lastObservedAt)>=dt(b.m.firstObservedAt))return 'overlapping_observations';
 if(now-dt(b.m.lastObservedAt)>windowMs)return 'outside_release_window';
 if(dt(b.m.lastObservedAt)-dt(old.m.lastObservedAt)>previous)return 'prior_board_too_old';
 return 'eligible';
}
function additions(history,now,context,windowMs,membership){
 const result=[],seen=new Set();
 for(let i=0;i<history.length-1;i++){
  const b=history[i],old=history[i+1];
  if(releaseBaseline(b,old,now,windowMs,membership)!=='eligible')continue;
  // No inference of absence across a partial partition or a missing baseline.
  const current=observedLines(b,now),prior=observedLines(old,now,{retainStarted:true});
  const replacement=new Map(),sizes=new Map();
  for(const g of current.values())sizes.set(g.scope,(sizes.get(g.scope)||0)+1);
  for(const g of prior.values())if(!current.has(g.key))replacement.set(g.scope,(replacement.get(g.scope)||0)+1);
  const previousSc=new Set([...prior.values()].map(g=>g.scope));
  const oldEvents=new Set([...prior.values()].map(g=>g.row.eventId));
  const oldPlayers=new Set([...prior.values()].map(g=>JSON.stringify([g.row.eventId,g.path])));
  const earlier=history[i+2],reposts=earlier&&complete(earlier)&&dt(earlier.m.lastObservedAt)<dt(old.m.firstObservedAt)?observedLines(earlier,now,{retainStarted:true}):new Map();
  const newer=i>0&&absenceCoverage(history[0])&&history[0].m.health.unresolvedRows===0?observedLines(history[0],now):null;
  for(const g of current.values()){
   if(prior.has(g.key)||seen.has(g.key)||newer&&!newer.has(g.key))continue;
   // Single-threshold replacements continue to be line changes, not releases.
   if(replacement.get(g.scope)===1&&sizes.get(g.scope)===1&&previousSc.has(g.scope))continue;
   const o=g.row,kind=reposts.has(g.key)?'reposted_prop':o.tier==='standard'?'new_prop':'alternate_tier';
   const reason=kind==='reposted_prop'?'Reposted':!oldEvents.has(o.eventId)?'New game':!oldPlayers.has(JSON.stringify([o.eventId,g.path]))?'New player prop':!previousSc.has(g.scope)?'New market or tier':'New threshold';
   const sides=['Higher','Lower'].filter(s=>g.sides.has(s));
   const start=context.events.get(JSON.stringify([o.sport,o.eventId]));
   const pair=context.pairs.get(JSON.stringify([o.sport,o.eventId,g.path]));
   const book=o.book==='prizepicks'?'PrizePicks':'Underdog';
   if(start&&dt(start)<=now)continue;
   const text=[o.sport.toUpperCase(),plain(o.player),plain(o.market.replace(/^player_/,'').replace(/_/g,' '))+' '+o.line,book,plain(o.tier),
    sides.length?sides.join(' / '):'sides unverified',pair?pair.map(plain).join(' vs '):'team/opponent unverified',
    [o.period,o.mapRange,o.gameMode].filter(Boolean).map(plain).join(' / '),reason,
    start?'starts '+new Date(dt(start)).toISOString().slice(0,16).replace('T',' ')+' UTC':null].filter(Boolean).join(' · ');
   result.push({id:hash(['new_prop_v2',g.key,old.digest]),kind,sport:o.sport,tier:o.tier,books:[o.book],observedAt:g.observedAt,
    text,availableDirections:sides,gameStartVerified:!!start,
    priorIds:sides.map(side=>event(o.tier==='standard'?'new_prop':'alternate_tier',
     JSON.stringify([JSON.stringify([o.sport,o.eventId,stableDetail(o.detailId),o.player,o.market,o.period??null,o.mapRange??null,o.gameMode??null,o.tier,side]),old.digest,b.digest]),null,{...o,side},o.book+' '+o.line).id)});
   seen.add(g.key);
  }
 }
 return result;
}
function compare(chunks,now,{registry,windowMs=240*M}={}){
 const partitions=new Map(), invalid={count:0};
 for(const {entry:b} of chunks){
  if(!b){invalid.count++;continue;}
  if(!acceptable(b,now)||b.m.samplingPurpose==='displayed_game_clock')continue;
  const k=b.m.sport+'/'+b.m.book,a=partitions.get(k)||[];
  a.push(b);a.sort((x,y)=>dt(y.m.lastObservedAt)-dt(x.m.lastObservedAt)||x.digest.localeCompare(y.digest));partitions.set(k,a);
 }
 if(invalid.count)throw Error('archive integrity');
 const witnesses=new WeakMap();
 const membership=b=>{if(!witnesses.has(b))witnesses.set(b,exactMembership(b));return witnesses.get(b);};
 const events=[],usable=new Map(),context=contextIndex(registry,now),releaseBaselines={};
 for(const [partition,history] of partitions){
  const counts={};
  for(let i=0;i<history.length;i++){
   const state=releaseBaseline(history[i],history[i+1],now,windowMs,membership);
   counts[state]=(counts[state]||0)+1;
  }
  const newEvents=additions(history,now,context,windowMs,membership);
  releaseBaselines[partition]={latest:releaseBaseline(history[0],history[1],now,windowMs,membership),counts,releaseCandidates:newEvents.length};
  events.push(...newEvents);
 }
 for(const [key,[current,old]] of partitions){
  if(!complete(current)||now-dt(current.m.lastObservedAt)>fresh||old&&dt(old.m.lastObservedAt)===dt(current.m.lastObservedAt))continue;
  const latest=slot(current,now),{rows}=latest;
  usable.set(key,{current,old,...latest});
  if(!old||!complete(old)||dt(old.m.lastObservedAt)>=dt(current.m.lastObservedAt)||now-dt(old.m.lastObservedAt)>previous)continue;
  const prior=slot(old,now),before=old.digest,after=current.digest;
  const keyDate=k=>JSON.stringify([k,before,after]);
  for(const [k,range] of rows){
   if(prior.blocked.has(k))continue;
   const p=prior.rows.get(k);
   if(range.size===1&&p?.size===1){
    const a=[...p.values()][0],b=[...range.values()][0];
    if(a.line!==b.line)events.push(event('line_change',keyDate(k),a,b,b.book+' '+a.line+' → '+b.line));
    else if(a.displayedPrice!==b.displayedPrice)events.push(event('price_change',keyDate(k),a,b,b.book+' '+b.line+' (price '+a.displayedPrice+' → '+b.displayedPrice+')'));
    continue;
   }

  }
  // Incomplete row interpretation cannot certify absence. Require an actual future start.
  if(absenceCoverage(current)&&current.m.health.unresolvedRows===0)for(const [k,range] of prior.rows){
   if(latest.blocked.has(k))continue;
   const n=rows.get(k);
   if(range.size===1&&n?.size===1)continue;
   for(const [v,a] of range)if(!n?.has(v)&&dt(a.startAt)>now)events.push({...event('removed_prop',keyDate(k),a,null,a.book+' '+v),observedAt:current.m.lastObservedAt});
  }
 }
 function uniqueMatch(sets,k){const x=sets?.get(k);return x?.size===1?[...x.values()][0]:null;}
 for(const sport of sports){
  const p=usable.get(sport+'/prizepicks'),u=usable.get(sport+'/underdog');
  if(!p||!u||Math.abs(dt(p.current.m.lastObservedAt)-dt(u.current.m.lastObservedAt))>15*M)continue;
  const p0=p.old&&complete(p.old)?slot(p.old,now):null,u0=u.old&&complete(u.old)?slot(u.old,now):null;
  for(const [k] of p.rows){
   const a=uniqueMatch(p.rows,k),b=uniqueMatch(u.rows,k);
   if(!a||!b||a.line===b.line||Math.abs(dt(a.observedAt)-dt(b.observedAt))>15*M)continue;
   if(p0?.blocked.has(k)||u0?.blocked.has(k))continue;
   const x=uniqueMatch(p0?.rows,k),y=uniqueMatch(u0?.rows,k);
   if(x?.line===a.line&&y?.line===b.line&&Math.abs(dt(x.observedAt)-dt(y.observedAt))<=15*M)continue;
   events.push(event('discrepancy',k,a,b,'PrizePicks '+a.line+' vs Underdog '+b.line));
  }
 }
 return {events,usablePartitions:usable.size,releaseBaselines};
}
function research(doc,now){
 if(doc?.kind!=='pickfinder_nhlnfl_reviewed_history_performance_v1'||doc.retrospective!==false||
  doc.modelApproved!==false||doc.paidRequests!==0||!(dt(doc.generatedAt)<=now&&now-dt(doc.generatedAt)<=180*M))return [];
 const f=doc.pregameCommitted,g=doc.independentCommittedGrades;
 if(!Number.isSafeInteger(f)||f<0||!Number.isSafeInteger(g)||g<0||f<g||!f)return [];
 return [{id:hash(['research_update',f,g]),kind:'research_update',text:'NHL / NFL research ledger · '+f+' pregame forecasts frozen · '+g+' independently graded'}];
}
function nbaResearch(doc,now){
 const x=doc?.rollingProbabilityPerformance;
 if(doc?.schema!=='pickfinder_public_research_health_v1'||doc.paidRequests!==0||doc.modelApproved!==false||
  doc.privateRepoUsed!==false||!(dt(doc.generatedAt)<=now&&now-dt(doc.generatedAt)<=180*M)||
  x?.kind!=='rolling_original_probability_performance_v1'||x.researchOnly!==true||x.modelPromoted!==false||
  !Number.isSafeInteger(x.decided)||!Number.isSafeInteger(x.pushes)||!Number.isSafeInteger(x.registered)||
  x.decided<0||x.pushes<0||x.decided+x.pushes>x.registered||!x.registered)return [];
 return [{id:hash(['nba_research_update',x.registered,x.decided,x.pushes]),kind:'research_update',sport:'nba',
  text:'NBA original archive · '+x.registered+' pregame forecasts · '+x.decided+' independently graded decisions · '+x.pushes+' pushes'}];
}
function availability(receipts,now){
 const statusSet=new Set(['out','doubtful','questionable','probable','available','game-time decision']);
 const {reportClock}=require('./run-nba-private-research-v1.cjs');
 const recent=receipts.filter(({doc:d,first,digest})=>d?.kind==='nba_public_official_pregame_availability_v1'&&d.modelApproved===false&&d.positiveParticipationVerified===false&&
  /^[a-f0-9]{64}$/.test(digest||'')&&/^[a-f0-9]{64}$/.test(d.sourceResponseSha256||'')&&
  /^https:\/\/(?:ak-static\.cms\.nba\.com|official\.nba\.com)\/referee\/injury\/Injury-Report_[0-9_AMPM-]+\.pdf$/.test(d.sourceDocumentUrl||'')&&
  dt(reportClock(d.sourceDocumentUrl))===dt(d.reportPublishedAt)&&dt(d.reportPublishedAt)<=dt(d.capturedAt)&&dt(d.capturedAt)<=now&&dt(d.capturedAt)<=dt(first)+999&&dt(first)<=now&&now-dt(d.reportPublishedAt)<=180*M&&Array.isArray(d.rows)&&Array.isArray(d.scopes));
 if(!recent.length)return [];
 const latest=Math.max(...recent.map(x=>dt(x.doc.reportPublishedAt))),same=recent.filter(x=>dt(x.doc.reportPublishedAt)===latest);
 if(new Set(same.map(x=>x.doc.sourceResponseSha256)).size!==1)return [];
 const counts={},rows=new Map(),conflicts=new Set(),notSubmitted=new Set(same.flatMap(({doc})=>(doc.notSubmitted||[]).map(r=>JSON.stringify([r.date,r.match,r.team]))));
 for(const {doc} of same)for(const r of doc.rows){
  if(!r?.player||!r.team||!statusSet.has(r.status)||!doc.scopes.includes(JSON.stringify([r.date,r.match]))||notSubmitted.has(JSON.stringify([r.date,r.match,r.team])))continue;
  const k=JSON.stringify([r.date,r.match,r.team,r.player]);if(rows.has(k)&&rows.get(k)!==r.status)conflicts.add(k);rows.set(k,r.status);
 }
 for(const [k,s] of rows)if(!conflicts.has(k))counts[s]=(counts[s]||0)+1;
 const summary=[...statusSet].filter(s=>counts[s]).map(s=>counts[s]+' '+s).join(', ');
 if(!summary)return [];
 const observedAt=new Date(latest).toISOString();
 return [{id:hash(['nba_official_availability',same[0].doc.sourceResponseSha256]),kind:'availability_update',sport:'nba',observedAt,
  text:'NBA official injury report · '+summary+' · statuses are not confirmed participation'}];
}
function collectionStatus(doc,now){
 const generated=dt(doc?.generatedAt);
 if(doc?.kind!=='public_pickfinder_activity_readiness_v1'||!Array.isArray(doc.events)||
  !(generated<=now&&now-generated<=60*M)||!Number.isSafeInteger(doc.archiveInvalid)||doc.archiveInvalid<0)return [];
 const latest=new Map();
 for(const e of doc.events){
  const observed=dt(e.observedAt),archived=dt(e.archivedAt);
  if(e.kind!=='board_observation'||!sports.has(e.sport)||!books.has(e.book)||!isDigest(e.manifestDigest)||
   !['populated','empty','disabled','failed'].includes(e.state)||!(observed<=archived+999&&archived<=generated&&now-observed<=60*M))continue;
  const k=e.sport+'/'+e.book;
  if(!latest.has(k)||observed>dt(latest.get(k).observedAt))latest.set(k,e);
 }
 if(!latest.size)return [];
 const counts={populated:0,empty:0,disabled:0,failed:0};
 for(const e of latest.values())counts[e.state]++;
 const block=Math.floor(generated/(60*M));
 return [{id:hash(['collection_status_hourly',block]),kind:'collection_status',observedAt:doc.generatedAt,
  text:'PickFinder boards archived in the past hour · '+Object.entries(counts).map(([k,n])=>n+' '+k).join(' · ')+' · '+doc.archiveInvalid+' invalid archives in report'}];
}
function build(root,now,doc,nbaDoc,receipts=[],options){
 const r=compare(walkBoards(root),now,options);
 return {...r,events:[...new Map([...availability(receipts,now),...research(doc,now),...nbaResearch(nbaDoc,now),...r.events].map(e=>[e.id,e])).values()]};
}
function message(events){
 if(events.length<1||events.length>6||(events.some(e=>e.kind==='suggestion')&&events.length>3)||events.some(e=>!Object.hasOwn(names,e.kind)))throw Error('alert batch');
 const lines=events.map(e=>{
  const prefix='• '+names[e.kind]+' — ';
  const suffix=Number.isFinite(dt(e.observedAt))?' · '+new Date(dt(e.observedAt)).toISOString().slice(0,16).replace('T',' ')+' UTC':'';
  const max=(e.kind==='suggestion'?600:300)-prefix.length-suffix.length;
  const detail=e.text.length<=max?e.text:e.text.slice(0,max-1).replace(/[\uD800-\uDBFF]$/u,'')+'…';
  return prefix+detail+suffix;
 });
 return {content:['**Platform research alerts**',...lines,
  'Observed research only. Check the original app. No wagers or recommendations.'].join('\n'),
  flags:4,allowed_mentions:{parse:[]}};
}
module.exports={compare,research,nbaResearch,availability,build,message,collectionStatus,sports,books,tiers,names};
