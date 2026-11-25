'use strict';
// Public schedules and explicitly authorized no-charge fixture access only.
// Incomplete league coverage never establishes a sport-wide offseason.
const {registry}=require('./season-aware-collection.cjs');
const {pandaFixture}=require('./esports-free-source-adapters.cjs');
const espn={NBA:'basketball/nba',NFL:'football/nfl',NHL:'hockey/nhl',MLB:'baseball/mlb',WNBA:'basketball/wnba',CFB:'football/college-football',CBB:'basketball/mens-college-basketball',TENNIS:'tennis/atp',SOCCER:'soccer/eng.1'};
const panda={CS2:'csgo',DOTA2:'dota2',VAL:'valorant',LOL:'lol',COD:'codmw'};
async function json(url,headers,client){
 const r=await client(url,{headers:{Accept:'application/json',...headers},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok||!r.body)throw Error('http_'+r.status);
 const reader=r.body.getReader(),parts=[];let size=0;
 try{for(;;){const q=await reader.read();if(q.done)break;size+=q.value.length;if(size>4e6){await reader.cancel();throw Error('schedule bound');}parts.push(Buffer.from(q.value));}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(parts).toString());
}
async function discover({env=process.env,now=new Date(),client=fetch}={}){
 const at=now.toISOString(),end=new Date(+now+48*3600000).toISOString(),day=s=>s.slice(0,10).replaceAll('-','');
 const result=Object.fromEntries(Object.keys(registry).map(code=>[code,{status:'unavailable',source:'not_configured',observedAt:at,coverageUntil:end,upcoming:0,complete:false}]));
 await Promise.all(Object.entries(espn).map(async([code,league])=>{
  try{
   const d=await json('https://site.api.espn.com/apis/site/v2/sports/'+league+'/scoreboard?dates='+day(at)+'-'+day(end)+'&limit=100',{},client);
   if(!Array.isArray(d.events))throw Error('schedule envelope');
   const upcoming=d.events.filter(e=>e?.id&&Number.isFinite(Date.parse(e.date))&&Date.parse(e.date)>=+now&&Date.parse(e.date)<=Date.parse(end)&&e.status?.type?.state==='pre').length;
   result[code]={status:'ok',source:'espn:'+league,observedAt:at,coverageUntil:end,upcoming,complete:false};
  }catch(e){result[code].source='espn:'+league;result[code].failure=/^http_\d{3}$/.test(e.message)?e.message:'network_or_schema';}
 }));
 // Official key-free NHL schedule fallback, only positive dated competition evidence.
 if(result.NHL.status!=='ok'||result.NHL.upcoming===0){
  try{
   const d=await json('https://api-web.nhle.com/v1/schedule/'+at.slice(0,10),{},client);
   if(!Array.isArray(d.gameWeek)||!d.gameWeek.length||d.gameWeek.some(x=>!Array.isArray(x.games)))throw Error('schedule envelope');
   const games=d.gameWeek.flatMap(x=>x.games);
   const upcoming=new Set(games.filter(g=>Number.isSafeInteger(g.id)&&['FUT','PRE'].includes(g.gameState)&&Date.parse(g.startTimeUTC)>=+now&&Date.parse(g.startTimeUTC)<=Date.parse(end)).map(g=>g.id)).size;
   result.NHL={status:'ok',source:'nhl:official_week',observedAt:at,coverageUntil:end,upcoming,complete:false};
  }catch(e){result.NHL.fallbackFailure=/^http_\d{3}$/.test(e.message)?e.message:'network_or_schema';}
 }
 const key=env.PANDASCORE_API_KEY||env.PANDASCORE_TOKEN||env.PANDASCORE;
 if(key&&env.PANDASCORE_BETTING_DATA_AUTHORIZED==='1'&&env.PANDASCORE_NO_CHARGE_CONFIRMED==='1'){
  // At most one page per title, sequential to honor provider rate limits. Never paid detail endpoints.
  for(const [code,league] of Object.entries(panda)){
   try{
    const d=await json('https://api.pandascore.co/'+league+'/matches/upcoming?per_page=20',{Authorization:'Bearer '+key},client);
    if(!Array.isArray(d))throw Error('schedule envelope');
    const title=code==='VAL'?'VALORANT':code;
    const upcoming=d.map(x=>pandaFixture(x,title,+now)).filter(f=>f&&f.status==='not_started'&&Date.parse(f.scheduledStartAt)>=+now&&Date.parse(f.scheduledStartAt)<=Date.parse(end)).length;
    result[code]={status:'ok',source:'pandascore:'+league,observedAt:at,coverageUntil:end,upcoming,complete:false};
   }catch{result[code].source='pandascore:'+league;}
  }
 }
 return result;
}
module.exports={discover};
if(require.main===module)discover().then(sports=>console.log(JSON.stringify({kind:'season_discovery_v1',sports,paidEndpointsCalled:0,originalOffersVerified:false,rawRowsPublished:0}))).catch(()=>{console.error('Season discovery failed');process.exitCode=1;});
