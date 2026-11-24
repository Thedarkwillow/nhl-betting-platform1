"use strict";
/** Exact NHL player/game/time league-published injured/scratched flags.
 * Projected preview is not a confirmed active roster. No silent clearance.
 */
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
const t=x=>typeof x==="string"?Date.parse(x):NaN;
function review(p,preview,now){
 const at=t(now),start=t(p?.eventStartsAt),updated=t(preview?.capturedAt);
 const unknown=(reason)=>({status:"unverified",reason,blocksResearch:false,activeParticipationVerified:false});
 if(!Number.isFinite(at)||!Number.isFinite(start)||at>=start)return unknown("after_or_at_game_start");
 if(preview?.kind!=="nhl_league_published_pregame_status_v1"||!Array.isArray(preview.rows)||!Array.isArray(preview.sources)||
 !Number.isFinite(updated)||updated>at||at-updated>2*3600000)return unknown("official_preview_missing_or_stale");
 if(!Number.isInteger(p?.playerId)||!Number.isInteger(p?.gameId)||canonicalTeam(p.team)===canonicalTeam(p.opponent))return unknown("identity_or_team_invalid");
 const g=preview.sources.filter(x=>x.gameId===p.gameId&&/^https:\/\/www\.nhl\.com\//.test(x.url));
 if(g.length!==1)return unknown("official_game_preview_unmatched");
 const matches=preview.rows.filter(x=>x.playerId===p.playerId&&x.gameId===p.gameId&&canonicalTeam(x.team)===canonicalTeam(p.team)&&
 Number.isFinite(t(x.reportedAt))&&t(x.reportedAt)<=updated&&t(x.reportedAt)<start&&
 Math.abs(t(x.eventStartsAt)-start)<=300000);
 if(matches.length>1)return {status:"ambiguous",reason:"conflicting_preview_rows",blocksResearch:true,activeParticipationVerified:false};
 if(matches.length===0)return unknown("no_positive_availability_evidence");
 const status=String(matches[0].status).toLowerCase();
 if(["injured","scratched"].includes(status))return {status,reason:"official_published_injury_or_scratch",blocksResearch:true,
  activeParticipationVerified:false,sourceCapturedAt:preview.capturedAt,reportedAt:matches[0].reportedAt};
 return {status:"ambiguous",reason:"unrecognized_or_changed_official_pregame_status",blocksResearch:true,activeParticipationVerified:false};
}
module.exports={review};
