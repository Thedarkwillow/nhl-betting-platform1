"use strict";
// No-provider-call registry and feature gate. Existing data may be used only
// in private research; source-specific production rights are independent.
const SOURCES=Object.freeze([
 ["MoneyPuck","NHL","approved archive and existing rate shadow","owner_reported_commercial_permission_written_scope_pending","https://moneypuck.com/data.htm"],
 ["Natural Stat Trick","NHL","authorized feed pending; prior HTTP 401","owner_reported_authorization_endpoint_pending","https://www.naturalstattrick.com/"],
 ["NHL EDGE","NHL","authorized tracking export required; not an active collector","permission_pending","https://edge.nhl.com/"],
 ["Daily Faceoff","NHL","existing projected lines and goalie adapter; current access gaps","written_scope_pending","https://www.dailyfaceoff.com/"],
 ["Hockey Reference","NHL","use equivalent official historical archive; no direct bulk scraping","reference_only","https://www.hockey-reference.com/"],
 ["NHL Stats","NHL","official game, roster, shifts and historical archives","public_data_rights_review_pending","https://www.nhl.com/stats/"],
 ["nflverse","NFL","weekly, schedules, snaps, PBP and free EPA efficiency","dataset_specific_CC_BY_attribution_required","https://nflverse.com/"],
 ["FTN Charting","NFL","existing independent research-only archived charting","CC_BY_SA_keep_isolated","https://nflreadr.nflverse.com/reference/load_ftn_charting.html"],
 ["NFL Next Gen Stats","NFL","existing nflverse weekly advanced datasets","dataset_specific_license","https://nflreadr.nflverse.com/reference/load_nextgen_stats.html"],
 ["SumerSports","NFL","replace with nflverse EPA and usage; no direct collection","automated_access_and_model_use_restricted","https://sumersports.com/terms-of-service/"],
 ["Pro Football Reference","NFL","nflverse licensed PFR weekly advanced and snap datasets","dataset_specific_license_no_direct_scrape","https://nflreadr.nflverse.com/reference/load_pfr_advstats.html"],
 ["FantasyPros","NFL","authorized feed required; free usage proxies from nflverse","free_API_nonproduction_only","https://www.fantasypros.com/api-data/"],
 ["rbsdm","NFL","reproduce EPA/success calculations independently from nflverse","no_direct_site_ingestion","https://rbsdm.com/stats/"]
].map(([name,sport,integration,rights,url])=>Object.freeze({name,sport,integration,rights,url})));
const FIELDS={nhl_edge:{highDangerSogPer60:[0,60],shotSpeedMph:[0,120],skatingSpeedMph:[0,35],offensiveZoneTimePct:[0,100]},natural_stat_trick:{attemptsPer60:[0,120],xGoalsPer60:[0,15],scoringChancesPer60:[0,100]},fantasypros:{snapShare:[0,1],targetShare:[0,1],routeParticipation:[0,1]},fantasy_life:{snapShare:[0,1],targetShare:[0,1],routeParticipation:[0,1]}};
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function authorizedFeatures(offer,records,asOf,rights){
 const t=dt(asOf),start=dt(offer.gameStartAt||offer.eventStartsAt),id=String(offer.playerId??offer.historicalPlayerId??"");
 if(!(Number.isFinite(t)&&t<start-900000&&id&&offer.team&&offer.opponent))return [];
 const valid=[];
 for(const x of records||[]){
  const allowed=rights?.[x.sourceId],fields=FIELDS[x.sourceId];
  if(!fields||allowed?.researchApproved!==true||typeof allowed.approvalRef!=="string"||!allowed.approvalRef.trim()||String(x.playerId)!==id||String(x.gameId)!==String(offer.gameId??offer.sourceGameId)||x.team!==offer.team||x.opponent!==offer.opponent||dt(x.gameStartAt)!==start||!(dt(x.issuedAt)<=dt(x.observedAt)&&dt(x.observedAt)<=dt(x.firstGitCommittedAt)&&dt(x.firstGitCommittedAt)<=t&&t-dt(x.observedAt)<=86400000))continue;
  const clean={};for(const [k,[a,b]] of Object.entries(fields)){const v=x.features?.[k];if(typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b)clean[k]=v;}
  if(Object.keys(clean).length)valid.push({sourceId:x.sourceId,features:clean,observedAt:x.observedAt,researchOnly:true,productionApproved:false});
 }
 return valid.filter(x=>valid.filter(y=>y.sourceId===x.sourceId).length===1);
}
module.exports={SOURCES,authorizedFeatures};
