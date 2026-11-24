"use strict";
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
function applyNhlLeagueStatus(p,report,now){
 const t=Date.parse(now),cap=Date.parse(report?.capturedAt),start=Date.parse(p.eventStartsAt),unknown={status:"unknown",blocked:false,medicalClearanceVerified:false};
 if(report?.kind!=="nhl_league_published_pregame_status_v1"||!Array.isArray(report.rows)||!Array.isArray(report.sources)||
    ![t,cap,start].every(Number.isFinite)||cap>t||t-cap>6*3600000||start<=t||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
    !report.sources.some(x=>x.gameId===p.gameId&&typeof x.url==="string"&&x.url.startsWith("https://www.nhl.com/news/")))return unknown;
 const entries=report.rows.filter(x=>x.gameId===p.gameId&&x.playerId===p.playerId&&canonicalTeam(x.team)===canonicalTeam(p.team)&&
  x.eventStartsAt===p.eventStartsAt&&Number.isFinite(Date.parse(x.reportedAt))&&Date.parse(x.reportedAt)<=cap&&cap-Date.parse(x.reportedAt)<=36*3600000);
 if(entries.length!==1)return {...unknown,status:entries.length>1?"ambiguous":"unknown",blocked:entries.length>1};
 const status=entries[0].status;
 if(!["injured","scratched","ambiguous"].includes(status))return {...unknown,status:"unrecognized",blocked:true,leaguePublished:true};
 return {status,blocked:["injured","scratched","ambiguous"].includes(status),leaguePublished:true,reportedAt:entries[0].reportedAt,medicalClearanceVerified:false};
}
module.exports={applyNhlLeagueStatus};
