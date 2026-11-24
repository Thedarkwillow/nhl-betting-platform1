"use strict";
// Normalized candidate observations for private data-quality/model-coverage research.
// Neither original provider identity nor metric settlement semantics are authenticated.
const {eventCrosswalk}=require("./underdog-event-crosswalk.cjs");
const {identity,market}=require("./underdog-identity-market-research.cjs");
const {audit:identityCollisionAudit}=require("./underdog-source-player-collision.cjs");
function normalize(doc,league,now,schedule,roster){
 const out=[],seen=new Set(),duplicate=new Set(),sourceIdentity=identityCollisionAudit(doc);
 if(!["NHL","NFL"].includes(league)||!Array.isArray(doc?.data)||doc.meta?.count!==doc.data.length||doc.data.length<1||doc.data.length>5||doc.meta?.source_status!=="fresh"||doc.meta?.is_demo===true||doc.meta?.mode==="demo"||doc.data.some(x=>x?.is_demo!==false||x.source==="demo"))return [];
 for(const r of doc.data){
  if(typeof r.line_id!=="string"||!r.line_id)continue;
  if(seen.has(r.line_id))duplicate.add(r.line_id);seen.add(r.line_id);
 }
 for(const r of doc.data){
  if(typeof r.line_id!=="string"||!r.line_id||duplicate.has(r.line_id)||sourceIdentity.rejectedOfferIds.has(r.line_id)||r.status!=="active"||!Number.isFinite(r.line)||!Array.isArray(r.selections))continue;
  const e=eventCrosswalk(r,league,now,schedule);if(!e.matched)continue;
  const i=identity(r,league,roster,now,e.scheduleGameId),m=market(r,league);if(!i||!m)continue;
  const sides=r.selections.filter(x=>x&&["higher","lower"].includes(x.side)&&x.available===true);
  if(!sides.length||new Set(sides.map(x=>x.side)).size!==sides.length)continue;
  for(const s of sides)out.push({league,gameId:e.scheduleGameId,playerId:i.playerId,market:m.market,period:m.period,side:s.side,line:r.line,observedAt:r.observed_at,eventStartsAt:r.event.starts_at,sourceOfferId:r.line_id,sourcePlayerId:r.player.id,sourcePlayerName:r.player.name,sourceTeam:r.player.team,sourceOpponent:r.event.opponent,sourceEventId:e.providerEventId,sourceReportedMultiplier:Number.isFinite(s.payout_multiplier)&&s.payout_multiplier>0?s.payout_multiplier:null,identityMethod:"independent_roster_and_schedule",marketContractVerified:false,available:s.available,platformAvailabilityVerified:false,sourceIdentityVerified:false,currentParticipationVerified:false,researchOnly:true,productionEligible:false});
 }
 return out;
}
function modelCoverage(rows){
 const core={NHL:new Set(["shotsOnGoal","blockedShots","points","assists","goals","saves"]),NFL:new Set(["passing_yards","passing_attempts","passing_completions","rushing_yards","rushing_attempts","receiving_yards","receptions","receiving_targets","passing_touchdowns","fg_made","kicking_points"])};
 const a={candidateSides:0,existingMarketResearchCandidates:0,unsupportedOrSpecialist:0};
 for(const r of rows||[]){if(!core[r?.league]||r.researchOnly!==true||r.productionEligible!==false||r.marketContractVerified!==false)continue;a.candidateSides++;if(core[r.league].has(r.market))a.existingMarketResearchCandidates++;else a.unsupportedOrSpecialist++;}
 return {...a,projectionExecuted:false,providerSemanticsVerified:false,eligibleForProduction:0,publicRows:0};
}
module.exports={normalize,modelCoverage};
