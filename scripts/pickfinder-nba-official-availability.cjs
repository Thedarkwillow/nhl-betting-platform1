'use strict';

const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const nba=require('../src/nba-research-pipeline-v1.cjs');
const indexUrl='https://www.nba.com/players/injury-report';
const reportPattern=/^https:\/\/(?:ak-static\.cms\.nba\.com|official\.nba\.com)\/referee\/injury\/Injury-Report_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}(?:AM|PM)\.pdf$/;
const dayAt=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const dt=Date.parse,maxAge=6*3600000;
const statuses=new Set(['out','doubtful','questionable','probable','available','game-time decision']);
const kind='nba_public_official_pregame_availability_v1';
const upcoming=(schedule,at)=>(schedule?.games||[]).filter(g=>g.status===1&&dt(g.startAt)>dt(at)+900000&&dt(g.startAt)-dt(at)<=maxAge);
const scope=g=>JSON.stringify([dayAt(g.startAt),g.away+'@'+g.home]);

async function bounded(url,client,limit,accept) {
 const response=await client(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:accept}});
 if(!response.ok||!response.body)throw Error('official availability source unavailable');
 const chunks=[];let length=0;
 for await(const chunk of response.body){
  length+=chunk.length;
  if(length>limit)throw Error('official availability source size');
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}

async function collect(schedule,receipts,at,client=fetch,clock=()=>new Date().toISOString()){
 const games=upcoming(schedule,at);
 if(!games.length)return {state:'no_verified_game_within_six_hours',calls:0};
 const {reportClock,parseInjuryLayout}=require('./run-nba-private-research-v1.cjs');
 let calls=0;
 try{
  calls++;
  const index=await bounded(indexUrl,client,8e6,'text/html');
  const options=[...new Set([...index.toString('utf8').matchAll(/href=["']([^"']+)["']/gi)]
    .map(match=>match[1]).filter(url=>reportPattern.test(url)))].map(url=>({url,publishedAt:reportClock(url)}))
    .filter(o=>Number.isFinite(dt(o.publishedAt))&&dt(o.publishedAt)<=dt(at)&&dt(at)-dt(o.publishedAt)<=maxAge)
    .sort((a,b)=>dt(b.publishedAt)-dt(a.publishedAt));
  if(!options.length)return {state:'no_recent_official_report',calls};
  const source=options[0];
  if(options.some(o=>o.url!==source.url&&o.publishedAt===source.publishedAt))return {state:'report_clock_conflict',calls};
  // Scope is part of the receipt: a later game missing from an earlier capture of
  // the same report is not evidence of an available or absent player.
  const relevant=new Set(games.map(scope));
  if(receipts.some(x=>x.doc.sourceDocumentUrl===source.url&&x.doc.kind===kind&&
     Number.isFinite(dt(x.first))&&dt(x.first)<=dt(at)&&[...relevant].every(key=>x.doc.scopes?.includes(key))))
   return {state:'committed_report_reused',calls};
  calls++;
  const raw=await bounded(source.url,client,4e6,'application/pdf');
  if(raw.subarray(0,4).toString()!=='%PDF')throw Error('invalid PDF');
  const layout=execFileSync('pdftotext',['-layout','-','-'],{input:raw,encoding:'utf8',timeout:10000,maxBuffer:4e6});
  const parsed=parseInjuryLayout(layout),capturedAt=clock(),eligible=new Set(upcoming(schedule,capturedAt).map(scope));
  const rows=parsed.rows.filter(r=>eligible.has(JSON.stringify([r.date,r.match]))&&statuses.has(r.status));
  const notSubmitted=parsed.notSubmitted.filter(r=>eligible.has(JSON.stringify([r.date,r.match])));
  if(!rows.length&&!notSubmitted.length)return {state:'no_exact_upcoming_matchup_rows',calls};
  const receipt={kind,capturedAt,reportPublishedAt:source.publishedAt,sourceDocumentUrl:source.url,
    sourceResponseSha256:createHash('sha256').update(raw).digest('hex'),scopes:[...eligible],rows,notSubmitted,
    positiveParticipationVerified:false,modelApproved:false};
  return {state:'official_report_observed',calls,receipt};
 }catch{return {state:'official_report_unavailable',calls};}
}

function statusFor(receipts,player,game,clock){
 const playedAt=dt(game.startAt),forecastAt=dt(clock);
 if(!Number.isFinite(playedAt)||!Number.isFinite(forecastAt)||forecastAt+900000>=playedAt)return null;
 const {reportClock}=require('./run-nba-private-research-v1.cjs');
 const documentClock=url=>{try{return reportClock(url);}catch{return null;}};
 const eventKey=scope(game),match=game.away+'@'+game.home,day=dayAt(game.startAt);
 const exact=receipts.filter(({doc,first,digest})=>doc.kind===kind&&/^[a-f0-9]{64}$/.test(digest)&&
   /^[a-f0-9]{64}$/.test(doc.sourceResponseSha256||'')&&reportPattern.test(doc.sourceDocumentUrl||'')&&
   dt(documentClock(doc.sourceDocumentUrl))===dt(doc.reportPublishedAt)&&
   Number.isFinite(dt(first))&&dt(first)<=forecastAt&&Number.isFinite(dt(doc.capturedAt))&&
   dt(doc.capturedAt)<=forecastAt&&dt(doc.capturedAt)<=dt(first)+999&&
   dt(doc.reportPublishedAt)<=dt(doc.capturedAt)&&forecastAt-dt(doc.reportPublishedAt)<=maxAge&&doc.scopes?.includes(eventKey));
 if(!exact.length)return null;
 const latest=Math.max(...exact.map(x=>dt(x.doc.reportPublishedAt)));
 const report=exact.filter(x=>dt(x.doc.reportPublishedAt)===latest);
 if(new Set(report.map(x=>x.doc.sourceResponseSha256)).size!==1)return null;
 if(report.some(x=>x.doc.notSubmitted?.some(r=>r.date===day&&r.match===match&&r.team===player.team)))return null;
 const matches=report.flatMap(x=>(x.doc.rows||[]).filter(r=>r.date===day&&r.match===match&&r.team===player.team&&
   nba.norm(r.player)===nba.norm(player.name)&&statuses.has(r.status)).map(r=>({r,x})));
 if(!matches.length||new Set(matches.map(({r})=>r.status)).size!==1)return null;
 const {r,x}=matches[0];
 return {status:r.status,receiptDigest:x.digest,availableAt:x.first,reportPublishedAt:x.doc.reportPublishedAt,
   positiveParticipationVerified:false};
}
module.exports={collect,statusFor};
