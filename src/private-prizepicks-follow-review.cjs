"use strict";
/**
 * Private research helper for a USER-SUPPLIED shared lineup, NOT a PrizePicks
 * Following-tab scraper, app account integration or wager submission.
 *
 * A differing independently archived quote is only a POSSIBLE line bump.
 * Original-platform real-time offer or movement is NEVER authenticated here.
 */
const {createHash}=require("node:crypto");
const {marketOf,periodOf}=require("./nhl-platform-line-shop.cjs");
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const clean=x=>String(x??"").trim(),upper=x=>clean(x).toUpperCase();
const SIDE=new Set(["Higher","Lower"]),TIER=new Set(["Standard","Goblin","Demon"]);
function validShareUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==="https:"&&["prizepicks.com","www.prizepicks.com","app.prizepicks.com","prizepicks.onelink.me"].includes(u.hostname)&&
   u.username===""&&u.password===""&&u.pathname.length>1;
 }catch{return false;}
}
function canonicalMarket(m){
 return marketOf(m)||({
  shotsongoal:"shotsOnGoal",blockedshots:"blockedShots",
  shotsagainst:"shotsAgainst"
 })[clean(m).toLowerCase()]||null;
}
function parseSlip(slip,target){
 if(!slip||typeof slip!=="object"||Array.isArray(slip))throw Error("A structured manually shared lineup is required");
 if(upper(slip.username)!==upper(target?.username))throw Error("Slip username must match private follow target");
 if(!validShareUrl(slip.shareUrl))throw Error("Only authentic HTTPS prizepicks.com share URLs are accepted");
 if(!Array.isArray(slip.legs)||slip.legs.length<2||slip.legs.length>6)
  throw Error("Only explicit 2-6 selection shares can be compared");
 const legs=slip.legs.map((p,i)=>{
  const market=canonicalMarket(p.market);
  if(!clean(p.player)||!clean(p.team)||!clean(p.opponent)||upper(p.team)===upper(p.opponent)||
   !market||!Number.isFinite(p.line)||p.line<0||
   !SIDE.has(p.side)||!TIER.has(p.tier)||!date(p.eventStartsAt)||
   periodOf(p.period||"full_game")!=="full_game")
   throw Error("Leg "+(i+1)+" missing exact player/team/opponent/market/tier/side/line/start");
  return {player:clean(p.player).slice(0,90),team:upper(p.team),
   opponent:upper(p.opponent),market,line:p.line,
   side:p.side,tier:p.tier,eventStartsAt:p.eventStartsAt,
   period:"full_game"};
 });
 const stable=["brigue",slip.shareUrl,legs.map(x=>[x.player,x.team,x.opponent,
  x.market,x.line,x.side,x.tier,x.eventStartsAt])];
 const key="private-share-"+createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0,20);
 return {key,username:"brigue",shareUrl:slip.shareUrl,
  legs,userSuppliedSourceOnly:true,accountOwnerIdentityAuthenticated:false,
  originalPlatformSlipVerified:false};
}
function evaluateSharedLineup(target,slip,board,{now=new Date().toISOString()}={}){
 const parsed=parseSlip(slip,target),current=date(now),observed=date(board?.generatedAt);
 if(!current)throw Error("Valid current time required");
 const fresh=Array.isArray(board?.rows)&&board.completePagination===true&&
  board.sourceStatus==="fresh"&&board.safeForLiveUse!==false&&
  observed!==null&&observed<=current&&current-observed<=30*60000;
 const evaluated=parsed.legs.map(p=>{
  const defaultState={...p,observedLine:null,sourceObservedAt:null,
   state:"not_verified",action:"review_in_original_app",
   note:"Cannot confirm the live original PrizePicks offer or app submission."};
  if(date(p.eventStartsAt)<=current)return {...defaultState,
   state:"game_started_or_closed",action:"do_not_copy",
   note:"Game start reached or passed; no current entry can be verified."};
  if(!fresh)return {...defaultState,state:"source_stale_or_unavailable",
   note:"No independent source snapshot within 30 minutes; line may have changed."};
  const candidates=board.rows.filter(r=>
   upper(r.player)===upper(p.player)&&upper(r.team)===p.team&&
   upper(r.matchup)===p.opponent&&canonicalMarket(r.market)===p.market&&
   upper(r.tier)===upper(p.tier)&&r.side===p.side&&
   periodOf(r.period)==="full_game"&&date(r.eventStartsAt)===date(p.eventStartsAt)&&
   Number.isFinite(r.line)&&r.line>=0&&
   date(r.capturedAt)!==null&&date(r.capturedAt)<=current&&
   date(r.capturedAt)>=current-30*60000&&date(r.capturedAt)<date(r.eventStartsAt)&&
   date(r.observedAt)!==null&&date(r.observedAt)>=current-30*60000&&
   date(r.observedAt)<=date(r.capturedAt));
  if(!candidates.length)return {...defaultState,state:"source_offer_not_matched",
   note:"Independent feed has no exact player/market/game/tier/side match; NOT proof of a removed original offer."};
  const distinct=[...new Set(candidates.map(r=>r.line))];
  if(distinct.length!==1)return {...defaultState,state:"ambiguous_source_lines",
   action:"do_not_copy",
   note:"Multiple independent observed lines for the same identity; no safe match."};
  const latest=candidates.reduce((x,y)=>date(x.observedAt)>=date(y.observedAt)?x:y);
  const currentLine=distinct[0],worse=p.side==="Higher"?currentLine>p.line:currentLine<p.line;
  const better=p.side==="Higher"?currentLine<p.line:currentLine>p.line;
  return {...defaultState,observedLine:currentLine,sourceObservedAt:latest.observedAt,
   state:worse?"possible_unfavorable_line_bump":better?
    "different_but_potentially_favorable_line":"matching_independent_line",
   action:worse?"hold_for_manual_review":"verify_in_original_app",
   note:worse?"Different independent quote has a less favorable threshold than shared slip. Do not treat as a matching lineup; original app must be checked.":
    better?"Independent quote threshold differs in a potentially favorable direction; not proof of original app offer or payouts.":
     "An independent provider observed this threshold; the original platform may differ."};
 });
 const flagged=evaluated.filter(x=>x.state==="possible_unfavorable_line_bump").length,
  unverifiable=evaluated.filter(x=>!["matching_independent_line",
   "possible_unfavorable_line_bump","different_but_potentially_favorable_line"].includes(x.state)).length;
 return {kind:"private_follow_shared_slip_bump_review_v1",username:parsed.username,
  fingerprint:parsed.key,shareUrl:parsed.shareUrl,evaluatedAt:now,
  allLegsOriginalPlatformAuthenticated:false,
  independentSourceFresh:fresh,sourceCapturedAt:fresh?board.generatedAt:null,
  originalFollowingFeedConnected:false,automaticSubmissionEnabled:false,
  paidEntriesPlaced:0,sourceGeneratedByUserNotPrizePicks:true,
  cannotVerifyBrigueAuthorship:true,
  status:flagged?"review_possible_unfavorable_bump":
   unverifiable?"incomplete_or_stale_original_offer_verification":"independent_reference_only",
  possibleUnfavorableBumps:flagged,unverifiableLegs:unverifiable,
  legs:evaluated,note:"Third-party quote comparisons are observation-only. They do not verify which account authored a shared slip, whether an offer was pulled or moved, or what is currently available inside PrizePicks. No wagers submitted."};
}
module.exports={validShareUrl,parseSlip,evaluateSharedLineup};
