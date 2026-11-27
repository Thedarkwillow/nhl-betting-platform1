'use strict';
const game=require('./pickfinder-public-nba-context.cjs');
const ZONES=['UTC','America/Los_Angeles','America/New_York'];
const SPORTS=['nba','nhl','nfl'];
function select(archive,at){
 const q=game.queue(archive,[],at).pending, out=[];
 for(const sport of SPORTS){
  const seen=new Set();
  for(const t of q.filter(x=>x.sport===sport)){
   if(seen.has(t.eventId))continue;
   seen.add(t.eventId);out.push(t);
   if(seen.size===3)break;
  }
 }
 return out;
}
function selectProfiles(documents,prior,at){
 const end=Date.parse(at),groups=new Map(),out=[];
 if(!Number.isFinite(end))return out;
 for(const d of prior.filter(x=>x.schema==='pickfinder-controlled-clock-v1'))for(const r of d.records||[]){
  if(!r.routeVerified||!r.playerLabelVerified||!r.localMatchup||!ZONES.includes(r.requestedZone)||
     r.browserClock?.zone!==r.requestedZone||Date.parse(r.observedAt)>end)continue;
  const k=r.sport+'/'+r.eventId,z=groups.get(k)||new Set();z.add(r.requestedZone);groups.set(k,z);
 }
 const latest=new Map();
 for(const d of documents)for(const r of d.records||[]){
  const t=game.target(r),c=r.independentReconciliationContext,when=Date.parse(c?.observedAt);
  if(!t||!Number.isFinite(when)||when>end||end-when>3*3600000||c?.conflictingClock||c?.startAt||
     !c?.displayedMatchupLabel||!c.displayedLocalMatchup)continue;
  const key=t.sport+'/'+t.eventId;
  if(groups.get(key)?.size===ZONES.length)continue;
  const prev=latest.get(key);if(!prev||prev.when<when)latest.set(key,{...t,when});
 }
 for(const sport of SPORTS){const t=[...latest.values()].filter(x=>x.sport===sport).sort((a,b)=>b.when-a.when)[0];if(t){const {when,...target}=t;out.push(target);}}
 return out;
}
function clockAt(startAt,zone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(new Date(startAt)).map(x=>[x.type,x.value]));
 return {weekday:parts.weekday,hour:Number(parts.hour),minute:Number(parts.minute),dayPeriod:parts.dayPeriod};
}
function sameClock(a,b){return !!a&&!!b&&['weekday','hour','minute','dayPeriod'].every(k=>a[k]===b[k]);}
function classify(records,native){
 if(records.length!==3||new Set(records.map(r=>r.requestedZone)).size!==3||!ZONES.every(z=>records.some(r=>r.requestedZone===z)))return 'incomplete';
 const first=records[0];
 if(!records.every(r=>game.key(r)===game.key(first)&&r.detailId===first.detailId&&r.routeVerified&&r.playerLabelVerified&&r.browserClock?.zone===r.requestedZone&&r.localMatchup&&r.team===first.team&&r.opponent===first.opponent&&r.localMatchup.homeAway===first.localMatchup.homeAway))return 'ambiguous';
 if(!native||native.independentReviewVerified!==true||native.sport!==first.sport||native.providerEventId!==first.eventId||native.team!==first.team||native.opponent!==first.opponent||native.homeAway!==first.localMatchup.homeAway||!native.nativeEventId||!native.source||!Number.isFinite(Date.parse(native.startAt))||!records.every(r=>Date.parse(r.observedAt)<Date.parse(native.startAt)))return 'independent_schedule_required';
 if(records.some(r=>r.displayedClocks?.length&&r.startAt!==new Date(native.startAt).toISOString()))return 'conflicting_explicit_clock';
 if(records.every(r=>sameClock(r.localMatchup,clockAt(native.startAt,r.requestedZone))))return 'browser_local_matches_schedule';
 const fixed=ZONES.filter(z=>records.every(r=>sameClock(r.localMatchup,clockAt(native.startAt,z))));
 return fixed.length===1?'fixed_clock_candidate:'+fixed[0]:'conflicting_or_ambiguous';
}
async function observe({targets,open,alive,write,premium,origin}){
 let attempts=0;
 for(const zone of ZONES){
  if(!alive())break;
  const {page,context}=await open(zone);
  try{
   for(const t of targets){
    if(!alive())break;
    let snap={};
    try{
     await page.goto(origin+t.detailId,{timeout:10000});
     await page.getByRole('button',{name:'Open user menu'}).waitFor({timeout:10000});
     if(!await premium(page))throw Error('session unavailable');
     await page.getByText(t.player,{exact:true}).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
     snap=await page.evaluate(game.readVisible,{player:t.player,detailId:t.detailId});
    }catch{if(!await premium(page).catch(()=>false))throw Error('session unavailable');}
    const record={...game.normalize(t,snap,new Date().toISOString()),requestedZone:zone};
    await write({schema:'pickfinder-controlled-clock-v1',observedAt:record.observedAt,records:[record],providerDisplayZoneVerified:false,modelInputsApproved:false});
    attempts++;
   }
  }finally{await context.close();}
 }
 return {targets:targets.length,attempts,expected:targets.length*3,fullDesign:targets.length===9&&attempts===27,providerDisplayZoneVerified:false,modelInputsApproved:false};
}
module.exports={ZONES,select,selectProfiles,clockAt,classify,observe};
