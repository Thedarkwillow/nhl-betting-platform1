'use strict';
const {readSections}=require('./pickfinder-player-research.cjs');
const {profileMarketEvidence}=require('./pickfinder-profile-market-evidence.cjs');
const {select:selectGame}=require('./pickfinder-controlled-clock.cjs');
const ZONES=['UTC','America/Los_Angeles'];

function select(archive,at){
 const events=selectGame(archive,at);
 return [events.find(x=>x.sport==='nba'),events.find(x=>x.sport==='nfl')].filter(Boolean).map(x=>({
  ...x,market:new URL(x.detailId,'https://www.pickfinder.app').searchParams.get('prop').split(':')[1]
 }));
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

function compare(observations){
 const [a,b]=observations;
 if(observations.length!==2||a.detailId!==b.detailId||a.zone!==ZONES[0]||b.zone!==ZONES[1]||
    a.browserZone!==a.zone||b.browserZone!==b.zone||!a.sampled||!b.sampled||
    Math.abs(Date.parse(a.observedAt)-Date.parse(b.observedAt))>120000)return {state:'incomplete'};
 const key=r=>JSON.stringify([r.book,r.quoteLine,r.higher,r.lower]);
 const unique=rows=>{
  const groups=new Map();
  for(const r of rows){
   if(!r.higher||!r.lower)continue;
   const k=key(r),g=groups.get(k)||[];g.push(r);groups.set(k,g);
  }
  return groups;
 };
 const first=unique(a.rows),second=unique(b.rows);
 let matched=0,shifted=0,unchanged=0;
 for(const [k,x] of first){
  const y=second.get(k);
  if(x.length!==1||y?.length!==1)continue;
  matched++;
  const src=x[0].displayedMovementClock,dst=y[0].displayedMovementClock;
  if(src===dst){unchanged++;continue;}
  if(utcCandidates(src,Date.parse(a.observedAt)).filter(d=>render(d,b.zone)===dst).length===1)shifted++;
 }
 return {state:matched>=2&&shifted===matched?'browser_local_candidate':matched>=2&&unchanged===matched?'fixed_zone_candidate':'inconclusive',matched,shifted,unchanged};
}

async function observe({targets,open,alive,write,premium,origin}){
 const byTarget=targets.map(()=>[]);
 for(const zone of ZONES){
  if(!alive())break;
  const {page,context}=await open(zone);
  try{
   for(const [i,target] of targets.entries()){
    if(!alive())break;
    const observedAt=new Date().toISOString(),detailId=target.detailId;
    let rows=[],sampled=false,browserZone=null;
    try{
     const exact=origin+detailId;
     await page.goto(exact,{timeout:10000});
     await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});
     if(page.url()!==exact||!await premium(page))continue;
     if(await page.getByText(target.player,{exact:true}).first().waitFor({state:'visible',timeout:5000}).then(()=>true,()=>false)){
      const button=page.getByRole('button',{name:'Line Movement',exact:true});
      if(await button.count()===1){
       await button.click({timeout:5000});
       await page.getByRole('columnheader',{name:'Time',exact:true}).first().waitFor({state:'visible',timeout:4000});
       browserZone=await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
       const fields=await page.evaluate(readSections,{origin:'line_movement',tab:'Line Movement',observedAt,context:{}});
       rows=fields.flatMap(f=>profileMarketEvidence({...target,status:'sampled'},f,'0'.repeat(64),observedAt,observedAt))
        .slice(0,100).map(({book,quoteLine,higher,lower,displayedMovementClock})=>({book,quoteLine,higher,lower,displayedMovementClock}));
       sampled=true;
      }
     }
    }catch{if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
    byTarget[i].push({detailId,zone,browserZone,observedAt,sampled,rows});
   }
  }finally{await context.close();}
 }
 const records=byTarget.map((observations,i)=>({sport:targets[i].sport,player:targets[i].player,
  sourceEventId:targets[i].eventId,observations,...compare(observations)}));
 if(records.length)await write({schema:'pickfinder-movement-clock-probe-v1',observedAt:new Date().toISOString(),records,
  providerDisplayZoneVerified:false,modelInputsApproved:false});
 return {targets:targets.length,observations:byTarget.flat().length,states:records.map(x=>x.state)};
}
module.exports={select,compare,observe};
