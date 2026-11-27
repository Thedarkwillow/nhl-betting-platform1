'use strict';

const {load,features}=require('./pickfinder-public-evidence-audit.cjs');
const {auditBoards,esportsScope}=require('./pickfinder-archived-model-inputs.cjs');
const {history}=require('./pickfinder-public-model-validation.cjs');
const {reconcileSeries}=require('./pickfinder-esports-series-review.cjs');
const dt=Date.parse;
const key=(...parts)=>JSON.stringify(parts);
const hash=/^[a-f0-9]{64}$/;

function finalIndex(receipts,clock){
 const refs=new Map(),bad=new Set();
 for(const {doc,digest,first} of receipts){
  if(doc.kind!=='pickfinder_independent_valorant_finals_v1'||!hash.test(digest)||
    !Number.isFinite(dt(first))||dt(first)>dt(clock)||!Number.isFinite(dt(doc.observedAt))||
    dt(doc.observedAt)>dt(first)+999)continue;
  for(const series of doc.series||[]){
   if(!Number.isFinite(dt(series.listedStartAt))||dt(series.listedStartAt)>=dt(doc.observedAt)||
    !hash.test(series.responseSha256||'')||!Array.isArray(series.maps)||series.maps.length!==2||
    new Set(series.maps.map(m=>m.mapId)).size!==2||
    series.maps.some(m=>!/^\d+$/.test(m.mapId)||!Array.isArray(m.teamRounds)||m.teamRounds.length!==2||
      m.teamRounds.some(x=>!Number.isSafeInteger(x)||x<0)||Math.max(...m.teamRounds)<13||
      Math.abs(m.teamRounds[0]-m.teamRounds[1])<2||Object.keys(m.players||{}).length!==10))continue;
   const prior=refs.get(series.sourceEventId);
   if(prior&&JSON.stringify(prior.series)!==JSON.stringify(series))bad.add(series.sourceEventId);
   else refs.set(series.sourceEventId,{series,digest});
  }
 }
 for(const id of bad)refs.delete(id);
 return refs;
}

