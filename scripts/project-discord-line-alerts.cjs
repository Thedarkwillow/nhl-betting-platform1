'use strict';
// Owner-channel research alerts from already committed public sporting archives.
const {createHash}=require('node:crypto');
const {walkBoards}=require('./pickfinder-public-evidence-audit.cjs');
const {stableDetail}=require('./pickfinder-local-line-alerts.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dt=Date.parse, M=60000, fresh=25*M, previous=12*60*M;
const sports=new Set(['nba','nhl','nfl','cs2','valorant','dota2','lol','cod','mlb','wnba','college-basketball','college-football','tennis','soccer']);
const books=new Set(['prizepicks','underdog']);
const tiers=new Set(['standard','goblin','demon','alternate']);
const names={line_change:'Line change',price_change:'Price change',new_prop:'Newly observed prop',removed_prop:'Not seen on latest board',alternate_tier:'Alternate tier',discrepancy:'Cross-platform discrepancy',research_update:'Research update',availability_update:'Official availability update'};
const plain=s=>String(s).replace(/[^\p{L}\p{M}\p{N} .,'()+/&-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,70);
function acceptable(b,now){
 const t=dt(b.m.lastObservedAt), git=dt(b.first);
 return sports.has(b.m.sport)&&books.has(b.m.book)&&Number.isFinite(t)&&t<=now&&Number.isFinite(git)&&git<=now&&t<=git+999&&now-t<=previous;
}
function complete(b){
 const m=b.m;
 return m.authenticated===true&&m.health?.wrongSport===0&&m.health?.priceConflictKeys===0&&(
  m.boardState==='populated'&&m.pageTraversalComplete===true&&m.lastPageReached===true||
  m.boardState==='empty'&&m.explicitEmpty===true&&m.health?.pages===0&&b.offers.length===0);
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
function compare(chunks,now){
 const partitions=new Map(), invalid={count:0};
 for(const {entry:b} of chunks){
  if(!b){invalid.count++;continue;}
  if(!acceptable(b,now))continue;
  const k=b.m.sport+'/'+b.m.book,a=partitions.get(k)||[];
  a.push(b);a.sort((x,y)=>dt(y.m.lastObservedAt)-dt(x.m.lastObservedAt)||x.digest.localeCompare(y.digest));partitions.set(k,a.slice(0,2));
 }
 if(invalid.count)throw Error('archive integrity');
 const events=[],usable=new Map();
 for(const [key,[current,old]] of partitions){
  if(!complete(current)||now-dt(current.m.lastObservedAt)>fresh||old&&dt(old.m.lastObservedAt)===dt(current.m.lastObservedAt))continue;
  const latest=slot(current,now),{rows}=latest;
  usable.set(key,{current,old,...latest});
  if(!old||!complete(old)||dt(old.m.lastObservedAt)>=dt(current.m.lastObservedAt))continue;
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
   for(const [v,b] of range)if(!p?.has(v))events.push(event(b.tier==='standard'?'new_prop':'alternate_tier',keyDate(k),null,b,b.book+' '+v));
  }
  // Incomplete row interpretation cannot certify absence. Require an actual future start.
  if(current.m.health.unresolvedRows===0)for(const [k,range] of prior.rows){
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
 return {events,usablePartitions:usable.size};
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
function build(root,now,doc,nbaDoc,receipts=[]){
 const r=compare(walkBoards(root),now);
 return {...r,events:[...new Map([...availability(receipts,now),...research(doc,now),...nbaResearch(nbaDoc,now),...r.events].map(e=>[e.id,e])).values()]};
}
function message(events){
 if(events.length<1||events.length>6||events.some(e=>!Object.hasOwn(names,e.kind)))throw Error('alert batch');
 return {content:['**Platform research alerts**',...events.map(e=>'• '+names[e.kind]+' — '+e.text+(Number.isFinite(dt(e.observedAt))?' · '+new Date(dt(e.observedAt)).toISOString().slice(0,16).replace('T',' ')+' UTC':'')),
  'Observed research only. Check the original app. No wagers or recommendations.'].join('\n').slice(0,1950),
  flags:4,allowed_mentions:{parse:[]}};
}
module.exports={compare,research,nbaResearch,availability,build,message,sports,books,tiers,names};
