'use strict';

// Compare a fixed reviewed-history arm with the existing public model on the
// identical offer. The archive replay is retrospective and cannot promote a model.
const {historyForModel}=require('./pickfinder-native-history-reconciliation.cjs');
const {pickfinderProject}=require('./prizepicks-multisport-model-bridge.cjs');
const {target}=require('./pickfinder-public-nba-context.cjs');
const dt=Date.parse,key=x=>JSON.stringify(x);
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const markets={
 nhl:{shotsOnGoal:'sog',points:'points',goals:'goals',assists:'assists',blockedShots:'blockedShots',saves:'saves'},
 nfl:{passing_yards:'passing_yards',passing_touchdowns:'passing_tds',passing_attempts:'attempts',
  passing_completions:'completions',interceptions_thrown:'passing_interceptions',rushing_yards:'rushing_yards',
  rushing_attempts:'carries',receiving_yards:'receiving_yards',receptions:'receptions',receiving_targets:'targets'}
};
const sportOf=s=>String(s.sport||'').toLowerCase();
const probability=x=>Number.isFinite(x)&&x>=0&&x<=1;
const policy='reviewed-history-jeffreys-half-blend-v1';

function compareOffer(offer,scope,reviewedCache,clock,sourceFirst,baseline=pickfinderProject(offer,scope,clock).prediction,{controlledResearchOnly=false}={}){
 const sport=sportOf(scope),at=dt(clock),start=dt(offer.startAt),seen=dt(offer.observedAt),first=dt(sourceFirst);
 const metric=markets[sport]?.[baseline?.metric];
 if(!metric||!baseline?.probabilities||!['Higher','Lower'].includes(offer.side)||!Number.isFinite(offer.line)||
   offer.line<0||offer.line%1!==.5||offer.sport!==sport||offer.mapRange||offer.gameMode||
   ![at,start,seen,first,dt(scope.firstGitAt)].every(Number.isFinite)||start!==dt(scope.startAt)||
   start-at<=900000||dt(scope.firstGitAt)>at||first>at||seen>at||seen>first+999||at-seen>300000||
   scope.identityReviewed!==true||scope.eventReviewed!==true||scope.rosterReviewed!==true)return null;
 const t=target(offer);
 if(!t||Number(new URL(t.detailId,'https://www.pickfinder.app').searchParams.get('prop').split(':')[3])!==offer.line)return null;
 const native=sport==='nhl'?scope.history?.games:scope.history;
 if(!Array.isArray(native))return null;
 const usable=native.filter(r=>(sport==='nhl'||r.identity==='player:'+scope.playerId)&&r.finalVerified===true&&Number.isFinite(dt(r.knownAt))&&dt(r.knownAt)<=at&&
  (sport==='nhl'?r.gameDate<clock.slice(0,10):r.year<scope.season||r.year===scope.season&&r.week<scope.week));
 const rows=new Map(),duplicate=new Set();
 for(const r of usable){
  const id=String(sport==='nhl'?r.gameId:r.nativeGameId);
  if(rows.has(id))duplicate.add(id);
  rows.set(id,r);
 }
 const facts=controlledResearchOnly?[...reviewedCache.values()].filter(x=>
  x.evidenceKind==='verified_current_identity_and_independent_final_stat'&&x.shadowResearchEligible===true&&x.productionModelEligible===false&&
  x.sport===sport&&String(x.playerId)===String(scope.playerId)&&x.market===metric&&
  hash(x.identityReceiptDigest)&&hash(x.nativeDigest)&&hash(x.profileDigest)&&x.timezoneReceiptDigests?.length===3&&new Set(x.timezoneReceiptDigests).size===3&&x.timezoneReceiptDigests.every(hash)&&
  Number.isFinite(dt(x.availableAt))&&dt(x.availableAt)<=at&&Number.isFinite(dt(x.officialStartAt))&&dt(x.officialStartAt)<at):historyForModel(reviewedCache,{sport,playerId:scope.playerId,market:metric,asOf:clock,gameStartAt:scope.startAt});
 const matches=[];
 for(const f of facts){
  const id=String(f.eventId),row=rows.get(id);
  if(id===String(scope.gameId)||duplicate.has(id)||!row)continue;
  const value=sport==='nhl'?row[baseline.metric]:row.measures?.[baseline.metric];
  // Native disagreements block the arm completely for this offer.
  if(!Number.isSafeInteger(value)||value!==f.value)return null;
  matches.push(f);
 }
 if(matches.length<5)return null;
 const q=baseline.probabilities,decided=q.higher+q.lower;
 if(!probability(q.higher)||!probability(q.lower)||decided<=0)return null;
 const wins=matches.filter(f=>offer.side==='Higher'?f.value>offer.line:f.value<offer.line).length;
 const existing=q[offer.side.toLowerCase()]/decided;
 const reviewed=(wins+.5)/(matches.length+1);
 return {policy:controlledResearchOnly?'independent-controlled-identity-shadow-v1':policy,existing,reviewed,challenger:(existing+reviewed)/2,neutral:.5,
  nativeMetric:metric,reviewedObservations:matches.length,
  reviewDigests:[...new Set(matches.map(f=>controlledResearchOnly?f.identityReceiptDigest:f.reviewDigest))].sort(),modelApproved:false};
}

