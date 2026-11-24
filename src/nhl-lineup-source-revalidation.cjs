"use strict";
/** CHAT-16/P06-07: exact recorded research lineup revalidation.
 * This only compares to a new independent provider snapshot; no original
 * PrizePicks availability, odds or payouts are inferred.
 */
const {MARKETS,resolveMarket,normalize}=require("./nhl-market-registry.cjs");
const epoch=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
const norm=s=>normalize(s).replace(/\s+/g,"");
const market=s=>MARKETS[s]?s:resolveMarket(s);
function identityMatch(p,row){
 const a=market(p?.market),b=market(row?.market);
 const start=epoch(p?.eventStartsAt),observedStart=epoch(row?.eventStartsAt);
 return !!(a&&b&&a===b&&start!==null&&start===observedStart&&
  norm(p?.player)&&norm(p.player)===norm(row?.player)&&
  norm(p?.team)&&norm(p.team)===norm(row?.team)&&
  norm(p?.opponent)&&norm(p.opponent)===norm(row?.matchup)&&
  ["fullgame","game"].includes(norm(row?.period))&&
  row?.isLive!==true);
}
function inspectPick(p,rows){
 if(!p||!["Higher","Lower"].includes(p.lean)||!Number.isFinite(p.line))
  return {status:"invalid_selected_research_offer"};
 const same=(rows||[]).filter(row=>identityMatch(p,row));
 if(same.length===0)return {status:"not_seen_in_independent_feed_unverified_removal"};
 const tier=same.filter(r=>norm(r.tier)===norm(p.tier));
 if(!tier.length)return {status:"tier_not_observed_on_refresh"};
 const side=tier.filter(r=>r.side===p.lean);
 if(!side.length)return {status:"chosen_side_not_observed_on_refresh"};
 const exact=side.filter(r=>r.line===p.line);
 if(exact.length===1)return {status:"same_line_observed_in_independent_feed_only"};
 if(exact.length>1)return {status:"ambiguous_duplicate_source_matches"};
 const changed=[...new Set(side.map(r=>r.line).filter(Number.isFinite))];
 return {status:"line_changed_research_offer_invalidated",
  newObservedLines:changed.slice(0,5)};
}
function inspectLineupSource(picks,board,{now=new Date().toISOString()}={}){
 const at=epoch(now),captured=epoch(board?.generatedAt);
 if(at===null)throw Error("Invalid NHL lineup current-time audit");
 const complete=board?.provider==="prizepicksapi.com"&&
  board?.completePagination===true&&board?.sourceStatus==="fresh"&&
  Array.isArray(board?.rows);
 const age=captured===null?null:(at-captured)/60000;
 const fresh=complete&&age!==null&&age>=0&&age<=30;
 const result={kind:"nhl_derived_lineup_source_revalidation_v1",
  evaluatedAt:now,boardAt:board?.generatedAt||null,
  status:"no_current_independent_source",sourceFresh:!!fresh,
  independentProviderOnly:true,originalAppAvailabilityVerified:false,
  payoutRulesVerified:false,wagersPlaced:0,picks:[],moved:0,unseen:0,valid:0,
  quoteAgeMinutes:age===null?null:Number(age.toFixed(1))};
 if(!Array.isArray(picks)||picks.length<2||picks.length>6)
  return {...result,status:"invalid_or_missing_lineup"};
 if(!fresh)return result;
 const audit=picks.map((p,i)=>({index:i,...inspectPick(p,board.rows)}));
 const valid=audit.filter(x=>x.status==="same_line_observed_in_independent_feed_only").length;
 const moved=audit.filter(x=>x.status==="line_changed_research_offer_invalidated").length;
 const unseen=audit.filter(x=>x.status==="not_seen_in_independent_feed_unverified_removal").length;
 const full=valid===picks.length;
 return {...result,picks:audit,valid,moved,unseen,
  status:full?"unchanged_in_fresh_independent_source_only":
   "research_lineup_requires_revalidation_or_reoptimization",
  sourceStateNotOfficialPlatformOffer:true};
}
module.exports={identityMatch,inspectPick,inspectLineupSource};
