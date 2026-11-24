"use strict";
/** One-shot, read-only schema/availability probe: no persistence, no keys, no third-party content copying. */
const urls={
 injuries:"https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
 scoreboard:"https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=20261102",
 nhlRoster:"https://api-web.nhle.com/v1/roster/BOS/20262027"
};
function shape(v,depth=1){
 if(Array.isArray(v))return {type:"array",length:v.length,first:depth?shape(v[0],depth-1):typeof v[0]};
 if(!v||typeof v!=="object")return {type:typeof v};
 return Object.fromEntries(Object.keys(v).slice(0,28).map(k=>[k,
  depth?shape(v[k],depth-1):Array.isArray(v[k])?"array("+v[k].length+")":typeof v[k]]));
}
async function main(){
 for(const [name,url]of Object.entries(urls)){
  try{
   const res=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"NHL-model-availability-research/1.0"},signal:AbortSignal.timeout(15000)});
   const raw=await res.text();let data;
   try{data=JSON.parse(raw);}catch{data=null;}
   console.log(JSON.stringify({name,http:res.status,bytes:raw.length,
    schema:data?shape(data,3):"not_json",
    sample:name==="injuries"?shape(data?.injuries?.[0]?.injuries?.[0],3):
     name==="scoreboard"?shape(data?.events?.[0]?.competitions?.[0],3):null,
    competitor:name==="scoreboard"?shape(data?.events?.[0]?.competitions?.[0]?.competitors?.[0],3):null,
    reportStatus:name==="injuries"?[...new Set((data?.injuries||[]).flatMap(t=>(t.injuries||[]).map(p=>p.status)))].slice(0,24):null,
    goalieReports:name==="scoreboard"?(data?.events||[]).flatMap(e=>(e.competitions||[]).flatMap(comp=>
     (comp.competitors||[]).map(team=>({team:team.team?.abbreviation,
      eventState:e.status?.type?.state,
      goalie:team.probables?.map(p=>({name:p.athlete?.displayName,status:p.status,
       providerPlayerId:p.playerId,role:p.name}))})))).slice(0,12):null
   }));
  }catch(e){console.log(JSON.stringify({name,error:e.message}));}
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={shape,main};
