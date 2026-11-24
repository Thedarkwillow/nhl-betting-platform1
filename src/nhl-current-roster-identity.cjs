"use strict";
const {nameKey,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const fold=x=>nameKey(x).replace(/ /g,"");
function uniqueRosterIdentity(source,prop,rosters,now){
 const at=dt(now),cap=dt(rosters?.capturedAt),start=dt(prop?.eventStartsAt),team=canonicalTeam(source?.team);
 if(rosters?.kind!=="official_nhl_current_roster_crosswalk_v1"||!Array.isArray(rosters.rows)||
  ![at,cap,start].every(Number.isFinite)||cap>at||at-cap>12*3600000||start<=at||
  team!==canonicalTeam(prop.team)||!Number.isInteger(prop.playerId))return false;
 const sourceName=nameKey(source.player),parts=sourceName.split(" ");
 const full=fold(sourceName),initial=parts.length>=2&&parts[0].length===1;
 if(!full)return false;
 const rows=rosters.rows.filter(r=>canonicalTeam(r.team)===team);
 const matches=rows.filter(r=>{
  const n=nameKey(r.name),words=n.split(" ");
  return fold(n)===full||(initial&&words.length>=2&&words[0][0]===parts[0]&&fold(words.slice(1).join(" "))===fold(parts.slice(1).join(" ")));
 });
 return matches.length===1&&matches[0].playerId===prop.playerId&&fold(matches[0].name)===fold(prop.player);
}
module.exports={uniqueRosterIdentity};
