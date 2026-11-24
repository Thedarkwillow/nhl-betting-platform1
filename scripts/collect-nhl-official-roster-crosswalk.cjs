"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {parseNhlRosters,canonicalTeam}=require("../src/nhl-pregame-intel.cjs");
async function main(){
 const at=new Date().toISOString(),s=JSON.parse(await fs.readFile("outputs/official-nhl/season-schedules/2026-27.json","utf8"));
 if(s.complete!==true)throw Error("Complete official schedule required");
 const t=Date.parse(at),teams=[...new Set(s.games.filter(g=>Date.parse(g.startTimeUTC)>t&&Date.parse(g.startTimeUTC)-t<48*3600000).flatMap(g=>[canonicalTeam(g.home),canonicalTeam(g.away)]))];
 const payloads={},failed=[];
 for(const team of teams){
  if(!/^[A-Z]{3}$/.test(team))continue;
  try{const r=await fetch("https://api-web.nhle.com/v1/roster/"+team+"/20262027",{signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error("HTTP");const d=await r.json();if(!Array.isArray(d.forwards)||!Array.isArray(d.defensemen)||!Array.isArray(d.goalies))throw Error("schema");payloads[team]=d;
  }catch{failed.push(team);}
  await new Promise(r=>setTimeout(r,250));
 }
 const index=parseNhlRosters(payloads),rows=[];
 for(const [team,r] of Object.entries(index.byTeam))for(const [key,p] of r.players)if(!r.ambiguous.has(key))rows.push({team,playerId:p.playerId,name:p.name,type:p.type});
 if(!rows.length)throw Error("No official roster identities");
 const folder="outputs/pregame-availability",out={kind:"official_nhl_current_roster_crosswalk_v1",capturedAt:at,rows,teams:teams.length,failedTeams:failed.length,medicalClearanceVerified:false};
 await fs.mkdir(path.join(folder,"roster-snapshots"),{recursive:true});
 await fs.writeFile(path.join(folder,"roster-snapshots",at.slice(0,19).replace(/[-:]/g,"")+"Z.json"),JSON.stringify(out)+"\n",{flag:"wx"});
 await fs.writeFile(path.join(folder,"official-roster-crosswalk-latest.json"),JSON.stringify(out)+"\n");
 console.log(JSON.stringify({officialRosterTeams:Object.keys(index.byTeam).length,matchedRosterPlayers:rows.length,failedTeams:failed.length,medicalClearanceVerified:false}));
}
if(require.main===module)main().catch(()=>{console.error("Official NHL roster collection refused");process.exitCode=1;});
module.exports={main};
