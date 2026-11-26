'use strict';
// Bounded documented NBA endpoints; no proxy, credentials, bypass or paid API.
const {official}=require('./grade-nba-frozen-research-v1.cjs');
const {normalize}=require('./nba-alternate-official-result-crosscheck.cjs');
const core=require('../src/nba-research-pipeline-v1.cjs');
const dt=Date.parse,hash=require('node:crypto').createHash;
function parse(bytes,id,start,at){
 const d=JSON.parse(bytes);
 if(d.kind!=='nba_official_stats_v3_pair_v1')return official(d,id,start,at);
 if(dt(at)<=dt(start))return null;
 const s=JSON.parse(d.summaryRaw),b=JSON.parse(d.traditionalRaw),g=s.boxScoreSummary;
 const home=core.teams(g?.homeTeam?.teamTricode),away=core.teams(g?.awayTeam?.teamTricode);
 if(!home||!away||home===away||g.homeTeam.score===g.awayTeam.score)return null;
 const x=normalize({gameId:id,startAt:start,home,away},s,b);
 if(!x)return null;
 return new Map([...x.rows].map(([playerId,p])=>[playerId,{...p,playerId,gameId:id,officialGameFinalVerified:true,identityVerified:true,appeared:true,prizePicksFantasyScore:core.fantasy(p)}]));
}
async function fetchFinal(id,start,clock,client=fetch){
 const info={calls:0,failures:{},source:null,final:null};
 if(!Number.isSafeInteger(id)||!Number.isFinite(dt(start))||dt(clock)-dt(start)<3*3600000)return info;
 const record=k=>info.failures[k]=(info.failures[k]||0)+1;
 const key=String(id).padStart(10,'0');
 async function get(url,route){
  info.calls++;
  try{const r=await client(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});if(!r.ok){record(route+'_http_'+r.status);return null;}if(Number(r.headers.get('content-length'))>4e6){record(route+'_bound');return null;}const raw=await r.text();if(Buffer.byteLength(raw)>4e6){record(route+'_bound');return null;}JSON.parse(raw);return raw;}catch(e){record(route+(e.name==='TimeoutError'?'_timeout':'_unavailable'));return null;}
 }
 const live=await get('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_'+key+'.json','cdn');
 function accept(bytes,source){try{const observedAt=new Date().toISOString();if(bytes.length>4e6||!parse(bytes,id,start,observedAt)){record(source+'_schema_or_clock');return false;}info.source=source;info.final={bytes,observedAt,source};return true;}catch{record(source+'_schema_or_clock');return false;}}
 if(live&&accept(Buffer.from(live),'cdn'))return info;
 const summary=await get('https://stats.nba.com/stats/boxscoresummaryv3?GameID='+key,'summary');
 if(!summary)return info;
 const g=JSON.parse(summary)?.boxScoreSummary;
 if(Number(g?.gameId)!==id||g.gameStatus!==3||!Number.isFinite(dt(g.gameTimeUTC))||Math.abs(dt(g.gameTimeUTC)-dt(start))>300000){record('summary_schema_or_clock');return info;}
 const traditional=await get('https://stats.nba.com/stats/boxscoretraditionalv3?GameID='+key+'&StartPeriod=0&EndPeriod=0&StartRange=0&EndRange=0&RangeType=0','traditional');
 if(traditional)accept(Buffer.from(JSON.stringify({kind:'nba_official_stats_v3_pair_v1',summaryRaw:summary,traditionalRaw:traditional})),'stats_v3');
 return info;
}
module.exports={parse,fetchFinal};
