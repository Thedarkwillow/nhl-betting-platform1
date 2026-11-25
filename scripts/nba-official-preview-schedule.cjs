"use strict";
// Free official HTML plus independent ESPN pregame schedule. No paid requests.
const crypto=require("node:crypto");
const {links,pageTime}=require("./nba-public-schedule-corroboration.cjs");
const {teams}=require("../src/nba-research-pipeline-v1.cjs");
const dt=Date.parse,hash=s=>crypto.createHash("sha256").update(s).digest("hex");
const et=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
function previewLinks(html){
 const out=new Set();
 for(const m of html.matchAll(/<a\b[^>]*\bhref=["']((?:https:\/\/www\.nba\.com)?\/game\/[a-z]{3}-vs-[a-z]{3}-002\d{7})(?:[?#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const content=m[2].replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
  if(/^Preview$/i.test(content))out.add(new URL(m[1],"https://www.nba.com").pathname);
 }
 return out;
}
function espnGames(doc,date,at){
 const out=[],seen=new Set();
 if(!Array.isArray(doc?.events)||doc.events.length>15)throw Error("independent schedule schema");
 for(const e of doc.events){
  const c=e.competitions?.[0],s=c?.status?.type;
  if(s?.name!=="STATUS_SCHEDULED"||s.state!=="pre"||s.completed!==false)continue;
  const home=c.competitors?.filter(x=>x.homeAway==="home"),away=c.competitors?.filter(x=>x.homeAway==="away"),start=c.date;
  if(home?.length!==1||away?.length!==1||c.competitors.length!==2||!Number.isFinite(dt(start))||et(start)!==date||dt(start)<=dt(at)+900000||!/^\d+$/.test(String(e.id)))continue;
  const h=teams(home[0].team?.abbreviation),a=teams(away[0].team?.abbreviation),k=a+"@"+h;
  if(!/^[A-Z]{3}$/.test(h)||!/^[A-Z]{3}$/.test(a)||h===a||seen.has(k))throw Error("ambiguous independent matchup");
  seen.add(k);out.push({home:h,away:a,startAt:start,espnEventId:String(e.id)});
 }
 return out;
}
async function get(url,client,accept){
 const r=await client(url,{redirect:"error",signal:AbortSignal.timeout(15000),headers:{Accept:accept,"User-Agent":"NBA schedule research/1.0"}});
 if(!r.ok)throw Error("schedule_http_"+r.status);
 const raw=await r.text();if(raw.length>8000000)throw Error("schedule response bound");return raw;
}
async function collect(date,at,client=fetch){
 if(et(at)!==date)throw Error("incorrect date");
 const sourceUrl="https://www.nba.com/games?date="+date;
 const raw=await get(sourceUrl,client,"text/html"),found=links(raw),previews=previewLinks(raw);
 if(!found.size||!previews.size)throw Error("no official preview routes");
 const espnUrl="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+date.replace(/-/g,"")+"&limit=100";
 const independentRaw=await get(espnUrl,client,"application/json"),rows=espnGames(JSON.parse(independentRaw),date,at);
 const games=[],excluded={noUniqueOfficialId:0,noPreview:0,clockMismatch:0};
 for(const x of rows){
  const ids=found.get(x.away+"@"+x.home);if(ids?.size!==1){excluded.noUniqueOfficialId++;continue;}
  const id=[...ids][0],route="/game/"+x.away.toLowerCase()+"-vs-"+x.home.toLowerCase()+"-"+id;
  if(!previews.has(route)){excluded.noPreview++;continue;}
  const url="https://www.nba.com"+route,html=await get(url,client,"text/html");
  if(!pageTime(html,x.startAt,url)){excluded.clockMismatch++;continue;}
  games.push({...x,gameId:Number(id),status:1,sourceUrl:url,sourceResponseSha256:hash(html),statusEvidence:"official dated preview link plus ESPN explicit scheduled status"});
 }
 if(!games.length||new Set(games.map(x=>x.gameId)).size!==games.length)throw Error("no verified upcoming matchups");
 const capturedAt=new Date().toISOString();
 if(et(capturedAt)!==date||games.some(g=>dt(g.startAt)<=dt(capturedAt)+900000))throw Error("schedule expired during capture");
 return {kind:"nba_official_schedule_v1",source:"NBA public preview plus ESPN explicit pregame",sourceUrl,independentSourceUrl:espnUrl,sourceResponseSha256:hash(raw),independentResponseSha256:hash(independentRaw),scope:"dated_preview_crosscheck",capturedAt,games,excluded,independentScheduledGames:rows.length,paidRequests:0,modelPromoted:false};
}
module.exports={previewLinks,espnGames,collect};
