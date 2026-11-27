'use strict';

// Independent archive benchmark. The reviewed game clock is used only here;
// it never fills a missing source-offer clock for a prospective forecast.
const {load,analyze}=require('./pickfinder-public-evidence-audit.cjs');
const {history,aliases}=require('./pickfinder-public-model-validation.cjs');
const {gameReviewReceipts}=require('./public-nba-mirror-prospective-bridge.cjs');
const {indexReviews}=require('./pickfinder-reviewed-game-context.cjs');
const {compareByGame}=require('./prospective-game-comparison.cjs');
const dt=Date.parse;

function rows(archive,receipts,finals,clock){
 const reviews=indexReviews(receipts.map(x=>x.doc),clock),eligible=new Map();
 for(const receipt of receipts)for(const [key,value] of indexReviews([receipt.doc],clock)){
  const ms=dt(receipt.first);
  if(value&&value.signature===reviews.get(key)?.signature&&Number.isFinite(ms)&&ms<=dt(clock)&&
     ms+900000<dt(value.g.scheduleStartAt))eligible.set(key,value);
 }
 const finalByGame=new Map(),ambiguousGames=new Set();
 for(const {doc,first} of finals){
  if(!['nba_official_web_final_history_v1','nba_official_cdn_final_history_v1'].includes(doc.kind)||
     doc.officialFinalClockVerified!==true||!Number.isFinite(dt(first))||dt(first)>dt(clock)||
     !Number.isFinite(dt(doc.capturedAt))||dt(doc.capturedAt)<=dt(doc.startAt)||dt(doc.capturedAt)>dt(first)+999||
     !Array.isArray(doc.rows))continue;
  if(finalByGame.has(doc.gameId)){ambiguousGames.add(doc.gameId);continue;}
  finalByGame.set(doc.gameId,doc);
 }
 const by=new Map(),bad=new Set();
 const ordered=[...archive.manifests].sort((a,b)=>dt(a.first)-dt(b.first)||a.digest.localeCompare(b.digest));
 for(const entry of ordered){
  const available=dt(entry.first);
  if(!Number.isFinite(available)||available>dt(clock))continue;
  for(const x of analyze({latest:[entry],manifests:[entry],invalid:[]},clock).featureRows){
   if(!x.matchup)continue;
   const o=x.offer,playerPath=new URL(o.detailId,'https://www.pickfinder.app').pathname;
   const review=eligible.get(JSON.stringify([o.eventId,playerPath]));
   if(!review||review.r.player!==o.player)continue;
   const nativeGame=Number(review.g.nbaGameId),start=dt(review.g.scheduleStartAt),offerStart=dt(o.startAt);
   const game=finalByGame.get(nativeGame),market=aliases[o.market];
   if(!game||ambiguousGames.has(nativeGame)||!market||dt(game.startAt)!==start||available+900000>=start||
      dt(o.observedAt)>available+999||Number.isFinite(offerStart)&&Math.abs(offerStart-start)>300000)continue;
   const result=game.rows.filter(row=>row.playerId===Number(review.r.nbaPlayerId)&&row.team===review.r.team&&
      row.opponent===review.r.opponent&&row.officialGameFinalVerified===true&&row.identityVerified===true&&row.appeared===true);
   const actual=result[0]?.[market],l10=x.features?.L10;
   if(result.length!==1||!Number.isInteger(actual)||!Number.isFinite(l10))continue;
   const key=JSON.stringify([nativeGame,review.r.nbaPlayerId,market,o.line]);
   const sample={event:nativeGame,gameStartAt:game.startAt,market,outcome:Number(actual>o.line),higher:x.matchup.higher,historicalGames:x.matchup.games,l10,
      explicitBoardClock:Number.isFinite(offerStart)};
   const old=by.get(key);
   if(!old)by.set(key,{sample,available});
   else if(old.available===available&&JSON.stringify(old.sample)!==JSON.stringify(sample))bad.add(key);
  }
 }
 return [...by].filter(([key])=>!bad.has(key)).map(([,value])=>value.sample);
}

