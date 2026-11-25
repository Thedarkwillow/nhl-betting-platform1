"use strict";
// Offline JSON export adapters. No credentials, HTTP, archive write or official platform claims.
const {createHash}=require("node:crypto");
const text=x=>typeof x==="string"&&x.trim().length>0&&x.length<=256?x:null;
const timestamp=x=>typeof x==="string"&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
const ids={CS:"CS2",CS2:"CS2",VAL:"VALORANT",VALORANT:"VALORANT",LOL:"LOL",DOTA:"DOTA2",DOTA2:"DOTA2",COD:"COD",CDL:"COD",NBA:"NBA",NFL:"NFL",NHL:"NHL",MLB:"MLB"};
function adapt(doc,receivedAt,provider,source,sideMap,needsRung){
 const now=timestamp(receivedAt);
 if(!Number.isFinite(now)||doc?.meta?.mode!=="live"||doc.meta.source_status!=="fresh"||!Array.isArray(doc.data)||doc.data.length>1000)throw Error("unverified export envelope");
 const excluded={},rows=[],seen=new Map();
 function reject(k){excluded[k]=(excluded[k]||0)+1;}
 for(const r of doc.data){
  if(!r||r.is_demo!==false||r.source!==source||r.status!=="active"){reject("source_or_status");continue;}
  const sport=ids[r.sport||r.league],start=timestamp(r.event?.starts_at),observed=timestamp(r.observed_at);
  if(!sport||!text(r.id)||!text(r.source_projection_id)||!text(r.player?.id)||!text(r.player?.name)||!text(r.market?.id)||!text(r.market?.stat)||!text(r.market?.period)||!Number.isFinite(r.line)||(needsRung&&!text(r.line_id))){reject("identity_scope_or_line");continue;}
  if(!Number.isFinite(start)||!Number.isFinite(observed)||observed>now||now-observed>900000||start<=now+900000){reject("stale_or_started");continue;}
  const selections={};let invalid=false;
  if(!Array.isArray(r.selections)){reject("missing_selections");continue;}
  for(const s of r.selections){
   const side=sideMap[s?.side];
   if(!side||Object.hasOwn(selections,side)||typeof s.available!=="boolean"||(s.payout_multiplier!=null&&(!Number.isFinite(s.payout_multiplier)||s.payout_multiplier<=0))||(!s.available&&s.payout_multiplier!=null)){invalid=true;break;}
   selections[side]={available:s.available,tier:text(s.tier),payoutTier:text(s.payout_tier),multiplier:s.payout_multiplier??null,multiplierScale:text(s.multiplier_scale)};
  }
  if(invalid||!Object.values(selections).some(s=>s.available)){reject("invalid_selections");continue;}
  const key=JSON.stringify([r.id,r.line_id??null]);
  if(seen.has(key)){const prev=seen.get(key);if(prev!==null){rows[prev]=null;seen.set(key,null);reject("duplicate_identity");}reject("duplicate_identity");continue;}
  seen.set(key,rows.length);
  rows.push({provider,sport,providerOfferId:r.id,providerRungId:r.line_id??null,sourceProjectionId:r.source_projection_id,providerPlayerId:r.player.id,player:r.player.name,team:text(r.player.team),providerEventId:text(r.event.id),opponent:text(r.event.opponent),startsAt:new Date(start).toISOString(),observedAt:new Date(observed).toISOString(),receivedAt,providerMarketId:r.market.id,stat:r.market.stat,period:r.market.period,line:r.line,selections,adjustedOdds:r.pricing?.adjusted_odds??null,standardRatesApply:r.pricing?.standard_rates_apply??null,provenance:"independent_provider_observation",originalAppAvailabilityVerified:false,officialExportVerified:false,productionEligible:false});
 }
 return {kind:"independent_provider_research_export_v1",provider,rows:rows.filter(Boolean),excluded,sourceDocumentSha256:createHash("sha256").update(JSON.stringify(doc)).digest("hex"),completePage:doc.meta.next_cursor===null,networkCalls:0,originalOffersVerified:0,publicRawRedistributionAllowed:false};
}
const prizepicks=(doc,receivedAt)=>adapt(doc,receivedAt,"PrizePicksAPI","prizepicks",{more:"Higher",less:"Lower"},false);
const underdog=(doc,receivedAt)=>adapt(doc,receivedAt,"UnderdogAPI","underdog",{higher:"Higher",lower:"Lower"},true);
module.exports={prizepicks,underdog};
