'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{ROOT,sha}=require('./pickfinder-public-archive.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
const {noVigHigher,quoteSourceTime,exactOffsetTime,sportsbookIds}=require('./pickfinder-quote-features.cjs');
const {dashboardRoutes,dashboardState,pageMarker,verifyDashboardSequence,dashboardSequenceSchema,dashboardFilterKind}=require('./pickfinder-dashboard-research.cjs');
const dt=Date.parse, key=x=>JSON.stringify(x), valid=x=>Number.isFinite(dt(x));
const fields={offers:'distinctOfferKeys',researchObservations:'researchFields',unpricedTierObservations:'unpricedTierObservations',sportsbookQuotes:'sportsbookQuoteObservations'};
const git=(root,args)=>execFileSync('git',['-C',root,...args],{stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:128e6}).toString().trim();
function read(root,kind,digest){
 if(!/^[a-f0-9]{64}$/.test(digest))throw Error('digest');
 const rel=ROOT+'/'+kind+'/'+digest+'.json',p=path.join(root,rel),st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size>8e6)throw Error('file');
 const b=fs.readFileSync(p);if(sha(b)!==digest)throw Error('bytes');return JSON.parse(b);
}
function list(root,kind){
 const d=path.join(root,ROOT,kind);if(!fs.existsSync(d))return [];
 return fs.readdirSync(d).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>n.slice(0,-5));
}
function* walkBoards(root,sport=null){
 for(const digest of list(root,'boards'))try{
  const m=read(root,'boards',digest);
  if(sport&&m.sport!==sport)continue;
  if(m.schema!=='pickfinder-public-normalized-v1'||!['prizepicks','underdog'].includes(m.book)||!valid(m.firstObservedAt)||!valid(m.lastObservedAt)||dt(m.firstObservedAt)>dt(m.lastObservedAt)||m.authenticated!==true||!Array.isArray(m.partDigests)||new Set(m.partDigests).size!==m.partDigests.length)throw Error('manifest');
  const rows={offers:[],researchObservations:[],unpricedTierObservations:[],sportsbookQuotes:[]};
  for(const p of m.partDigests){const x=read(root,'board-parts',p);if(x.schema!=='pickfinder-public-board-part-v1'||x.sourceDigest!==m.sourceDigest||x.sport!==m.sport||x.book!==m.book||!(x.field in fields)||!Array.isArray(x.rows))throw Error('part');rows[x.field].push(...x.rows);}
  for(const [f,k] of Object.entries(fields))if(rows[f].length!==m.health?.[k])throw Error('count');
  const rel=ROOT+'/boards/'+digest+'.json',commits=git(root,['log','--format=%H','--',rel]).split('\n');if(commits.length!==1||!/^[a-f0-9]{40}$/.test(commits[0]))throw Error('immutable manifest');
  const first=git(root,['show','-s','--format=%cI',commits[0]]);if(!valid(first)||dt(first)+999<dt(m.lastObservedAt))throw Error('archive clock');
  yield {entry:{digest,m,first,...rows}};
 }catch{yield {invalidDigest:digest};}
}
function load(root,sport=null,{latestOnly=false}={}){
 const manifests=[],invalid=[],latest=new Map();
 for(const {entry,invalidDigest} of walkBoards(root,sport)){
  if(!entry){invalid.push(invalidDigest);continue;}
  if(!latestOnly)manifests.push(entry);const k=entry.m.sport+'/'+entry.m.book,old=latest.get(k);
  if(!old||dt(old.m.lastObservedAt)<dt(entry.m.lastObservedAt))latest.set(k,entry);
 }
 return {manifests,latest:[...latest.values()],invalid};
}
function scope(r){return key([r.sport,r.detailId,r.eventId,r.market,r.period??null,r.mapRange??null,r.gameMode??null]);}
const price=v=>typeof v==='string'&&/^[+-]\d{2,4}$/.test(v)&&Math.abs(Number(v))>=100;
const implied=p=>Number(p)>0?100/(100+Number(p)):-Number(p)/(100-Number(p));
function quotes(offer,rows,cut,maxAge=300000){
 const by=new Map();for(const q of rows){
  if(!q.book||['prizepicks','underdog'].includes(q.book)||scope(q)!==scope(offer)||q.quoteLine!==offer.line||!price(q.price)||!['Higher','Lower'].includes(q.side)||!valid(q.observedAt)||dt(q.observedAt)>dt(cut)||dt(cut)-dt(q.observedAt)>maxAge)continue;
  const k=key([q.book,q.observedAt]),a=by.get(k)||{book:q.book,observedAt:q.observedAt,p:{},conflict:false};
  if(a.p[q.side]&&a.p[q.side]!==q.price)a.conflict=true;a.p[q.side]=q.price;by.set(k,a);
 }
 const result=new Map();for(const a of by.values())if(!a.conflict&&a.p.Higher&&a.p.Lower){const old=result.get(a.book);if(!old||dt(old.observedAt)<dt(a.observedAt))result.set(a.book,{book:a.book,observedAt:a.observedAt,higher:implied(a.p.Higher)/(implied(a.p.Higher)+implied(a.p.Lower))});}
 return [...result.values()];
}
// For public board context, a browser observation clock is not a quote clock.
// Use one complete contemporaneous snapshot per bookmaker and reject conflicts
// for the same source instant, including competing later reads of that instant.
function sourceClockQuotes(offer,rows,cut,maxAge=300000){
 const end=exactOffsetTime(cut);
 if(!Number.isFinite(end)||!Number.isFinite(maxAge)||maxAge<0||!Number.isFinite(offer?.line)||offer.line<0||
  ![offer.sport,offer.detailId,offer.eventId,offer.market].every(x=>typeof x==='string'&&x.trim()))return [];
 const byBook=new Map();
 for(const q of rows){
  if(!q||!sportsbookIds.has(q.book)||scope(q)!==scope(offer)||q.quoteLine!==offer.line||!['Higher','Lower'].includes(q.side)||!price(q.price))continue;
  const seen=exactOffsetTime(q.observedAt),source=quoteSourceTime(q,q.observedAt);
  if(!source)continue;
  const at=exactOffsetTime(source.sourceQuoteDateTime);
  if(seen>end||end-at>maxAge)continue;
  const old=byBook.get(q.book);
  if(old&&at<old.at)continue;
  const group=old?.at===at?old:{at,frames:new Map(),prices:{Higher:new Set(),Lower:new Set()}};
  group.prices[q.side].add(Number(q.price));
  const snapshot=group.frames.get(seen)??{};
  snapshot[q.side]=q.price;
  group.frames.set(seen,snapshot);
  byBook.set(q.book,group);
 }
 const result=[];
 for(const [book,g] of byBook){
  if(g.prices.Higher.size!==1||g.prices.Lower.size!==1)continue;
  const frame=[...g.frames].filter(([,s])=>s.Higher&&s.Lower).sort(([a],[b])=>b-a)[0];
  if(!frame)continue;
  const [seen,sides]=frame,higher=noVigHigher(sides.Higher,sides.Lower);
  if(higher===null)continue;
  result.push({book,observedAt:new Date(seen).toISOString(),sourceQuoteAt:new Date(g.at).toISOString(),higher,
   sourceClockVerified:true,originalPlatformVerified:false,modelInputsApproved:false});
 }
 return result.sort((a,b)=>a.book.localeCompare(b.book));
}
function features(offer,rows){
 const out={},conflicts=new Set();for(const r of rows){
  if(scope(r)!==scope(offer)||r.origin!=='board'||r.observedAt!==offer.observedAt)continue;
  const name=r.metric;if(!['L5','L10','L15','SZN','H2H','Avg L10'].includes(name)||typeof r.value!=='string')continue;
  const m=name==='Avg L10'?r.value.match(/^\d+(?:\.\d+)?$/):r.value.match(/^(\d+(?:\.\d+)?)%(?:\n(\d+)\/(\d+))?$/);if(!m)continue;
  const value=Number(m[1]??m[0])/(name==='Avg L10'?1:100);if(!Number.isFinite(value)||value<0||name!=='Avg L10'&&value>1)continue;
  if(m[2]&&(!Number(m[3])||Number(m[2])>Number(m[3])||Math.abs(Number(m[2])/Number(m[3])-value)>.011))continue;
  if(name in out&&out[name]!==value)conflicts.add(name);out[name]=value;
 }
 for(const k of conflicts)delete out[k];return out;
}
// The board reports the over-side H2H frequency against the displayed line.
function matchupSample(offer, rows) {
 if (offer.sport !== 'nba' || offer.period || offer.mapRange || offer.gameMode || !Number.isFinite(offer.line) ||
     offer.line < 0 || offer.line % 1 !== .5) return null;
 let url;
 try { url = new URL(offer.detailId, 'https://www.pickfinder.app'); } catch { return null; }
 const [prop] = url.searchParams.getAll('prop');
 const parts = prop?.split(':') || [];
 if (url.origin !== 'https://www.pickfinder.app' || !/^\/players\/nba\/[\w-]+$/.test(url.pathname) ||
     url.searchParams.getAll('prop').length !== 1 || parts.length !== 4 || !parts[0] ||
     parts[1] !== offer.market || parts[2] !== offer.eventId ||
     !/^\d+\.5$/.test(parts[3]) || Number(parts[3]) !== offer.line) return null;
 const matching = rows.filter(row => scope(row) === scope(offer) && row.origin === 'board' &&
     row.metric === 'H2H' && row.observedAt === offer.observedAt && row.player === offer.player &&
     row.boardBook === offer.book);
 const values = new Set(matching.map(row => row.value));
 if (values.size !== 1) return null;
 const m = /^(\d+(?:\.\d+)?)%\n(\d+)\/(\d+)$/.exec(matching[0].value);
 if (!m) return null;
 const [percent, higher, games] = m.slice(1).map(Number);
 if (games < 4 || games > 100 || higher > games || percent > 100 ||
     Math.abs(higher / games - percent / 100) > .001) return null;
 return {higher, games};
}

