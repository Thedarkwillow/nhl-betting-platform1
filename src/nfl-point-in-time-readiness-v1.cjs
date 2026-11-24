"use strict";
/**
 * NFL player-prop live release proof. Nothing is promoted from an independent
 * board, a negative-only injury report, an unlicensed quote comparison, or an
 * empirical 20-game conditional model probability. Exact original market,
 * side, identity, schedule, date and source timing matter.
 */
const {attachNflAvailability}=require("./nfl-current-injury-evidence.cjs");
const KIND="nfl_point_in_time_prop_release_audit_v1";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const num=x=>typeof x==="number"&&Number.isFinite(x);
const same=(x,y)=>String(x||"").trim().toLowerCase()===String(y||"").trim().toLowerCase();
const first=(rows,test)=>{const found=(Array.isArray(rows)?rows:[]).filter(test);return found.length===1?found[0]:null};
// Exact official club hosts for first-party public practice reports. This is
// source identity vetting, NEVER positive game-day active roster clearance.
const CLUB_HOSTS=Object.freeze({
 ARI:"azcardinals.com",ATL:"atlantafalcons.com",BAL:"baltimoreravens.com",
 BUF:"buffalobills.com",CAR:"panthers.com",CHI:"chicagobears.com",
 CIN:"bengals.com",CLE:"clevelandbrowns.com",DAL:"dallascowboys.com",
 DEN:"denverbroncos.com",DET:"detroitlions.com",GB:"packers.com",
 HOU:"houstontexans.com",IND:"colts.com",JAX:"jaguars.com",KC:"chiefs.com",
 LV:"raiders.com",LAC:"chargers.com",LA:"therams.com",
 MIA:"miamidolphins.com",MIN:"vikings.com",NE:"patriots.com",
 NO:"neworleanssaints.com",NYG:"giants.com",NYJ:"newyorkjets.com",
 PHI:"philadelphiaeagles.com",PIT:"steelers.com",SF:"49ers.com",
 SEA:"seahawks.com",TB:"buccaneers.com",TEN:"tennesseetitans.com",
 WAS:"commanders.com"
});
function sameOfficialClubHost(url,team){
 try{
  const u=new URL(url),host=u.hostname.toLowerCase().replace(/^www\./,"");
  return u.protocol==="https:"&&!!CLUB_HOSTS[team]&&
   host===CLUB_HOSTS[team]&&/^\/(?:news|team)\//.test(u.pathname);
 }catch{return false;}
}
function datedGamePractice(reportDay,gameStartAt,observedAt){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(reportDay||""))return false;
 const start=at(gameStartAt),observed=at(observedAt),r=Date.parse(reportDay+"T00:00:00Z");
 if(![start,observed,r].every(Number.isFinite))return false;
 const on=Date.parse(new Date(start).toISOString().slice(0,10)+"T00:00:00Z");
 return r<=observed&&r<on&&on-r<=6*86400000;
}

