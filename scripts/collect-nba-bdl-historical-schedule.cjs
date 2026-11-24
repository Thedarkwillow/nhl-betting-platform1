"use strict";
const fs=require("node:fs"),path=require("node:path"),{setTimeout:pause}=require("node:timers/promises");
const day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString().slice(0,10)===x;
const integer=x=>Number.isInteger(x)&&x>=0;
function normalize(g){
 if(!Number.isInteger(g.id)||g.id<=0||g.season!==2025||!day(g.date)||g.date<"2025-10-01"||g.date>"2026-04-30"||!Number.isFinite(Date.parse(g.datetime))||g.status_state!=="final"||g.postseason!==false||g.postponed!==false||!integer(g.home_team_score)||!integer(g.visitor_team_score)||!Number.isInteger(g.home_team?.id)||!Number.isInteger(g.visitor_team?.id)||g.home_team.id===g.visitor_team.id||!(/^[A-Z]{2,3}$/).test(g.home_team.abbreviation)||!(/^[A-Z]{2,3}$/).test(g.visitor_team.abbreviation))throw Error("invalid final regular-season identity");
 return {gameId:String(g.id),namespace:"balldontlie:nba",date:g.date,startsAt:g.datetime,home:g.home_team.abbreviation,away:g.visitor_team.abbreviation,homeId:g.home_team.id,awayId:g.visitor_team.id,homePoints:g.home_team_score,awayPoints:g.visitor_team_score};
}
function coverage(rows){
 const seen=new Set(),teams=new Map();for(const r of rows){if(seen.has(r.gameId))throw Error("duplicate game");seen.add(r.gameId);for(const id of [r.homeId,r.awayId])teams.set(id,(teams.get(id)||0)+1);}
 return {games:rows.length,teams:teams.size,expectedGames:1230,completeRegularSeasonCount:rows.length===1230&&teams.size===30&&[...teams.values()].every(x=>x===82)};
}
async function collect(key,{client=fetch,wait=pause}={}){
 if(!key)throw Error("missing BDL key");let cursor=null,requests=0;const cursors=new Set(),rows=[];
 do{
  if(requests>=18)throw Error("pagination cap");
  const url=new URL("https://api.balldontlie.io/v1/games");url.searchParams.set("seasons[]","2025");url.searchParams.set("per_page","100");if(cursor!==null)url.searchParams.set("cursor",String(cursor));
  const r=await client(url,{headers:{Authorization:key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(20000)});requests++;
  if(!r.ok)throw Error("BDL HTTP "+r.status);
  const d=await r.json();if(!Array.isArray(d.data)||d.data.length>100||!d.meta||(!("next_cursor" in d.meta)&&d.data.length===100))throw Error("incomplete pagination response");
  // Unfiltered non-preseason schedule includes regular-season Cup games. Exclude playoffs and Cup championship only.
  for(const g of d.data){if(g.season!==2025||typeof g.postseason!=="boolean")throw Error("invalid season scope");if(g.postseason||g.ist_stage==="Championship")continue;rows.push(normalize(g));}cursor=d.meta.next_cursor??null;
  if(cursor!==null){if(!Number.isInteger(cursor)||cursors.has(cursor))throw Error("invalid cursor");cursors.add(cursor);await wait(14000);}
 }while(cursor!==null);
 const c=coverage(rows);
 return {kind:"nba_bdl_historical_season_schedule_v1",source:"BALLDONTLIE",capturedAt:new Date().toISOString(),season:"2025-26",requests,paginationComplete:true,...c,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId)),playerStatsIncluded:false,officialIdCrosswalkVerified:false};
}
async function main(){const doc=await collect(process.env.NBA_BALLDONTLIE_API_KEY),root=path.resolve(__dirname,"../outputs/nba/authorized-providers/bdl-history");fs.mkdirSync(root,{recursive:true});const f=path.join(root,"2025-26-"+doc.capturedAt.replace(/[-:.]/g,"")+".json");fs.writeFileSync(f,JSON.stringify(doc)+"\n",{flag:"wx",mode:0o600});const {rows,...summary}=doc;console.log(JSON.stringify(summary));}
if(require.main===module)main().catch(e=>{console.error("Historical schedule stopped: "+e.message);process.exitCode=1;});
module.exports={normalize,coverage,collect};
