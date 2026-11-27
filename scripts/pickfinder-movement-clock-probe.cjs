'use strict';
const {readSections}=require('./pickfinder-player-research.cjs');
const {profileMarketEvidence}=require('./pickfinder-profile-market-evidence.cjs');
const ZONES=['UTC','America/Los_Angeles'];
const fingerprint=r=>JSON.stringify([r.book,r.quoteLine,r.higher,r.lower]);
function profileLabels(sport,player){
 if(typeof player!=='string'||!player.trim())return [];
 const exact=player.trim(),base=sport==='tennis'&&/^(.+?)\s+\(#[1-9]\d{0,5}\)$/.exec(exact)?.[1].trim();
 return base?[exact,base]:[exact];
}

function select(receipts,at,prior=[]){
 const cutoff=Date.parse(at),groups=new Map();
 const attempted=new Set(probeRecords(prior,cutoff).flatMap(record=>{
  // Retry only the known ranked-label mismatch, once. Do not repeat a sampled table.
  const retryable=profileLabels(record.sport,record.player).length===2&&record.observations.length>0&&
   record.observations.every(o=>o.phase==='player_not_visible'&&o.profileLabelStrategy!==2&&o.sampled!==true&&!o.rows?.length);
  return retryable?[]:record.observations.map(o=>o.detailId);
 }));
 for(const {doc,first,digest} of receipts){
  if(doc.schema!=='pickfinder_profile_historical_sportsbook_recovery_v1'||!Number.isFinite(Date.parse(first))||Date.parse(first)>cutoff)continue;
  for(const r of doc.rows||[]){
   const observed=Date.parse(r.observedAt);
   if(r.kind!=='historical_sportsbook_quote'||!Number.isFinite(observed)||observed>cutoff||
     cutoff-observed>48*3600000||!r.higher||!r.lower||!Number.isFinite(r.quoteLine)||typeof r.detailId!=='string'||!URL.canParse(r.detailId,'https://www.pickfinder.app'))continue;
   const u=new URL(r.detailId,'https://www.pickfinder.app'),prop=u.searchParams.getAll('prop');
   if(u.origin!=='https://www.pickfinder.app'||!/^\/players\/[a-z0-9_]+\/[a-z0-9_-]+$/i.test(u.pathname)||
     u.pathname.split('/')[2]!==r.sport||u.hash||prop.length!==1||[...u.searchParams].length!==1||
     prop[0].split(':').length!==4||prop[0].split(':')[1]!==r.market||prop[0].split(':')[2]!==r.eventId)continue;
   const detailId=u.pathname+u.search;
   if(attempted.has(detailId))continue;
   const g=groups.get(detailId)||{target:{sport:r.sport,player:r.player,eventId:r.eventId,
    market:r.market,detailId,referenceDigest:digest},latest:0,pairs:new Set()};
   g.latest=Math.max(g.latest,observed);
   g.pairs.add(fingerprint(r));
   groups.set(detailId,g);
  }
 }
 const ranked=[...groups.values()].sort((a,b)=>b.pairs.size-a.pairs.size||b.latest-a.latest||
  a.target.detailId.localeCompare(b.target.detailId)).map(g=>g.target);
 if(ranked.length<2)return ranked;
 // Do not spend both bounded attempts on one sport's potentially unavailable UI layout.
 return [ranked[0],ranked.find(x=>x.sport!==ranked[0].sport)||ranked[1]];
}

function normalizeDisplayedClock(value){
 const m=typeof value==='string'&&/^(0?[1-9]|1[012])\/(0?[1-9]|[12]\d|3[01]) (0?[1-9]|1[012]):([0-5]\d) ?(AM|PM)$/.exec(value);
 return m?Number(m[1])+'/'+Number(m[2])+' '+Number(m[3])+':'+m[4]+m[5]:null;
}
function utcCandidates(value,at){
 const match=/^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d\d)(AM|PM)$/.exec(value);
 if(!match)return [];
 const [,mm,dd,hh,min,period]=match,year=new Date(at).getUTCFullYear(),out=[];
 for(const y of [year-1,year,year+1]){
  const d=new Date(Date.UTC(y,Number(mm)-1,Number(dd),Number(hh)%12+(period==='PM'?12:0),Number(min)));
  if(d.getUTCMonth()===Number(mm)-1&&d.getUTCDate()===Number(dd)&&d.getTime()<=at&&at-d.getTime()<14*86400000)out.push(d);
 }
 return out;
}

function render(date,zone){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(date).map(x=>[x.type,x.value]));
 return p.month+'/'+p.day+' '+p.hour+':'+p.minute+p.dayPeriod;
}

function matchedPairs(observations){
 if(!Array.isArray(observations)||observations.length!==2)return null;
 const [a,b]=observations,firstAt=Date.parse(a.observedAt),secondAt=Date.parse(b.observedAt);
 if(typeof a.detailId!=='string'||a.detailId!==b.detailId||a.zone!==ZONES[0]||b.zone!==ZONES[1]||
    a.browserZone!==a.zone||b.browserZone!==b.zone||a.sampled!==true||b.sampled!==true||
    !Array.isArray(a.rows)||!Array.isArray(b.rows)||![firstAt,secondAt].every(Number.isFinite)||
    secondAt<firstAt||secondAt-firstAt>120000)return null;
 const unique=rows=>{
  const groups=new Map();
  for(const r of rows){
   if(!r.higher||!r.lower||!Number.isFinite(r.quoteLine)||!r.book||
      !normalizeDisplayedClock(r.displayedMovementClock))continue;
   const k=fingerprint(r),g=groups.get(k)||[];g.push(r);groups.set(k,g);
  }
  return groups;
 };
 const first=unique(a.rows),second=unique(b.rows),matches=[];
 for(const [k,x] of first){
  const y=second.get(k);
  if(x.length!==1||y?.length!==1)continue;
  const src=normalizeDisplayedClock(x[0].displayedMovementClock),dst=normalizeDisplayedClock(y[0].displayedMovementClock);
  const shifted=src!==dst&&utcCandidates(src,firstAt).filter(d=>render(d,b.zone)===dst).length===1;
  matches.push({key:JSON.stringify([a.detailId,x[0].book,x[0].quoteLine]),shifted,unchanged:src===dst});
 }
 return matches;
}

