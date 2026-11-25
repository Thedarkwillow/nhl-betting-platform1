'use strict';
// Key-free, evidence-driven collection policy. Never derive a no-game result from a failed request.
const registry=Object.freeze({
 NBA:'nba',NHL:'nhl',NFL:'nfl',CS2:'cs2',DOTA2:'dota2',VAL:'valorant',LOL:'lol',COD:'cod',
 MLB:'mlb',WNBA:'wnba',CFB:'college-football',CBB:'college-basketball',TENNIS:'tennis',SOCCER:'soccer'
});
const preferred=['NBA','NHL','NFL','CS2','DOTA2'];
const esports=new Set(['CS2','DOTA2','VAL','LOL','COD']);
const requiredContext=code=>esports.has(code)?['rosterVersion','patchVersion','mapPoolVersion','formatVersion','rulesVersion']:['rosterVersion','seasonVersion','formatVersion','rulesVersion'];
function scheduleStatus(e,now=new Date()){
 const t=+now,at=Date.parse(e?.observedAt),until=Date.parse(e?.coverageUntil);
 if(!e||e.status!=='ok'||!e.source||!Number.isFinite(at)||at>t||t-at>6*3600000||!Number.isFinite(until)||until<t||!Number.isInteger(e.upcoming)||e.upcoming<0)return 'unknown';
 if(e.upcoming>0)return 'competition_scheduled';
 if(e.complete===true)return e.phase==='offseason'?'verified_offseason':'verified_no_upcoming_events';
 return 'unknown';
}
function classify({boardState,offers=0,pages=0,authenticated=false,explicitEmpty=false,disabledConfirmed=false,failure,schedule},now=new Date()){
 const competition=scheduleStatus(schedule,now);
 let state;
 if(failure||!authenticated)state='collector_failed';
 else if(boardState==='partial')state=pages>0?'partial_board':'collector_failed';
 else if(boardState==='populated')state=offers>0?'offers_observed':'unresolved_offer_evidence';
 else if(boardState==='empty'&&explicitEmpty&&offers===0)state='verified_empty_board';
 else if(boardState==='disabled'&&disabledConfirmed&&offers===0)state='verified_disabled_board';
 else state='collector_failed';
 return {state,competition,healthy:['offers_observed','verified_empty_board','verified_disabled_board'].includes(state),researchTasks:['historical_backtest','roster_reconciliation','context_revision_review'],paidDiscoveryAllowed:false,eligibleForModel:false};
}
function priority(code,signal,now=new Date()){
 const s=scheduleStatus(signal,now);
 return (s==='competition_scheduled'?0:s==='unknown'?20:40)+(preferred.includes(code)?preferred.indexOf(code):10+Object.keys(registry).indexOf(code));
}
function orderedPartitions(codes,books,evidence={},now=new Date()){
 return [...codes].sort((a,b)=>priority(a,evidence[a],now)-priority(b,evidence[b],now)).flatMap(code=>books.map(book=>({code,book})));
}
function contextGate(code,previous,current){
 if(!registry[code])throw Error('unsupported sport');
 const keys=requiredContext(code);
 const missing=keys.filter(k=>typeof current?.[k]!=='string'||!current[k].trim());
 const changed=keys.filter(k=>previous?.[k]&&current?.[k]&&previous[k]!==current[k]);
 const missingPrior=keys.filter(k=>typeof previous?.[k]!=='string'||!previous[k].trim());
 return {missing,missingPrior,changed,needsRevalidation:missing.length>0||missingPrior.length>0||changed.length>0,modelPromotionAllowed:false};
}
// Paid live collection requires fresh positive competition evidence, even on unknown schedules.
function lifecycle(code,signal,now=new Date(),previous=null){
 if(!registry[code])throw Error('unsupported sport');
 const state=scheduleStatus(signal,now);
 const phase=['preseason','regular','playoffs','offseason'].includes(signal?.phase)?signal.phase:null;
 const paused=state==='verified_offseason';
 const active=state==='competition_scheduled';
 const resuming=active&&(previous==='Offseason'||phase==='preseason');
 return {sport:code,state,label:paused?'Offseason':resuming?'Resuming':active?'Active':'Schedule Unknown',
  phase:state==='unknown'?null:phase,liveResearchAllowed:!paused,paidLiveAllowed:active,
  historicalResearchAllowed:true,gradingAllowed:true,requiresContextReview:active,
  predictionPromotionAllowed:false};
}
async function guardLive({code,signal,paid=false,now=new Date()},run){
 const decision=lifecycle(code,signal,now);
 if(!(paid?decision.paidLiveAllowed:decision.liveResearchAllowed))return {status:'season_gate_skipped',decision,providerCalls:0};
 return {status:'executed',decision,result:await run()};
}
function restartGate(code,previous,current,validation,phase){
 const context=contextGate(code,previous,current);
 const extra=esports.has(code)?['playerRoleVersion']:['coachingVersion','playerRoleVersion'];
 const missing=extra.filter(k=>!previous?.[k]||!current?.[k]);
 const changed=extra.filter(k=>previous?.[k]&&current?.[k]&&previous[k]!==current[k]);
 const cohort=['preseason','regular','playoffs'].includes(phase)&&validation?.[phase]?.independent===true&&validation?.[phase]?.contextVersion===current?.contextVersion&&!!current?.contextVersion;
 return {missing:[...context.missing,...context.missingPrior,...missing],changed:[...context.changed,...changed],
  requiresRevalidation:context.needsRevalidation||missing.length>0||changed.length>0||!cohort,
  eligibleForFurtherQualification:!context.needsRevalidation&&!missing.length&&!changed.length&&!!cohort,modelPromotionAllowed:false};
}
module.exports={lifecycle,guardLive,restartGate,registry,preferred,scheduleStatus,classify,orderedPartitions,contextGate,requiredContext};