function pregameBoardOffers(b){
 const cut=dt(b.first),sport=b.m.sport;
 if(!markets[sport]||!hash(b.digest)||!Number.isFinite(cut))return [];
 return b.offers.filter(o=>o.sport===sport&&Number.isFinite(dt(o.startAt))&&dt(o.startAt)>cut+900000&&
  Number.isFinite(dt(o.observedAt))&&dt(o.observedAt)<=cut&&cut-dt(o.observedAt)<=300000);
}
function eligibleBoards(archive,reviewedCache,clock){
 const sourceClockBySport={nhl:0,nfl:0},boards=[];
 const availability=new Map();
 for(const r of reviewedCache.values()){
  if(!Number.isFinite(dt(r.availableAt))||!markets[r.sport])continue;
  const at=availability.get(r.sport)??Infinity;
  availability.set(r.sport,Math.min(at,dt(r.availableAt)));
 }
 for(const b of archive.manifests){
  const sport=b.m.sport,cut=dt(b.first);
  if(!markets[sport]||!hash(b.digest)||!Number.isFinite(cut)||cut>dt(clock))continue;
  const offers=pregameBoardOffers(b);
  sourceClockBySport[sport]+=offers.length;
  if(offers.length&&cut>=(availability.get(sport)??Infinity))boards.push({...b,offers});
 }
 return {sourceClockBySport,boards};
}

function finalFor(p,gameIndex,clock){
 const games=gameIndex.byPlayer.get(key([p.sport.toLowerCase(),String(p.playerId)]))||[];
 const matches=games.filter(g=>g.event===String(p.gameId)&&g.team===p.team&&g.opp===p.opponent&&
  dt(g.start)===dt(p.startAt)&&Number.isFinite(dt(g.first))&&dt(g.first)>dt(g.start)&&dt(g.first)<=dt(clock));
 if(matches.length!==1)return null;
 const actual=matches[0].stats[p.reviewedHistoryPair.nativeMetric];
 return Number.isSafeInteger(actual)&&hash(matches[0].digest)?{actual,digest:matches[0].digest,availableAt:matches[0].first}:null;
}

function scorePairs(rows,gameIndex,clock){
 const methodScores=['existing','reviewed','challenger','neutral'];
 const methods=()=>Object.fromEntries(methodScores.map(m=>[m,{brier:0,logLoss:0}]));
 const all={nhl:{},nfl:{}},first=new Map(),conflicts=new Set();
 for(const p of rows){
  const k=key([p.sport,p.gameId,p.playerId,p.market,p.line,p.side]);
  const old=first.get(k);
  if(!old||dt(old.forecastAt)>dt(p.forecastAt)){first.set(k,p);conflicts.delete(k);}
  else if(dt(old.forecastAt)===dt(p.forecastAt)&&key(old.reviewedHistoryPair)!==key(p.reviewedHistoryPair))conflicts.add(k);
 }
 for(const [k,p] of first){
  if(conflicts.has(k))continue;
  const sport=p.sport.toLowerCase(),s=all[sport][p.market]??={eligiblePairs:0,decided:0,pending:0,games:new Set(),scores:methods()};
  s.eligiblePairs++;
  const final=finalFor(p,gameIndex,clock);
  if(final===null){s.pending++;continue;}
  const y=Number(p.side==='Higher'?final.actual>p.line:final.actual<p.line);
  s.decided++;s.games.add(String(p.gameId));
  for(const m of methodScores){
   const q=p.reviewedHistoryPair[m];
   s.scores[m].brier+=(q-y)**2;
   s.scores[m].logLoss-=Math.log(Math.max(.0001,y?q:1-q));
  }
 }
 for(const group of Object.values(all))for(const v of Object.values(group)){
  v.distinctGames=v.games.size;delete v.games;
  for(const m of methodScores)for(const metric of ['brier','logLoss'])v.scores[m][metric]=v.decided?v.scores[m][metric]/v.decided:null;
 }
 return all;
}

function replay(root,archive,reviewedCache,nativeIndex,clock,revision){
 const {fromArchive}=require('./prizepicks-native-context-readiness.cjs');
 const {generate}=require('./native-individual-research.cjs');
 if(archive.invalid.length)throw Error('invalid public PickFinder archive');
 const {sourceClockBySport,boards}=eligibleBoards(archive,reviewedCache,clock),rows=[];
 for(const b of boards){
  const snapshot={latest:[b],manifests:[b],invalid:[]};
  const ctx=fromArchive(root,b.first,revision,snapshot);
  for(const p of generate(ctx,[],reviewedCache).rows)if(p.reviewedHistoryPair)rows.push(p);
 }
 return {policy,sourceClockBySport,eligibleBoardSnapshots:boards.length,
  bySport:scorePairs(rows,nativeIndex,clock),retrospective:true,productionChanged:false,modelApproved:false,paidRequests:0};
}

module.exports={compareOffer,pregameBoardOffers,eligibleBoards,scorePairs,replay,finalFor,policy};
