"use strict";
/** Phase-zero NBA source integrity. Attribution and first-Git provenance are
 * separate from proving a player will be active or a prop can be played. */
const KIND="nba_official_injury_point_in_time_preflight_v1";
const STATUS=new Set(["out","doubtful","questionable","probable","available","game-time decision"]);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const clean=x=>String(x??"").trim().toLowerCase().replace(/\s+/g," ");
const host=x=>{try{const u=new URL(x);return u.protocol==="https:"?u.hostname:"";}catch{return "";}};
function assess(r,{now}={}){
 const fail=reason=>({kind:KIND,usable:false,reason,mayBeUnavailable:true,
    officialIdentityIndependentlyAuthenticated:false,
    positiveActiveParticipationVerified:false,bettingEligible:false});
 const t=at(now),pub=at(r?.reportPublishedAt),obs=at(r?.capturedAt),
    git=at(r?.firstGitCommittedAt),start=at(r?.gameStartAt);
 const status=clean(r?.status);
 if(!Number.isInteger(r?.gameId)||r.gameId<=0||!Number.isInteger(r?.playerId)||
    r.playerId<=0||!r.team||!r.opponent||![t,pub,obs,git,start].every(Number.isFinite)||
    !STATUS.has(status)||r.source!=="NBA official injury report"||
    !["official.nba.com","ak-static.cms.nba.com"].includes(host(r.sourceDocumentUrl)))
  return fail("missing_exact_game_player_or_official_report_attribution");
 if(pub>obs||obs>git||git>t||obs>t||start-t<15*60000||
    obs-pub>6*3600000||t-obs>24*3600000||
    pub>=start||git>=start-15*60000)
  return fail("report_not_immutably_captured_before_nba_tip");
 const mayBeUnavailable=["out","doubtful","questionable","game-time decision"].includes(status);
 return {kind:KIND,usable:true,reason:mayBeUnavailable?
   "published_injury_or_uncertain_participation":"reported_available_not_activated",
   status,mayBeUnavailable,reportPublishedAt:r.reportPublishedAt,
   capturedAt:r.capturedAt,firstGitCommittedAt:r.firstGitCommittedAt,
   claimedGitClockSequenceConsistent:true,independentGitCommitProvenanceVerified:false,
   originalNBAPlayerGameIdentityNeedsIndependentReview:true,
   officialIdentityIndependentlyAuthenticated:false,
   positiveActiveParticipationVerified:false,bettingEligible:false};
}
function count(rows,now){
 const x=rows.map(r=>assess(r,{now}));
 return {kind:KIND,received:x.length,usable:x.filter(r=>r.usable).length,
  atRisk:x.filter(r=>r.usable&&r.mayBeUnavailable).length,
  unverified:x.filter(r=>!r.usable).length,
  officiallyConfirmedActive:0,prospectiveSelectionApproved:0,
  authenticatedPlatformOffers:0,placedWagers:0};
}
module.exports={KIND,STATUS,assess,count};
