"use strict";
// Official league aggregate PP/PK rates, contemporaneous only. Never replay
// a season-to-date snapshot as if it existed before an earlier puck drop.
const fs=require("node:fs"),path=require("node:path");
const dt=Date.parse,num=Number.isFinite,norm=s=>String(s||"").normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
function normalize(summary,standings,at,season){
 if(!Array.isArray(summary?.data)||summary.total!==32||summary.data.length!==32||!Array.isArray(standings?.standings)||standings.standings.length!==32||!num(dt(at)))throw Error("Incomplete official team special-teams snapshot");
 const result={},used=new Set();for(const x of summary.data){
  const matches=standings.standings.filter(y=>norm(y.teamName?.default)===norm(x.teamFullName));
  if(matches.length!==1||!Number.isInteger(x.gamesPlayed)||x.gamesPlayed<1||matches[0].gamesPlayed!==x.gamesPlayed||!num(x.powerPlayPct)||!num(x.penaltyKillPct)||x.powerPlayPct<0||x.powerPlayPct>1||x.penaltyKillPct<0||x.penaltyKillPct>1)throw Error("Official team name, games or percentage units mismatch");
  const t=matches[0].teamAbbrev?.default;if(!/^[A-Z]{3}$/.test(t)||used.has(t))throw Error("Ambiguous team");used.add(t);
  result[t]={games:x.gamesPlayed,powerPlayEfficiency:x.powerPlayPct,penaltyKillEfficiency:x.penaltyKillPct};
 }
 return {kind:"official_nhl_special_teams_snapshot_v1",capturedAt:at,season,teams:result,fullLeague:true,seasonToDateOnly:true,source:"NHL Stats REST team summary joined to official standings"};
}
async function main(){const at=new Date(),year=at.getUTCFullYear()-(at.getUTCMonth()<6?1:0),season=year*10000+year+1;const fetchJSON=async url=>{const q=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!q.ok)throw Error("Official NHL source unavailable: "+q.status);return q.json();};
 const url="https://api.nhle.com/stats/rest/en/team/summary?"+new URLSearchParams({isAggregate:"false",isGame:"false",start:"0",limit:"50",cayenneExp:"seasonId="+season+" and gameTypeId=2"});
 const s=await fetchJSON(url),g=await fetchJSON("https://api-web.nhle.com/v1/standings/now"),t=new Date().toISOString(),d=normalize(s,g,t,season);
 const dir=path.resolve(__dirname,"../outputs/pregame-availability/special-teams");fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,t.replace(/[-:.]/g,"")+".json"),JSON.stringify(d,null,2)+"\n",{flag:"wx"});fs.writeFileSync(path.join(dir,"latest.json"),JSON.stringify(d,null,2)+"\n");console.log("Verified official PP/PK teams: "+Object.keys(d.teams).length);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={normalize,main};
