"use strict";
// Retrospective line-to-stat matching. No original app settlement or model decisions.
const fs=require("node:fs");
const {readPinned,audit:crosswalk}=require("./nba-archived-three-source-crosswalk.cjs");
const core=require("../src/nba-research-pipeline-v1.cjs"),{official}=require("./grade-nba-frozen-research-v1.cjs");
const dt=Date.parse,valid=t=>typeof t==="string"&&Number.isFinite(dt(t)),team=core.teams,name=core.norm;
const counts=["points","rebounds","assists","threePointersMade","steals","blocks","turnovers"];
const whole=x=>Number.isInteger(x)&&x>=0;
function officialFinal(doc,g,at){
 const x=doc?.game;
 if(team(x?.homeTeam?.teamTricode)!==g.home||team(x?.awayTeam?.teamTricode)!==g.away)return null;
 const rows=official(doc,g.gameId,g.startAt,at);if(!rows)return null;
 const out=[];
 for(const t of [x.homeTeam,x.awayTeam])for(const p of t.players){
  const stats=rows.get(p.personId),n=name([p.firstName,p.familyName].filter(Boolean).join(" "));
  if(stats&&n)out.push({...stats,name:n,nativeId:String(p.personId),source:"NBA"});
 }
 return out.length?out:null;
}
function espnGame(e,g){
 const c=e?.competitions?.[0],home=c?.competitors?.filter(x=>x.homeAway==="home"),away=c?.competitors?.filter(x=>x.homeAway==="away");
 return !!(c&&home?.length===1&&away?.length===1&&team(home[0].team?.abbreviation)===g.home&&team(away[0].team?.abbreviation)===g.away&&valid(c.date)&&Math.abs(dt(c.date)-dt(g.startAt))<=300000&&c.status?.type?.completed===true&&c.status?.type?.name==="STATUS_FINAL");
}
function espnFinal(doc,g,eventId){
 if(String(doc?.header?.id)!==eventId||!espnGame(doc.header,g)||!Array.isArray(doc.boxscore?.players))return null;
 const result=[],seen=new Set();
 for(const t of doc.boxscore.players){
  const tm=team(t.team?.abbreviation);
  if(![g.home,g.away].includes(tm))return null;
  for(const group of t.statistics||[]){
   if(!Array.isArray(group.labels)||!Array.isArray(group.athletes))continue;
   const keys=["PTS","REB","AST","3PT","STL","BLK","TO"];
   if(!keys.every(k=>group.labels.filter(x=>x===k).length===1))continue;
   for(const p of group.athletes){
    if(p.didNotPlay!==false||!Array.isArray(p.stats)||p.stats.length!==group.labels.length)continue;
    const id=String(p.athlete?.id||""),n=name(p.athlete?.displayName);
    if(!/^\d+$/.test(id)||!n||seen.has(id))return null;
    const vals=keys.map(k=>p.stats[group.labels.indexOf(k)]);
    if(!/^\d+-\d+$/.test(String(vals[3])))continue;
    const [made,attempts]=String(vals[3]).split("-").map(Number);
    if(made>attempts||!vals.filter((_,i)=>i!==3).every(x=>/^\d+$/.test(String(x))))continue;
    const v=vals.map((x,i)=>i===3?made:Number(x));if(!v.every(whole))continue;
    const s=Object.fromEntries(counts.map((k,i)=>[k,v[i]]));
    seen.add(id);result.push({name:n,nativeId:id,source:"ESPN",team:tm,...s,pointsReboundsAssists:s.points+s.rebounds+s.assists,pointsRebounds:s.points+s.rebounds,pointsAssists:s.points+s.assists,reboundsAssists:s.rebounds+s.assists});
   }
  }
 }
 return [g.home,g.away].every(tm=>result.filter(x=>x.team===tm).length>=5)?result:null;
}
function reconcile(offers,finals){
 const rows=[],bySource={},marketCounts={},missing={noFinal:0,identity:0,unsupportedMarket:0,disagreement:0};
 const seen=new Set();
 for(const p of offers){
  const k=JSON.stringify([p.sourceOfferId,p.offeredSide]);if(seen.has(k))throw Error("duplicate directional offer");seen.add(k);
  const f=finals.get(p.gameId);if(!f?.nba&&!f?.espn){missing.noFinal++;continue;}
  const matches=(a)=>a?.filter(x=>x.team===p.team&&x.name===name(p.player))||[];
  const n=matches(f.nba),e=matches(f.espn);
  if((f.nba&&(n.length!==1||Number(n[0].nativeId)!==p.playerId))||(f.espn&&e.length!==1)){missing.identity++;continue;}
  const x=n[0]||e[0];if(!x){missing.identity++;continue;}
  if(p.market==="prizePicksFantasyScore"){missing.unsupportedMarket++;continue;}
  if(!whole(x[p.market])){missing.unsupportedMarket++;continue;}
  if(n.length&&e.length&&(!whole(e[0][p.market])||n[0][p.market]!==e[0][p.market])){missing.disagreement++;continue;}
  const source=n.length&&e.length?"NBA_and_ESPN":n.length?"NBA":"ESPN_conditional",actual=x[p.market];
  const outcome=actual===p.line?"Push":actual>p.line?"Higher":"Lower";
  rows.push({sourceOfferId:p.sourceOfferId,playerIdCandidate:p.playerId,gameId:p.gameId,gameStartAt:p.gameStartAt,market:p.market,line:p.line,tier:p.tier,offeredSide:p.offeredSide,sourceObservedAt:p.sourceObservedAt,actual,actualOutcome:outcome,statSource:source,officialPlayerIdMatched:n.length===1,sourceNativePlayerId:x.nativeId,sourceNativePlayerIdNamespace:n.length?"nba":"espn",researchOnly:true,platformSettlementVerified:false});
  bySource[source]=(bySource[source]||0)+1;marketCounts[p.market]=(marketCounts[p.market]||0)+1;
 }
 return {rows,summary:{registeredSides:offers.length,matchedStatSides:rows.length,distinctMatchedOffers:new Set(rows.map(x=>x.sourceOfferId)).size,bySource,marketCounts,missing,officialIdMatchedSides:rows.filter(x=>x.officialPlayerIdMatched).length}};
}
async function get(url,client=fetch){
 const r=await client(url,{headers:{Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error("HTTP_"+r.status);const raw=await r.text();if(raw.length>5_000_000)throw Error("source_bound");return JSON.parse(raw);
}
async function run(sc,bdl,board,history,client=fetch){
 const check=crosswalk(sc,bdl,board);
 if(check.counts.uniqueScheduleMatches!==sc.games.length)throw Error("unverified schedule crosswalk");
 if(history?.kind!=="nba_historical_mirror_research_v1"||!Array.isArray(history.rows)||dt(history.capturedAt)>dt(board.capturedAt))throw Error("invalid pre-board history");
 const h=core.indexHistory([history]),offers=core.board(board,h,sc,board.capturedAt);
 const now=new Date().toISOString(),finals=new Map(),diagnostics={nbaFinalGames:0,espnFinalGames:0,dualSourceGames:0,freeRequests:0};
 let events=[];
 try{diagnostics.freeRequests++;const date=bdl.date.replace(/-/g,"");const d=await get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+date,client);events=Array.isArray(d.events)?d.events:[];}catch{}
 for(const g of sc.games){
  if(dt(now)<dt(g.startAt)+3*3600000)continue;
  let nba=null,espn=null;
  try{diagnostics.freeRequests++;nba=officialFinal(await get("https://cdn.nba.com/static/json/liveData/boxscore/boxscore_"+String(g.gameId).padStart(10,"0")+".json",client),g,now);}catch{}
  const event=events.filter(e=>espnGame(e,g)&&/^\d+$/.test(String(e.id)));
  if(event.length===1)try{diagnostics.freeRequests++;const id=String(event[0].id);espn=espnFinal(await get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event="+id,client),g,id);}catch{}
  if(nba)diagnostics.nbaFinalGames++;if(espn)diagnostics.espnFinalGames++;if(nba&&espn)diagnostics.dualSourceGames++;finals.set(g.gameId,{nba,espn});
 }
 const out=reconcile(offers,finals);
 return {kind:"nba_archived_individual_line_stat_reconciliation_v1",generatedAt:now,boardCapturedAt:board.capturedAt,summary:{...out.summary,...diagnostics},rows:out.rows,retrospectiveOnly:true,platformSettlementVerified:false,originalAppAvailabilityVerified:false,modelAccuracyMeasured:false,rawRowsPublished:0,paidRequests:0};
}
if(require.main===module)(async()=>{const [a,ah,b,bh,c,ch,d,dh,out]=process.argv.slice(2);const r=await run(readPinned(a,ah),readPinned(b,bh),readPinned(c,ch),readPinned(d,dh));fs.writeFileSync(out,JSON.stringify(r)+"\n",{flag:"wx",mode:0o600});const {rows,...summary}=r;console.log(JSON.stringify(summary));})().catch(()=>{console.error("Individual line-stat reconciliation failed closed");process.exitCode=1;});
module.exports={officialFinal,espnGame,espnFinal,reconcile,run};