function scopedFeatures(offer,observations){
 // Legacy board research columns omitted mapRange. Require the same observed
 // offer URL, exact encoded map slug, player, book and timestamp before recovery.
 const labels=observations.filter(r=>r.origin==='board'&&r.boardBook===offer.book&&
  r.player===offer.player&&r.sport===offer.sport&&r.detailId===offer.detailId&&r.eventId===offer.eventId&&
  r.market===offer.market&&r.observedAt===offer.observedAt&&r.period==null&&r.gameMode==null&&
  (r.mapRange==null||r.mapRange===offer.mapRange))
  .map(r=>({...r,mapRange:offer.mapRange}));
 return features(offer,labels);
}
function samples(boardHistory,receipts,clock,observationsByManifest=new Map()){
 const finals=finalIndex(receipts,clock),skip={},picked=new Map(),ambiguous=new Set();
 const reject=reason=>skip[reason]=(skip[reason]||0)+1;
 for(const row of boardHistory.values()){
  const o=row.offer,scope=esportsScope(o);
  if(o.sport!=='valorant'||!scope||scope.maps.join(',')!=='1,2'||
    !['kills','deaths','assists','killsPlusAssists'].includes(scope.market))continue;
  if(!Number.isFinite(o.line)||o.line<=0||o.line%1!==.5)continue;
  let u;
  try{u=new URL(o.detailId,'https://www.pickfinder.app');}catch{continue;}
  const p=u.searchParams.getAll('prop'),parts=p[0]?.split(':');
  if(u.origin!=='https://www.pickfinder.app'||p.length!==1||parts?.length!==4||
    parts[1]!==o.market||parts[2]!==o.eventId||Number(parts[3])!==o.line)continue;
  const final=finals.get(o.eventId);
  if(!final){reject('missingFinal');continue;}
  const entry={sport:o.sport,sourceEventId:o.eventId,sourcePlayer:o.player,profilePath:u.pathname,maps:scope.maps};
  const review=reconcileSeries([entry],clock).rows[0].independentSeriesEvidence;
  const {series}=final,available=dt(row.archiveFirst),start=dt(series.listedStartAt),seen=dt(o.observedAt),offerStart=dt(o.startAt);
  if(!Number.isFinite(available)||!Number.isFinite(seen)||seen>available+999||available+900000>=start||
    Number.isFinite(offerStart)&&Math.abs(offerStart-start)>300000){reject('unprovedPregame');continue;}
  if(review.status!=='roster_and_map_corroborated'||typeof review.independentPlayerProfile!=='string'||
    new URL(review.seriesUrl).pathname.replace(/\/$/,'')!==new URL(series.resultUrl).pathname.replace(/\/$/,'')||
    JSON.stringify(review.firstTwoMapNames)!==JSON.stringify(series.maps.map(x=>x.name))||
    review.firstTwoResultSiteMapIds&&JSON.stringify(review.firstTwoResultSiteMapIds)!==JSON.stringify(series.maps.map(x=>x.mapId))){
   reject('unprovedMapScope');continue;
  }
  const native=/^https:\/\/www\.vlr\.gg\/player\/(\d+)\/[\w-]+\/?$/.exec(review.independentPlayerProfile)?.[1];
  const values=series.maps.map(m=>m.players[native]).map(stats=>scope.market==='killsPlusAssists'&&
    Number.isSafeInteger(stats?.kills)&&Number.isSafeInteger(stats?.assists)?stats.kills+stats.assists:stats?.[scope.market]);
  if(values.some(x=>!Number.isSafeInteger(x)||x<0)){reject('unprovedPlayer');continue;}
  const aligned=scopedFeatures(o,observationsByManifest.get(row.manifestDigest)||[]);
  const l5=aligned.L5,l10=aligned.L10;
  if([l5,l10].some(x=>!Number.isFinite(x)||x<0||x>1)){reject('missingPairedFeatures');continue;}
  const actual=values.reduce((a,b)=>a+b,0),k=key(o.eventId,native,scope.market,o.line);
  const example={event:o.eventId,market:scope.market,outcome:Number(actual>o.line),l5,l10};
  const prior=picked.get(k);
  if(!prior||prior.available>available)picked.set(k,{example,available});
  else if(prior.available===available&&JSON.stringify(prior.example)!==JSON.stringify(example))ambiguous.add(k);
 }
 for(const k of ambiguous)picked.delete(k);
 return {examples:[...picked.values()].map(x=>x.example),skip,conflicts:ambiguous.size};
}
function score(examples,estimate){
 let brier=0,loss=0;
 for(const x of examples){
  const p=estimate(x);
  brier+=(p-x.outcome)**2;
  loss-=Math.log(Math.max(.0001,x.outcome?p:1-p));
 }
 return examples.length?{brier:brier/examples.length,logLoss:loss/examples.length}:{brier:null,logLoss:null};
}
function run(root,clock=new Date().toISOString()){
 const archive=load(root,'valorant');
 if(archive.invalid.length)throw Error('invalid Valorant archive');
 const observations=new Map(archive.manifests.map(b=>[b.digest,b.researchObservations||[]]));
 const {examples,skip,conflicts}=samples(auditBoards(archive,clock).history,history(root,'../pickfinder-public-identity-v1/valorant-map-finals'),clock,observations);
 const scores=rows=>({examples:rows.length,series:new Set(rows.map(x=>x.event)).size,even:score(rows,()=>.5),
  l10:score(rows,x=>x.l10),l5:score(rows,x=>x.l5),l5L10Blend:score(rows,x=>(x.l5+x.l10)/2)});
 return {kind:'pickfinder_valorant_matched_retrospective_v1',generatedAt:clock,...scores(examples),
  byMarket:Object.fromEntries([...new Set(examples.map(x=>x.market))].map(m=>[m,scores(examples.filter(x=>x.market===m))])),
  skip,conflicts,modelApproved:false,paidRequests:0,prospective:false,platformSettlementVerified:false,frozenModelsChanged:false};
}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2]||'.')));
module.exports={run,samples,score,finalIndex,scopedFeatures};
