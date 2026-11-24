"use strict";
// Pregame-to-last-observed source movement, not authenticated closing odds or ROI.
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=x=>JSON.stringify([x.projectionId,x.providerPlayerId,x.providerGameId,x.market,x.period,x.tier,x.side,x.eventStartsAt]);
function compare(original,observations){
 const start=dt(original?.eventStartsAt),at=dt(original?.capturedAt),commit=dt(original?.firstCommittedAt);
 if(!original?.projectionId||!original?.providerPlayerId||!original?.providerGameId||!original.market||!original.period||!original.tier||
  !["Higher","Lower"].includes(original.side)||![start,at,commit].every(Number.isFinite)||at>commit||commit>=start||!Number.isFinite(original.line))return {status:"missing_original_identity_or_chronology"};
 const valid=(observations||[]).filter(x=>x.completeOriginalBoard===true&&x.singleGitAddition===true&&x.provider===original.provider&&
  key(x)===key(original)&&Number.isFinite(x.line)&&dt(x.capturedAt)>commit&&dt(x.firstCommittedAt)>=dt(x.capturedAt)&&dt(x.firstCommittedAt)<start).sort((a,b)=>dt(b.capturedAt)-dt(a.capturedAt));
 if(!valid.length)return {status:"no_verified_later_pregame_observation"};
 const latest=valid[0];if(valid.filter(x=>x.capturedAt===latest.capturedAt).length!==1)return {status:"ambiguous_latest_observation"};
 const minutesToStart=(start-dt(latest.capturedAt))/60000;
 return {status:minutesToStart<=30?"near_start_source_observation":"earlier_source_observation_not_close",
  minutesToStart,signedThresholdMovement:(original.side==="Higher"?1:-1)*(latest.line-original.line),capturedAt:latest.capturedAt,
  authenticatedClose:false,platformSettlementVerified:false};
}
module.exports={compare};
