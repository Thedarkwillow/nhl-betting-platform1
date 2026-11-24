"use strict";
/** Pregame-only research for the fixed SOG attempt/defense/recency challenger.
 * All source archives must be immutable, first-Git-verified, and older than
 * the original offer. This is NOT a substitute for original app authentication.
 */
const {forecast,valid:validAttempt}=require("../scripts/report-nhl-actual-attempt-volume.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {pacificDay}=require("./nhl-opponent-opportunity-gate-v1.cjs");
const KIND="nhl_original_git_official_attempt_sog_future_v1";
const POLICY_EFFECTIVE="2026-11-23T00:00:00Z";
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const validTime=x=>Number.isFinite(dt(x));
const signature=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const failed=reason=>({status:"shadow_abstain",reason,probabilities:null});
function verifiedGames(archives,asOf){
 const until=dt(asOf),day=pacificDay(asOf),groups=new Map(),duplicates=new Set();
 if(!validTime(asOf)||!day||!Array.isArray(archives))return [];
 for(const a of archives){
  const d=a?.document,first=dt(a?.firstGitAt),generated=dt(d?.generatedAt);
  if(d?.complete!==true||!Array.isArray(d.shotAttemptRows)||!d.shotAttemptRows.length||
     !/^\d{4}-\d{2}-\d{2}$/.test(d.requestedDate||"")||
     d.requestedDate>=day||!Number.isFinite(first)||!Number.isFinite(generated)||
     generated>first||first>=until||!validTime(d.generatedAt))continue;
  const seen=new Set(),byGame=new Map();
  for(const r of d.shotAttemptRows){
   if(!validAttempt(r)||r.gameDate!==d.requestedDate||
      !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
      !/^[A-Z]{2,3}$/.test(r.team||"")||
      seen.has(r.gameId+"|"+r.playerId)){
    // Any malformed or repeated player in the source document quarantines it.
    byGame.clear();break;
   }
   seen.add(r.gameId+"|"+r.playerId);
   const items=byGame.get(r.gameId)||[];items.push(r);byGame.set(r.gameId,items);
  }
  for(const [id,rows] of byGame){
   if(groups.has(id))duplicates.add(id);
   else groups.set(id,{date:d.requestedDate,rows});
  }
 }
 const out=[];
 for(const [id,record] of groups){
  if(duplicates.has(id)||record.rows.length!==36)continue;
  const teams=[...new Set(record.rows.map(r=>r.team))];
  if(teams.length!==2||teams.some(t=>record.rows.filter(r=>r.team===t).length!==18))
   continue;
  out.push({gameId:id,gameDate:record.date,rows:record.rows,teams});
 }
 return out.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
function candidate(p,games){
 if(p?.market!=="shotsOnGoal"||p?.tier!=="Standard")return failed("not_standard_sog");
 const player=games.flatMap(g=>g.rows.filter(r=>r.playerId===p.playerId&&r.team===p.team));
 const opponentGames=games.filter(g=>g.teams.includes(p.opponent));
 const opponentDefense=opponentGames.map(g=>g.rows
   .filter(r=>r.team!==p.opponent).reduce((sum,r)=>sum+r.shotAttempts,0));
 const league=games.flatMap(g=>g.teams.map(team=>g.rows
   .filter(r=>r.team!==team).reduce((sum,r)=>sum+r.shotAttempts,0)));
 const projections=forecast(player,opponentDefense,league);
 const inputs={verifiedPlayerGames:player.length,verifiedOpponentGames:opponentDefense.length,
  verifiedLeagueTeamGames:league.length};
 if(!projections||projections.attemptRecency===null||projections.defenseRecency===null)
  return {...failed("insufficient_verified_real_attempt_player_opponent_or_league_history"),...inputs};
 const variants={};
 for(const name of ["base","attempt","defense","attemptRecency","defenseRecency"]){
  const mu=projections[name],prob=estimateCountProbabilities(mu,p.line);
  if(!Number.isFinite(mu)||mu<0||!prob)return failed("invalid_frozen_sog_distribution");
  const side=prob.higher>prob.lower?"Higher":prob.lower>prob.higher?"Lower":null;
  variants[name]={status:"research_only",estimate:Number(mu.toFixed(6)),
   probabilities:prob,side,calibrated:false,modelPromoted:false};
 }
 return {status:"research_only",...inputs,variants,
  originalLine:p.line,originalSide:p.lean,
  actualShotAttemptsObservedBeforeFreeze:true,
  projectedIceTimeIsHistoricalNotConfirmed:true,
  officialOpponentDefenseOpportunityUsed:true,
  calibrated:false,bettingEligible:false,platformPayoutEV:null};
}
function freeze(snapshot,archives){
 const basic={kind:KIND,generatedAt:snapshot?.generatedAt||null,
  status:"original_pregame_research_only",policyEffectiveAt:POLICY_EFFECTIVE,
  originalAppOfferAuthenticated:false,sourceFirstGitRequired:true,
  independentCalibrationApproved:false,realPlatformPayoutVerified:false,
  modelPromoted:false,productionEligible:false,bettingEligible:false,
  placedWagers:0,rows:[]};
 if(!validTime(snapshot?.generatedAt)||dt(snapshot.generatedAt)<dt(POLICY_EFFECTIVE)||
   !Array.isArray(snapshot?.individualPropSelections)||!Array.isArray(snapshot?.rankedProps))
  return {...basic,status:"not_enrolled_before_policy_or_missing_source"};
 const games=verifiedGames(archives,snapshot.generatedAt),seen=new Set(),rows=[];
 for(const original of snapshot.individualPropSelections.filter(x=>x.market==="shotsOnGoal"&&x.tier==="Standard")){
  const key=signature(original),clock=dt(snapshot.generatedAt),start=dt(original.gameStartAt);
  const raw=snapshot.rankedProps.filter(x=>signature(x)===key&&x.lean===original.lean&&
   x.capturedAt===original.capturedAt&&x.gameStartAt===original.gameStartAt);
  if(seen.has(key)||raw.length!==1||!["Higher","Lower"].includes(original.lean)||
     !Number.isFinite(original.line)||original.line<0||
     !Number.isFinite(start)||start-clock<15*60000||
     !validTime(original.capturedAt)||dt(original.capturedAt)>clock||
     clock-dt(original.capturedAt)>30*60000)
   return {...basic,status:"not_enrolled_invalid_original_offer_or_clock",rows:[]};
  seen.add(key);
  const model=candidate(original,games);
  rows.push({gameId:original.gameId,playerId:original.playerId,
   market:original.market,tier:original.tier,line:original.line,
   capturedAt:original.capturedAt,gameStartAt:original.gameStartAt,
   originalSide:original.lean,originalProbability:original.probability,
   ...model,calibrated:false,bettingEligible:false,modelPromoted:false});
 }
 return {...basic,originalStandardSog:rows.length,
  sourceVerifiedHistoricalGames:games.length,
  registeredResearchVariants:rows.filter(x=>x.status==="research_only").length,
  rows,status:rows.length?"precommitted_research_only":"no_original_standard_sog_offer"};
}
module.exports={KIND,POLICY_EFFECTIVE,verifiedGames,candidate,freeze,signature};
