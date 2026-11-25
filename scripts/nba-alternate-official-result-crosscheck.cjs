"use strict";
// Bounded alternate official NBA route. No bypass of access restrictions, no retries.
const {readPinned}=require("./nba-archived-three-source-crosswalk.cjs"),core=require("../src/nba-research-pipeline-v1.cjs");
const fields={points:"points",rebounds:"reboundsTotal",assists:"assists",threePointersMade:"threePointersMade",steals:"steals",blocks:"blocks",turnovers:"turnovers"};
function minutes(x){if(typeof x!=="string")return 0;const m=x.match(/^(\d{1,2}):(\d{2})$/);if(m&&+m[2]<60)return +m[1]+ +m[2]/60;return 0;}
function normalize(g,s,b){
 const a=s?.boxScoreSummary,t=b?.boxScoreTraditional;
 if(Number(a?.gameId)!==g.gameId||a.gameStatus!==3||Math.abs(Date.parse(a.gameTimeUTC)-Date.parse(g.startAt))>300000||!Number.isFinite(Date.parse(a.gameTimeUTC))||Number(t?.gameId)!==g.gameId)return null;
 const rows=new Map(),inactive=new Set();
 for(const [side,code] of [["homeTeam",g.home],["awayTeam",g.away]]){
  const x=a[side],y=t[side];if(core.teams(x?.teamTricode)!==code||core.teams(y?.teamTricode)!==code||!Number.isInteger(x?.teamId)||y.teamId!==x.teamId||!Array.isArray(y.players)||!Array.isArray(x.inactives)||!Number.isInteger(x.score)||x.score<=0)return null;
  for(const p of x.inactives){if(Number.isInteger(p.personId)&&p.personId>0)inactive.add(p.personId);}
  let sum=0,appeared=0;
  for(const p of y.players){
   if(!Number.isInteger(p.personId)||p.personId<=0||rows.has(p.personId))return null;
   const v=p.statistics;if(!v||minutes(v.minutes)<=0)continue;
   if(minutes(v.minutes)>70||!Object.values(fields).every(k=>Number.isInteger(v[k])&&v[k]>=0))return null;
   const r=Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,v[f]]));sum+=r.points;appeared++;
   rows.set(p.personId,{...r,team:code,name:core.norm([p.firstName,p.familyName].join(" ")),pointsReboundsAssists:r.points+r.rebounds+r.assists,pointsAssists:r.points+r.assists,pointsRebounds:r.points+r.rebounds,reboundsAssists:r.rebounds+r.assists});
  }
  if(sum!==x.score||appeared<5)return null;
 }
 if([...inactive].some(id=>rows.has(id)))return null;
 return {rows,inactive};
}
async function get(url,client){const r=await client(url,{headers:{Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("http_"+r.status);const s=await r.text();if(s.length>4e6)throw Error("bound");return JSON.parse(s);}
async function run(sc,board,hist,grades,client=fetch){
 const offers=core.board(board,core.indexHistory([hist]),sc,board.capturedAt),ids=new Map(offers.map(p=>[JSON.stringify([p.sourceOfferId,p.offeredSide]),p]));
 const counts={games:sc.games.length,officialFinalGames:0,officialCrossVerified:0,officialDisagreements:0,officialIdentityMissing:0,previouslyUnmatchedOfficialInactive:0,previouslyUnmatchedOfficialAppeared:0,requests:0,failures:{}};
 const matched=new Set(grades.rows.map(r=>JSON.stringify([r.sourceOfferId,r.offeredSide])));
 for(const g of sc.games){
  try{
   const id=String(g.gameId).padStart(10,"0");counts.requests++;
   const s=await get("https://stats.nba.com/stats/boxscoresummaryv3?GameID="+id,client);
   if(Number(s?.boxScoreSummary?.gameId)!==g.gameId||s.boxScoreSummary.gameStatus!==3)throw Error("not_confirmed_final");
   counts.requests++;const b=await get("https://stats.nba.com/stats/boxscoretraditionalv3?GameID="+id+"&StartPeriod=0&EndPeriod=0&StartRange=0&EndRange=0&RangeType=0",client);
   const f=normalize(g,s,b);if(!f)throw Error("official_schema_unverified");counts.officialFinalGames++;
   for(const r of grades.rows.filter(r=>r.gameId===g.gameId)){
    const p=ids.get(JSON.stringify([r.sourceOfferId,r.offeredSide])),x=p&&f.rows.get(p.playerId);
    if(!p||!x||x.team!==p.team||x.name!==core.norm(p.player)||!Number.isFinite(x[p.market])){counts.officialIdentityMissing++;continue;}
    counts[x[p.market]===r.actual?"officialCrossVerified":"officialDisagreements"]++;
   }
   for(const p of offers.filter(p=>p.gameId===g.gameId&&!matched.has(JSON.stringify([p.sourceOfferId,p.offeredSide])))){
    if(f.inactive.has(p.playerId))counts.previouslyUnmatchedOfficialInactive++;
    else {const x=f.rows.get(p.playerId);if(x&&x.team===p.team&&x.name===core.norm(p.player))counts.previouslyUnmatchedOfficialAppeared++;}
   }
  }catch(e){const k=/^http_\d+$/.test(e.message)||["not_confirmed_final","official_schema_unverified"].includes(e.message)?e.message:e.name==="TimeoutError"?"timeout":"unavailable";counts.failures[k]=(counts.failures[k]||0)+1;}
 }
 return {kind:"nba_alternate_official_result_crosscheck_v1",...counts,paidRequests:0,rawRowsPublished:0,platformSettlementVerified:false,modelPromoted:false};
}
if(require.main===module)(async()=>{const a=process.argv.slice(2);if(a.length!==8)throw Error();const d=[];for(let i=0;i<a.length;i+=2)d.push(readPinned(a[i],a[i+1]));console.log(JSON.stringify(await run(...d)));})().catch(()=>{console.error("Official result crosscheck failed closed");process.exitCode=1});
module.exports={normalize,run};