function compare(observations){
 const matches=matchedPairs(observations);
 if(!matches)return {state:'incomplete'};
 const matched=matches.length,shifted=matches.filter(x=>x.shifted).length,unchanged=matches.filter(x=>x.unchanged).length;
 return aggregate([{matched,shifted,unchanged}]);
}

function probeRecords(documents,cutoff){
 return documents.filter(d=>d.schema==='pickfinder-movement-clock-probe-v1'&&
   Date.parse(d.observedAt)<=cutoff&&cutoff-Date.parse(d.observedAt)<=48*3600000&&Array.isArray(d.records))
  .flatMap(d=>d.records.filter(r=>Array.isArray(r.observations)));
}

function combineProbeReceipts(documents,at){
 const groups=new Map();
 for(const r of probeRecords(documents,Date.parse(at))){
  for(const match of matchedPairs(r.observations)||[]){
   const states=groups.get(match.key)||new Set();
   states.add(match.shifted?'shifted':match.unchanged?'unchanged':'other');
   groups.set(match.key,states);
  }
 }
 return aggregate([...groups.values()].map(states=>({matched:1,
  shifted:Number(states.size===1&&states.has('shifted')),unchanged:Number(states.size===1&&states.has('unchanged'))})));
}

function aggregate(records){
 const totals={matched:0,shifted:0,unchanged:0};
 for(const r of records)for(const key of Object.keys(totals))totals[key]+=r[key]||0;
 const {matched,shifted,unchanged}=totals;
 return {...totals,state:matched>=2&&shifted===matched?'browser_local_candidate':
  matched>=2&&unchanged===matched?'fixed_zone_candidate':'inconclusive'};
}
async function observe({targets,open,alive,write,premium,origin,prior=[]}){
 const byTarget=targets.map(()=>[]);
 for(const zone of ZONES){
  if(!alive()||!targets.length)break;
  if(zone===ZONES[1]&&!byTarget.some(list=>list[0]?.rows.some(r=>r.higher&&r.lower)))break;
  const {page,context}=await open(zone);
  try{
   for(const [i,target] of targets.entries()){
    if(!alive())break;
    if(zone===ZONES[1]&&!byTarget[i][0]?.rows.some(r=>r.higher&&r.lower))continue;
    const observedAt=new Date().toISOString(),detailId=target.detailId;
    let rows=[],sampled=false,browserZone=null,phase='navigation_unavailable';
    try{
     const exact=origin+detailId;
     await page.goto(exact,{timeout:10000});
     await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});
     if(page.url()!==exact||!await premium(page)){
      byTarget[i].push({detailId,zone,browserZone,observedAt,sampled,rows,phase:'exact_premium_profile_unavailable'});
      continue;
     }
     phase='player_not_visible';
     const labels=profileLabels(target.sport,target.player);
     if((await Promise.all(labels.map(text=>page.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:5000}).then(()=>true,()=>false)))).some(Boolean)){
      const button=page.getByRole('button',{name:'Line Movement',exact:true});
      phase='movement_button_unavailable';
      if(await button.count()===1){
       phase='movement_table_unavailable';
       await button.click({timeout:5000});
       await page.getByRole('columnheader',{name:'Time',exact:true}).first().waitFor({state:'visible',timeout:4000});
       browserZone=await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
       const fields=await page.evaluate(readSections,{origin:'line_movement',tab:'Line Movement',observedAt,context:{}});
       rows=fields.flatMap(f=>profileMarketEvidence({...target,status:'sampled'},f,'0'.repeat(64),observedAt,observedAt))
        .slice(0,100).map(({book,quoteLine,higher,lower,displayedMovementClock})=>({book,quoteLine,higher,lower,displayedMovementClock}));
       sampled=true;
       phase=rows.length?'movement_table_sampled':'movement_table_no_exact_pairs';
      }
     }
    }catch{if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
    byTarget[i].push({detailId,zone,browserZone,observedAt,sampled,rows,phase,profileLabelStrategy:2});
   }
  }finally{await context.close();}
 }
 const records=byTarget.map((observations,i)=>({sport:targets[i].sport,player:targets[i].player,
  sourceEventId:targets[i].eventId,referenceDigest:targets[i].referenceDigest,observations,...compare(observations)}));
 const summary=aggregate(records),observedAt=new Date().toISOString();
 const receipt={schema:'pickfinder-movement-clock-probe-v1',observedAt,records,summary};
 const recentComparison=combineProbeReceipts([...prior,receipt],observedAt);
 await write({...receipt,recentComparison,
  providerDisplayZoneVerified:false,modelInputsApproved:false});
 return {targets:targets.length,observations:byTarget.flat().length,states:records.map(x=>x.state),summary,recentComparison};
}
module.exports={select,compare,aggregate,combineProbeReceipts,observe,profileLabels};
