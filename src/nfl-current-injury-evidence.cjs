"use strict";
// Point-in-time, official-report-derived NFL statuses. Never treat missing
// injury rows, practice participation or a blank status as medical clearance.
const team=x=>({LAR:"LA",AZ:"ARI",WSH:"WAS",JAC:"JAX"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
const time=x=>typeof x==="string"?Date.parse(x):NaN;
function attachNflAvailability(p,report,now){
 const at=time(now),start=time(p.eventStartsAt),captured=time(report?.capturedAt);
 const unknown={status:"unknown",source:"none_verified",freshReport:false,blocksResearch:false,medicalClearanceVerified:false};
 const direct=report?.kind==="nfl_first_party_published_game_status_v1",derived=report?.kind==="nflverse_official_report_derived_injuries_v1";
 if(!(direct||derived)||!Array.isArray(report.rows)||
 !Number.isFinite(at)||!Number.isFinite(start)||start<=at||!Number.isFinite(captured)||captured>at||at-captured>12*3600000)return unknown;
 const matches=report.rows.filter(x=>x.gsisId===p.historicalPlayerId&&team(x.team)===team(p.team)&&x.season===p.season&&x.week===p.week&&
 Number.isFinite(time(x.modifiedAt))&&time(x.modifiedAt)<=captured&&captured-time(x.modifiedAt)<=72*3600000);
 if(matches.length!==1)return {...unknown,source:direct?"official_nfl_published_report":"official_report_derived_feed",freshReport:true,blocksResearch:matches.length>1,status:matches.length>1?"ambiguous":"unknown"};
 const r=matches[0],status=r.status;
 const knownRisk=["out","doubtful","questionable","ambiguous","did_not_participate","probable","report_status_unconfirmed"];
 if(!knownRisk.includes(status))return {...unknown,freshReport:true,source:direct?"official_nfl_published_report":"official_report_derived_feed",status:"unrecognized",blocksResearch:true};
 return {status,source:direct?"NFL.com_published_game_status":"nflverse_official_report_derived",freshReport:true,reportedAt:r.modifiedAt,officialReportDerived:true,firstPartyPublishedStatus:direct,
  blocksResearch:knownRisk.includes(status),
  medicalClearanceVerified:false,activeGameRosterVerified:false};
}
module.exports={attachNflAvailability};