function officialGameKeyMatchesOriginal(p){
 const parts=typeof p?.gameId==="string"?p.gameId.split("_"):[];
 if(parts.length!==4||parts[0]!=="2026"||
    !Number.isInteger(Number(parts[1]))||
    Number(parts[1])<1||Number(parts[1])>22||
    !/^[A-Z]{2,3}$/.test(parts[2])||!/^[A-Z]{2,3}$/.test(parts[3])||
    parts[2]===parts[3]||
    !/^[A-Z]{2,3}$/.test(p?.team||"")||
    !/^[A-Z]{2,3}$/.test(p?.opponent||"")||
    p.team===p.opponent||
    new Set([parts[2],parts[3]]).size!==2||
    ![parts[2],parts[3]].includes(p.team)||
    ![parts[2],parts[3]].includes(p.opponent))
  return false;
 // A future season or week mismatch cannot borrow historical/roster rows
 // from the spelled-out original immutable game key.
 if(p.season!==undefined&&p.season!==2026)return false;
 if(p.week!==undefined&&p.week!==Number(parts[1]))return false;
 return true;
}
function originalValid(p,asOf){
 return officialGameKeyMatchesOriginal(p)&&
  p?.sport==="NFL"&&p?.source==="PrizePicks independent feed"&&
  /^00-\d{7}$/.test(p.historicalPlayerId||"")&&
  /^2026_(?:[1-9]|1[0-9]|2[0-2])_[A-Z]{2,3}_[A-Z]{2,3}$/.test(p.gameId||"")&&
  /^pp_[a-zA-Z0-9_-]+$/.test(p.sourceProjectionId||"")&&
  ["Standard","Goblin","Demon"].includes(p.tier)&&
  ["Higher","Lower"].includes(p.side)&&num(p.line)&&p.line>=0&&
  num(p.probability)&&p.probability>0&&p.probability<1&&
  Number.isInteger(p.priorGames)&&p.priorGames>=8&&
  [at(asOf),at(p.capturedAt),at(p.observedAt),at(p.eventStartsAt)].every(Number.isFinite)&&
  at(p.observedAt)<=at(p.capturedAt)&&at(p.capturedAt)<=at(asOf)&&
  at(asOf)-at(p.capturedAt)<=6*3600000&&at(p.eventStartsAt)-at(asOf)>=15*60000;
}
function practice(p,document,asOf){
 const blank={status:"not_verified",officialTeamReport:false,reportedPractice:null,
  noGameDesignation:false,positiveGamedayActive:false};
 if(document?.kind!=="nfl_club_practice_source_research_v1"||
  !Number.isFinite(at(document.observedAt))||at(document.observedAt)>at(asOf)||
  at(asOf)-at(document.observedAt)>24*3600000)return blank;
 const r=first(document.reports,x=>x.historicalPlayerId===p.historicalPlayerId&&
  x.gameId===p.gameId&&same(x.player,p.player)&&same(x.team,p.team)&&
  datedGamePractice(x.reportDay,p.eventStartsAt,document.observedAt)&&
  sameOfficialClubHost(x.sourceUrl,p.team));
 if(!r)return blank;
 return {status:"official_club_practice_report_only",
  officialTeamReport:true,reportedPractice:r.fridayPractice||null,
  noGameDesignation:r.gameDesignation==="none",
  reportedIssue:r.reportedIssue||null,sourceUrl:r.sourceUrl,
  positiveGamedayActive:false};
}
function gameDay(p,status,asOf){
 const absent={status:"unknown",gameDayActiveVerified:false,source:null,
  rosterCompletenessVerified:false,firstGitSourceVerified:false};
 const capture=at(status?.capturedAt),firstGit=at(status?.firstGitCommittedAt);
 // Never trust a date or "full roster" label supplied inside a mutable
 // file. Only the private reporter adds the independently proven first-Git
 // flag after reading exactly one original committed, unchanged document.
 if(status?.kind!=="nfl_exact_official_game_day_active_roster_v1"||
  status.gameId!==p.gameId||
  status.fullGameRosterAuthenticated!==true||
  status.firstGitSourceVerified!==true||
  ![capture,firstGit].every(Number.isFinite)||
  capture>firstGit||firstGit>at(asOf)||at(asOf)-capture>4*3600000||
  capture>=at(p.eventStartsAt)||!Array.isArray(status.entries))return absent;
 const exact=status.entries.filter(x=>x.gameId===p.gameId);
 if(!exact.length||exact.some(x=>
   !["active","inactive"].includes(x.status)||
   !/^[A-Z]{2,3}$/.test(x.team||"")||
   !/^00-\d{7}$/.test(x.gsisId||"")||
   ![p.team,p.opponent].includes(x.team)))return absent;
 const allActive=exact.filter(x=>x.status==="active");
 const teams=[p.team,p.opponent];
 if(teams.length!==2||same(teams[0],teams[1])||
  new Set(exact.map(x=>x.gsisId)).size!==exact.length||
  teams.some(t=>{
   const rows=allActive.filter(x=>x.team===t);
   return ![47,48].includes(rows.length);
  })||allActive.some(x=>
   x.sourcePlayerAndGSISExact!==true||
   x.signedOrAuthenticatedOfficialPublication!==true||
   !/^https:\/\/(?:(?:www|fantasy-www)\.)?nfl\.com\//.test(x.sourceUrl||"")))
  return absent;
 const r=first(allActive,x=>x.gsisId===p.historicalPlayerId&&
  same(x.team,p.team));
 if(!r)return absent; // Absence is NEVER proof of active participation.
 return {status:"explicit_official_active",gameDayActiveVerified:true,
  source:r.sourceUrl,capturedAt:status.capturedAt,
  rosterCompletenessVerified:true,firstGitSourceVerified:true,
  bothTeamsExplicitActiveCounts:teams.map(t=>
   allActive.filter(x=>x.team===t).length)};
}
function comparison(p,thirdParty,asOf){
 const none={kind:"research_only_independent_comparison",reportedPlatformLines:{},
  exactLineExternallyReported:false,missingPlatformListingIsNotProofOfRemoval:true};
 if(thirdParty?.kind!=="nfl_third_party_platform_line_comparison_v1"||
  at(thirdParty.observedAt)>at(asOf)||!Number.isFinite(at(thirdParty.observedAt))||
  at(asOf)-at(thirdParty.observedAt)>4*3600000)return none;
 const r=first(thirdParty.props,x=>x.historicalPlayerId===p.historicalPlayerId&&
  x.gameId===p.gameId&&x.market===p.market&&same(x.player,p.player));
 if(!r)return none;
 const vals={};
 for(const platform of ["PrizePicks","Underdog"]){
  const x=r.platformLines?.[platform];
  vals[platform]=num(x)?{line:x,matchOriginal:x===p.line,
   sourceVerifiedAsAppQuote:false}: {line:null,listedOnComparedPage:false,
   sourceVerifiedAsAppQuote:false};
 }
 return {...none,sourceUrl:thirdParty.sourceUrl,
  sourceCheckedAt:thirdParty.observedAt,reportedPlatformLines:vals,
  exactLineExternallyReported:Object.values(vals).some(x=>x.matchOriginal)};
}
function appQuote(p,receipts,asOf){
 const blank={status:"unverified",authenticatedExactOriginalAppOffer:false,platform:null};
 if(!Array.isArray(receipts))return blank;
 const matched=receipts.filter(x=>x?.kind==="nfl_authenticated_platform_offer_v1"&&
  ["PrizePicks","Underdog"].includes(x.platform)&&x.sport==="NFL"&&
  x.sourceProjectionId===p.sourceProjectionId&&x.independentlyVerifiedOriginalSourceId===true&&
  x.playerGSIS===p.historicalPlayerId&&x.gameId===p.gameId&&
  same(x.player,p.player)&&same(x.team,p.team)&&same(x.opponent,p.opponent)&&
  x.market===p.market&&x.tier===p.tier&&x.line===p.line&&
  (x.availableSides||[]).includes(p.side)&&
  ["verified_app_export","authenticated_platform_receipt"].includes(x.verificationMethod)&&
  x.verifiedByIndependentAppAccess===true&&
  x.signedOrAuthenticatedReceiptVerified===true&&
  typeof x.receiptId==="string"&&x.receiptId.length>=8&&
  Number.isFinite(at(x.observedAt))&&at(x.observedAt)<=at(asOf)&&
  at(asOf)-at(x.observedAt)<=10*60000&&at(x.observedAt)<at(p.eventStartsAt)-15*60000);
 if(matched.length!==1)return blank;
 return {status:"authenticated_exact_original_app_quote",
  authenticatedExactOriginalAppOffer:true,platform:matched[0].platform,
  line:matched[0].line,side:p.side,observedAt:matched[0].observedAt,
  receiptId:matched[0].receiptId};
}
function evaluate(p,{asOf,officialReport=null,clubPractice=null,
  gameDayRoster=null,comparisonDoc=null,appOffers=[],calibrationCertificate=null,
  entryPayoutQuote=null,jointDistribution=null}={}){
 const invalid=!originalValid(p,asOf);
 if(invalid)return {kind:KIND,player:p?.player??null,status:"not_evaluable",
  reasons:["original_source_line_identity_or_clock_invalid"],bettingEligible:false};
 const injury=attachNflAvailability(p,officialReport,asOf);
 const practiceEvidence=practice(p,clubPractice,asOf);
 const active=gameDay(p,gameDayRoster,asOf);
 const independentLines=comparison(p,comparisonDoc,asOf);
 const quote=appQuote(p,appOffers,asOf);
 const cert=certifiedCalibration(p,calibrationCertificate,asOf);
 const reasons=[];
 if(at(asOf)-at(p.capturedAt)>30*60000)reasons.push("research_board_no_longer_within_30min_freshness_window");
 if(injury.blocksResearch)reasons.push("official_injury_uncertainty_or_out_report");
 if(!active.gameDayActiveVerified)reasons.push("official_positive_game_day_active_roster_missing");
 if(!quote.authenticatedExactOriginalAppOffer)reasons.push("current_exact_prizepicks_or_underdog_app_offer_unverified");
 if(!cert.verified)reasons.push("untouched_prospective_market_calibration_unverified");
 if(!entryPayoutQuote?.signedOrAuthenticatedReceiptVerified)
  reasons.push("entry_specific_authenticated_payout_missing");
 if(!jointDistribution?.independentlyValidatedForThisEntry)
  reasons.push("validated_joint_lineup_probability_missing");
 return {kind:KIND,status:reasons.length?"research_only_hold":"source_evidence_complete_pending_final_entry_revalidation",
  player:p.player,team:p.team,opponent:p.opponent,gameId:p.gameId,
  market:p.market,tier:p.tier,line:p.line,side:p.side,modelProjection:p.projection,
  rawUncalibratedModelEstimate:p.probability,officialInjury:injury,
  clubPractice:practiceEvidence,gameDayActive:active,
  independentPlatformComparison:independentLines,
  authenticatedPlatformQuote:quote,prospectiveCalibration:cert,
  payout:{entrySpecificPayoutVerified:false,payoutAdjustedExpectedValue:null,
   reason:"individual_prop_alone_cannot_define_two_to_six_leg_payout"},
  reasons,highConfidenceEligible:false,bettingEligible:false,
  autoWagerAllowed:false,independentLineIsNotAnAppQuote:true};
}
function certifiedCalibration(p,c,asOf){
 const blank={verified:false,calibratedProbability:null};
 if(c?.kind!=="nfl_prospective_market_calibration_certificate_v1"||
  c.market!==p.market||c.tier!==p.tier||c.sport!=="NFL"||
  typeof p.modelVersion!=="string"||!p.modelVersion||c.modelVersion!==p.modelVersion||
  c.onlyFirstGitOriginalPregameDecisions!==true||
  c.trainAndHoldoutDatesSeparated!==true||
  c.independentHoldoutSampleSize<250||c.independentHoldoutGameCount<30||
  c.distinctHoldoutSlates<20||
  !num(c.holdoutBrierScore)||!num(c.holdoutBaselineBrierScore)||
  c.holdoutBrierScore>=c.holdoutBaselineBrierScore||
  !num(c.heldoutCalibratedProbability)||c.heldoutCalibratedProbability<=0||
  c.heldoutCalibratedProbability>=1||
  !Number.isFinite(at(c.frozenAt))||at(c.frozenAt)>at(asOf))return blank;
 return {verified:true,calibratedProbability:c.heldoutCalibratedProbability,
  source:c.kind};
}
module.exports={KIND,officialGameKeyMatchesOriginal,originalValid,practice,gameDay,comparison,appQuote,
 certifiedCalibration,evaluate,sameOfficialClubHost,datedGamePractice};