function analyze(archive,now=new Date().toISOString()){
 const bySport={},comp=new Map(),events=new Map(),featureRows=[];let offerRefs=0,exactComparisons=0;
 for(const a of archive.latest){
  const m=a.m,s=m.sport,x=bySport[s]??={boards:{},offers:0,unresolved:0,unpricedGoblin:0,unpricedDemon:0,quotedSportsbooks:0,explicitThresholdQuotes:0,matchedTwoSidedQuotes:0,boardFeatureRows:0,matchupSampleOffers:0,missingStartAt:0,sourceEvents:0,exactCrossBookRows:0};
  x.boards[m.book]={state:m.boardState,pages:m.health.pages,displayedPages:m.displayedPageCount,offers:m.health.distinctOfferKeys,unresolved:m.health.unresolvedRows,observedAt:m.lastObservedAt,slot:m.slot,traversal:m.pageTraversalComplete};
  x.offers+=a.offers.length;x.unresolved+=m.health.unresolvedRows;
  x.unpricedGoblin+=a.unpricedTierObservations.filter(o=>o.tier==='goblin').length;x.unpricedDemon+=a.unpricedTierObservations.filter(o=>o.tier==='demon').length;
  x.quotedSportsbooks+=a.sportsbookQuotes.filter(q=>q.book&&!['prizepicks','underdog'].includes(q.book)).length;
  x.explicitThresholdQuotes+=a.sportsbookQuotes.filter(q=>q.book&&!['prizepicks','underdog'].includes(q.book)&&Number.isFinite(q.quoteLine)).length;
  const q=new Map(),f=new Map();for(const row of a.sportsbookQuotes){const k=scope(row),v=q.get(k)||[];v.push(row);q.set(k,v);}
  for(const row of a.researchObservations){const k=key([row.detailId,row.eventId,row.market,row.observedAt]),v=f.get(k)||[];v.push(row);f.set(k,v);}
  for(const o of a.offers){
   if(!o.eventId||!o.detailId||!Number.isFinite(o.line)||!valid(o.observedAt))continue;offerRefs++;
   if(!valid(o.startAt))x.missingStartAt++;
   const ek=key([s,o.eventId]);if(!events.has(ek))events.set(ek,{sport:s,sourceEventId:o.eventId,players:new Set()});events.get(ek).players.add(o.player);
   const k=key([scope(o),o.line,o.tier??null,o.side]),v=comp.get(k)||new Map();const old=v.get(o.book);if(!old||dt(old.observedAt)<dt(o.observedAt))v.set(o.book,o);comp.set(k,v);
   const scoped=f.get(key([o.detailId,o.eventId,o.market,o.observedAt]))||[];
   const b=features(o,scoped),matchup=matchupSample(o,scoped),c=quotes(o,q.get(scope(o))||[],new Date(Math.min(dt(o.observedAt),dt(a.first))).toISOString());
   if(matchup)x.matchupSampleOffers++;
   if(c.length)x.matchedTwoSidedQuotes++;if(Object.keys(b).length)x.boardFeatureRows++;
   if(Object.keys(b).length||c.length||matchup)featureRows.push({offer:o,manifestDigest:a.digest,manifestFirst:a.first,features:b,quotes:c,...(matchup?{matchup}:{} )});
  }
 }
 for(const v of comp.values())if(v.size===2){const a=v.get('prizepicks'),b=v.get('underdog');if(Math.abs(dt(a.observedAt)-dt(b.observedAt))<=900000){exactComparisons++;bySport[a.sport].exactCrossBookRows++;}}
 for(const e of events.values())bySport[e.sport].sourceEvents++;
 return {summary:{schema:'pickfinder_public_research_health_v1',generatedAt:now,archiveManifests:archive.manifests.length,invalidManifests:archive.invalid.length,latestPartitions:archive.latest.length,offerRefs,exactComparisons,bySport,originalPlatformVerified:false,modelApproved:false,paidRequests:0,privateRepoUsed:false},featureRows,events:[...events.values()].map(e=>({...e,players:[...e.players]}))};
}
function coverage(root){
 const done=new Set();let profileAttempts=0;
 for(const d of list(root,'profiles'))for(const r of read(root,'profiles',d).records||[]){
  profileAttempts++;if(r.status==='sampled'&&r.coverageVersion===VERSION&&!r.truncated&&r.research?.length)done.add(r.key);
 }
 const dashboards=new Map(list(root,'dashboards').map(d=>[d,read(root,'dashboards',d)]));
 const byDashboard={},dashboardEvidence={},gameDialogBySport={},pages=new Map(),sequences=[];
 let gameDialogReceipts=0,gameDialogObservations=0,namedDashboardSnapshots=0,unclassifiedDashboardFiles=0;
 let verifiedDashboardSequences=0,unverifiedDashboardSequences=0;
 const verifiedFilterScopes={native:0,custom:0,mixed:0},seenFilters=new Set();
 const names=['Games','Discrepancies','Popular'];
 for(const name of names)dashboardEvidence[name]={dataSnapshots:0,explicitEmptySnapshots:0,unverifiedSnapshots:0,withExplicitPage:0,verifiedSequences:0};
 for(const [digest,d] of dashboards){
  if(d.schema===dashboardSequenceSchema){sequences.push(d);continue;}
  if(d.schema==='pickfinder-public-game-dialog-v1'&&Array.isArray(d.records)){gameDialogReceipts++;for(const r of d.records){
   if(typeof r.sport!=='string'||!r.sport)continue;
   let eventId=r.eventId;
   if(r.sourceUrl){try{const u=new URL(r.sourceUrl),ids=u.searchParams.getAll('game');if(u.origin!=='https://www.pickfinder.app'||!['/games','/game-lines'].includes(u.pathname)||ids.length!==1||!/^[\w-]{1,80}$/.test(ids[0])||(eventId!=null&&eventId!==ids[0]))continue;eventId=ids[0];}catch{continue;}}
   if(typeof eventId!=='string'||!/^[\w-]{1,80}$/.test(eventId))continue;
   gameDialogObservations++;gameDialogBySport[r.sport]=(gameDialogBySport[r.sport]||0)+1;
  }continue;}
  if(!names.includes(d.name)){unclassifiedDashboardFiles++;continue;}
  namedDashboardSnapshots++;byDashboard[d.name]=(byDashboard[d.name]||0)+1;
  const stats=dashboardEvidence[d.name],marker=pageMarker(d);
  if(d.schema!=='pickfinder-public-dashboard-v1'||!dashboardRoutes(d.name).includes(d.path)||!valid(d.observedAt)){
   stats.unverifiedSnapshots++;continue;
  }
  pages.set(digest,d);
  if(marker)stats.withExplicitPage++;
  const state=dashboardState(d),filter=dashboardFilterKind(d.filterSelection);
  const consistentEmpty=state==='explicit_empty'&&(!d.pagination?.length||marker?.page===1&&marker.total===1);
  if(filter&&d.filterSelectionVerified===true&&(state==='data_observed'||consistentEmpty)&&d.dataState===state){
   const choiceKey=d.filterSelection.map(x=>[x.label,x.kind??'native',Array.isArray(x.values??x.value)?[...(x.values??x.value)].sort():x.value])
    .sort((a,b)=>a[0].localeCompare(b[0]));
   const identity=key([d.name,d.path,choiceKey]);
   if(!seenFilters.has(identity)){seenFilters.add(identity);verifiedFilterScopes[filter]++;}
  }
  if(state==='data_observed'&&(!d.dataState||d.dataState===state))stats.dataSnapshots++;
  else if(consistentEmpty&&(!d.dataState||d.dataState===state))stats.explicitEmptySnapshots++;
  else stats.unverifiedSnapshots++;
 }
 const seen=new Set();
 for(const d of sequences){
  if(!verifyDashboardSequence(d,pages)){unverifiedDashboardSequences++;continue;}
  const signature=key(d.pageDigests);if(seen.has(signature))continue;
  seen.add(signature);verifiedDashboardSequences++;dashboardEvidence[d.name].verifiedSequences++;
 }
 return {profileAttempts,uniqueCompletedCurrentVersion:done.size,dashboardSnapshots:dashboards.size-sequences.length,
  namedDashboardSnapshots,byDashboard,dashboardEvidence,verifiedDashboardSequences,unverifiedDashboardSequences,verifiedFilterScopes,
  gameDialogReceipts,gameDialogObservations,gameDialogBySport,unclassifiedDashboardFiles,allFiltersVerified:false};
}
module.exports={load,walkBoards,analyze,coverage,features,matchupSample,quotes,sourceClockQuotes,scope,read,list,git};
