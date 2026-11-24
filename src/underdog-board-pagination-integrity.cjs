"use strict";
/**
 * Offline completeness check for a future *authorized* UnderdogAPI.com
 * cursor-paginated research export. No network calls, API credentials,
 * public raw rows, original app/market-contract verification or wagers.
 *
 * pages[i] = {requestedCursor: null|string, response:{meta,data}}
 * All pages must come from the SAME league, capture window and full-view request.
 * Pagination completeness is not synonymous with full real-world platform coverage.
 */
const time=x=>typeof x==="string"?Date.parse(x):NaN;
function auditPages(pages,{league,now,requestedView="full",maxAgeMinutes=30}={}){
 const fail=reason=>({kind:"independent_underdog_pagination_integrity_v1",
  status:"unverified",reason,league,rows:0,pages:0,requestPaginationComplete:false,
  fullPlatformBoardVerified:false,sourcePlayerIdentityVerified:false,
  marketSettlementSemanticsVerified:false,publicRows:0,
  productionEligible:false,paidRequests:0});
 const clock=time(now);
 if(!["NHL","NFL"].includes(league)||!Number.isFinite(clock)||
  requestedView!=="full"||!Number.isInteger(maxAgeMinutes)||maxAgeMinutes<1||maxAgeMinutes>30||
  !Array.isArray(pages)||pages.length<1||pages.length>100)
  return fail("invalid_capture_scope_or_pages");
 let required=null,total=0,filterKey=null;
 const cursorSet=new Set(),lineSet=new Set();
 for(let i=0;i<pages.length;i++){
  const entry=pages[i],d=entry?.response,m=d?.meta;
  if(!entry||entry.requestedCursor!==required)
   return fail("cursor_chain_gap_or_misordered_page");
  // Collector-recorded request envelope: cursors alone do not prove that
  // every page was fetched with the SAME league/view/stat filters.
  if(entry.requestedLeague!==league||entry.requestedView!==requestedView||
     typeof entry.requestedFilterSignature!=="string"||
     !entry.requestedFilterSignature.trim()||
     filterKey!==null&&entry.requestedFilterSignature!==filterKey)
   return fail("pagination_filters_or_requested_view_changed");
  filterKey=entry.requestedFilterSignature;
  if(required!==null&&(typeof required!=="string"||!required||cursorSet.has(required)))
   return fail("duplicate_or_invalid_cursor");
  if(required!==null)cursorSet.add(required);
  const observed=time(m?.observed_at);
  if(!m||!Array.isArray(d.data)||m.count!==d.data.length||
   m.is_demo!==false||m.mode!=="live"||m.schema_version!=="1.0"||
   m.source_status!=="fresh"||
   !Number.isInteger(m.limit)||m.limit<1||m.limit>100||
   !Number.isFinite(observed)||observed>clock||
   clock-observed>maxAgeMinutes*60000||
   !d.data.length||d.data.length>m.limit)
   return fail("untrusted_or_empty_provider_page");
  for(const r of d.data){
   if(r?.league!==league||r.is_demo!==false||r.source==="demo"||
    typeof r.line_id!=="string"||!r.line_id||lineSet.has(r.line_id))
    return fail("mixed_sport_demo_or_duplicate_offer_id");
   const observed=time(r.observed_at),start=time(r.event?.starts_at);
   if(!Number.isFinite(observed)||observed>clock||clock-observed>maxAgeMinutes*60000||
    !Number.isFinite(start)||start<=clock)
    return fail("expired_or_started_offer_row");
   if(r.status!=="active"||!Number.isFinite(r.line)||
    typeof r.player?.id!=="string"||!r.player.id||
    typeof r.player?.name!=="string"||!r.player.name||
    typeof r.event?.id!=="string"||!r.event.id||
    typeof r.market?.id!=="string"||!r.market.id||
    typeof r.market?.stat!=="string"||!r.market.stat||
    typeof r.market?.period!=="string"||!r.market.period||
    !Array.isArray(r.selections)||!r.selections.length)
    return fail("malformed_market_or_side_contract");
   const sides=r.selections.filter(x=>x&&["higher","lower"].includes(x.side)&&x.available===true);
   if(sides.length===0||new Set(sides.map(x=>x.side)).size!==sides.length)
    return fail("no_unique_current_offered_side");
   lineSet.add(r.line_id);total++;
  }
  required=m.next_cursor??null;
  if(required!==null&&(!required||typeof required!=="string"))
   return fail("invalid_next_cursor");
  if(required===null&&i!==pages.length-1)
   return fail("pages_followed_terminal_cursor");
 }
 if(required!==null)return fail("last_page_has_unresolved_cursor");
 return {kind:"independent_underdog_pagination_integrity_v1",
  status:"private_research_pages_contiguous",league,rows:total,pages:pages.length,
  requestPaginationComplete:true,collectorFilterContinuityVerified:true,
  independentlyPinnedProviderSnapshot:false,
  sourceObservedAcrossMultiplePagesCanMove:true,
  originalAppAuthenticated:false,
  fullPlatformBoardVerified:false,sourcePlayerIdentityVerified:false,
  marketSettlementSemanticsVerified:false,licensingAndRedistributionVerified:false,
  publicRows:0,productionEligible:false,paidRequests:0,
  note:"All requested provider pages were supplied for this bounded snapshot. Coverage beyond provider response, player/game identity and fantasy-app settlement remain separate gates."};
}
module.exports={auditPages};
