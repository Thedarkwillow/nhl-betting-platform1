"use strict";
// Conditional source cross-check, not a substitute for official schedule status or a frozen forecast.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {files,validate}=require("./private-source-history-connections.cjs");
const {readPinned}=require("./nba-archived-three-source-crosswalk.cjs");
const core=require("../src/nba-research-pipeline-v1.cjs");
const dt=Date.parse,et=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(t));
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const official="https://www.nba.com";
function links(html){
 const out=new Map();
 for(const m of html.matchAll(/(?:https:\/\/www\.nba\.com)?\/game\/([a-z]{3})-vs-([a-z]{3})-(002\d{7})(?!\d)/gi)){
  const away=m[1].toUpperCase(),home=m[2].toUpperCase(),id=m[3],k=away+"@"+home;
  const set=out.get(k)||new Set();set.add(id);out.set(k,set);
 }
 return out;
}
function pageTime(html,start,url){
 const u=new URL(url),id=u.pathname.split("-").at(-1);
 if(u.origin!==official||!/^\/game\/[a-z]{3}-vs-[a-z]{3}-002\d{7}$/.test(u.pathname))return false;
 // Require the page itself to reference its exact game route, not just an HTTP 200.
 if(!html.toLowerCase().includes(u.pathname.toLowerCase()))return false;
 const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|#160|#xA0);/gi," ").replace(/\s+/g," ");
 const expected=et(start),matches=new Set();
 for(const m of clean.matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+ET\b/g)){
  const hh=Number(m[4]),mm=Number(m[5]);if(hh<1||hh>12||mm>59)continue;
  matches.add(m[3]+"-"+String(MONTHS.indexOf(m[1])+1).padStart(2,"0")+"-"+m[2].padStart(2,"0")+" "+String(hh%12+(m[6]==="PM"?12:0)).padStart(2,"0")+":"+m[5]);
 }
 return matches.size===1&&matches.has(expected);
}
async function get(url,client=fetch){
 const r=await client(url,{redirect:"error",signal:AbortSignal.timeout(15000),headers:{Accept:"text/html","User-Agent":"NBA-schedule-research/1.0"}});
 if(!r.ok||!r.body)throw Error("http_"+r.status);
 const reader=r.body.getReader(),chunks=[];let n=0;
 try{for(;;){const q=await reader.read();if(q.done)break;n+=q.value.length;if(n>5e6){await reader.cancel();throw Error("body_bound");}chunks.push(Buffer.from(q.value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString("utf8");
}
function validateProvider(d,day,at){
 if(d?.kind!=="nba_bdl_daily_schedule_v1"||d.source!=="BALLDONTLIE"||d.date!==day||d.completePagination!==true||!Number.isFinite(dt(d.capturedAt))||dt(d.capturedAt)>dt(at)||!Array.isArray(d.rows)||!d.rows.length||d.rows.length>15)throw Error("provider schedule");
 const seen=new Set();
 for(const x of d.rows){const k=x.away+"@"+x.home;if(seen.has(k)||x.gameIdNamespace!=="balldontlie:nba"||!/^\d+$/.test(x.providerGameId)||!/^[A-Z]{3}$/.test(x.away)||!/^[A-Z]{3}$/.test(x.home)||x.away===x.home||!Number.isFinite(dt(x.startAt))||et(x.startAt).slice(0,10)!==day||x.status!=="scheduled"||dt(x.startAt)<=dt(at)+900000)throw Error("provider game");seen.add(k);}
 return d.rows;
}
async function corroborate(d,at,review,client=fetch){
 const day=et(at).slice(0,10),rows=validateProvider(d,day,at),found=links(review),matches=[],excluded={};let calls=0;
 for(const x of rows){
  const ids=found.get(x.away+"@"+x.home);
  if(!ids||ids.size!==1){excluded.missingUniqueOfficialLink=(excluded.missingUniqueOfficialLink||0)+1;continue;}
  const id=[...ids][0],url=official+"/game/"+x.away.toLowerCase()+"-vs-"+x.home.toLowerCase()+"-"+id;
  try{calls++;const html=await get(url,client);if(!pageTime(html,x.startAt,url)){excluded.pageTimeUnconfirmed=(excluded.pageTimeUnconfirmed||0)+1;continue;}
   matches.push({gameId:Number(id),home:x.home,away:x.away,startAt:x.startAt,status:1,sourceUrl:url,sourceResponseSha256:crypto.createHash("sha256").update(html).digest("hex"),officialStatusIndependentlyVerified:false});
  }catch(e){excluded.sourceUnavailable=(excluded.sourceUnavailable||0)+1;if(/http_(403|429)/.test(String(e.message)))break;}
 }
 return {matches,excluded,calls,providerStatusOnly:true};
}
function read(root,rel,sha){const p=path.join(root,rel);if(fs.realpathSync(p)!==p)throw Error("unsafe archive path");return readPinned(p,sha);}
async function main(root){
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git")))throw Error("private archive required");
 const at=new Date().toISOString(),day="2026-11-25";
 if(et(at).slice(0,10)!==day)throw Error("dated review cannot be reused");
 const review=fs.readFileSync(path.join(__dirname,"../docs/NBA_2026_11_25_OFFICIAL_SCHEDULE_REVIEW.md"),"utf8");
 const provider=read(root,"outputs/nba/authorized-providers/bdl-schedule/20261125T073623278Z.json","8a7e5cbae5783fae0e448562a656b8d6b949e88f");
 const board=read(root,"outputs/nba/boards/20261125T075816293Z.json","156b81e7a04166acf05d14ce1549dc630d17a511");
 const x=await corroborate(provider,at,review);
 const hist=core.indexHistory(files.map(([s,n,h])=>{const rel="outputs/nba/history/"+s+"/"+n,raw=fs.readFileSync(path.join(root,rel));validate(raw,s,h);return JSON.parse(raw);}));
 // Archived board comparison is diagnostic only. Use original capture clock, never publish individual lines.
 let eligible=0,ranked=0;
 if(x.matches.length===provider.rows.length&&dt(board.capturedAt)<dt(at)){
  const sc={games:x.matches};
  const offers=core.board(board,hist,sc,board.capturedAt);
  eligible=offers.length;ranked=core.rankings(offers,hist,sc,[],[],board.capturedAt).length;
 }
 return {kind:"nba_public_schedule_corroboration_diagnostic_v1",providerGames:provider.rows.length,officialPageTimeMatches:x.matches.length,excluded:x.excluded,publicPageRequests:x.calls,archivedBoardRows:board.rows.length,conditionalEligibleRows:eligible,conditionalRankedRows:ranked,officialScheduleStatusVerified:false,sourceClockReplayed:true,forecastFreezeVerified:false,originalAppAvailabilityVerified:false,paidRequests:0,rawRowsPublished:0};
}
if(require.main===module)main(fs.realpathSync(process.argv[2])).then(x=>{console.log(JSON.stringify(x));if(x.officialPageTimeMatches!==x.providerGames)process.exitCode=1;}).catch(()=>{console.error("Conditional schedule review failed closed");process.exitCode=1;});
module.exports={links,pageTime,validateProvider,corroborate};