function score(examples,estimate){
 if(!examples.length)return {brier:null,logLoss:null};
 let brier=0,logLoss=0;
 for(const x of examples){
  const p=estimate(x);
  brier+=(p-x.outcome)**2;
  logLoss-=Math.log(Math.max(.0001,x.outcome?p:1-p));
 }
 return {brier:brier/examples.length,logLoss:logLoss/examples.length};
}
const slateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
const slate=x=>{
 const {year,month,day}=Object.fromEntries(slateFormat.formatToParts(dt(x.gameStartAt)).map(x=>[x.type,x.value]));
 return `${year}-${month}-${day}`;
};
const withMatchup=x=>(20*x.l10+x.higher)/(20+x.historicalGames);
// These fixed arms isolate whether the gain (if any) is from shrinking an
// overconfident probability or from the exact-scope matchup evidence itself.
const estimates={l10:x=>x.l10,matchup:withMatchup,l10Shrunk:x=>.25+.5*x.l10,
 matchupShrunk:x=>.25+.5*withMatchup(x),even:()=>.5};
function paired(examples,candidate,benchmark){
 return compareByGame(examples.map(x=>({gameId:x.event,outcome:x.outcome,
  candidate:estimates[candidate](x),benchmark:estimates[benchmark](x)})));
}
function chronologicalAblation(examples){
 const slates=[...new Set(examples.map(slate))].sort();
 // Select entire dates before scoring, never let different games on the
 // same date cross the split. No fitting or confidence/threshold selection.
 const boundary=slates.length>=3?slates[Math.floor(slates.length*2/3)]:null;
 const cohorts={all:examples,earlier:boundary?examples.filter(x=>slate(x)<boundary):[],
  later:boundary?examples.filter(x=>slate(x)>=boundary):[]};
 function ablate(rows){
  return {slates:[...new Set(rows.map(slate))].sort(),
   l10Shrinkage:paired(rows,'l10Shrunk','l10'),
   matchupIncrementAfterShrinkage:paired(rows,'matchupShrunk','l10Shrunk'),
   matchupShrinkage:paired(rows,'matchupShrunk','matchup'),
   matchupShrunkVsEven:paired(rows,'matchupShrunk','even'),
   l10ShrunkVsEven:paired(rows,'l10Shrunk','even')};
 }
 const byMarket=rows=>Object.fromEntries([...new Set(rows.map(x=>x.market))].sort().map(m=>[m,
  paired(rows.filter(x=>x.market===m),'matchupShrunk','l10Shrunk')]));
 return {method:'fixed_half_shrinkage_pacific_date_ablation_v1',laterStartsAtPacificDate:boundary,
  fitObservations:0,untouchedHoldout:false,priorArchivePreviouslyReviewed:true,
  cohorts:Object.fromEntries(Object.entries(cohorts).map(([key,val])=>[key,ablate(val)])),
  allByMarket:byMarket(examples),laterByMarket:byMarket(cohorts.later)};
}
function run(root,clock=new Date().toISOString()){
 const archive=load(root,'nba');
 if(archive.invalid.length)throw Error('invalid NBA archives');
 const examples=rows(archive,gameReviewReceipts(root,clock),history(root,'nba-final-history'),clock);
 return {kind:'pickfinder_nba_matchup_retrospective_v1',generatedAt:clock,boardManifests:archive.manifests.length,
   distinctPropositions:examples.length,distinctGames:new Set(examples.map(x=>x.event)).size,
   explicitBoardClock:examples.filter(x=>x.explicitBoardClock).length,
   scores:{l10:score(examples,x=>x.l10),even:score(examples,()=>.5),
     h2h:score(examples,x=>x.higher/x.historicalGames),
     h2hWithL10Prior:score(examples,withMatchup)},
   chronologicalAblation:chronologicalAblation(examples),
   minimumHistoricalGames:4,l10PriorWeight:20,logLossProbabilityFloor:.0001,
   prospective:false,modelApproved:false,paidRequests:0};
}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2]||'.',process.argv[3])));
module.exports={rows,score,run,chronologicalAblation};
