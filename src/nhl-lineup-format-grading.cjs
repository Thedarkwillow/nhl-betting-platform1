"use strict";
// Whole-slip model diagnostic. Only explicit immutable pregames, exact original
// ranked rows and official final stat directions. No wager or settlement audit.
const {referenceBounds}=require("./lineup-reference-payout-bounds.cjs");
const {scenario,eligibleVector}=require("./nhl-lineup-format-scenario.cjs");
const {validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const markets=new Set(["shotsOnGoal","goals","assists","points","blockedShots","saves"]);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.lean,p.tier]);
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const team=x=>({"SJ":"SJS","TB":"TBL","NJ":"NJD","LA":"LAK"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
function audit(frames,history,schedule,{firstPolicyCommit}={}){
 if(!Array.isArray(frames)||!history?.players||!Array.isArray(schedule?.games)||
    !Number.isFinite(at(firstPolicyCommit)))throw Error("Original format policy, official schedule and final history required");
 const official=new Map(schedule.games.map(g=>[g.id,g])),seen=new Set(),groups={},excluded={},resolvedScenarioObservations=[];
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const frame of [...frames].sort((a,b)=>at(a.firstCommittedAt)-at(b.firstCommittedAt))){
  const s=frame.snapshot,f=s?.privateFormatLineupResearch,recorded=at(s?.generatedAt),archived=at(frame.firstCommittedAt);
  if(f?.kind!=="nhl_private_power_flex_scenario_v1"||!f.power||!f.flex){skip("no_frozen_format_scenario");continue;}
  if(frame.gitHistoryCount!==1||!Number.isFinite(archived)||!Number.isFinite(recorded)||
     recorded<at(firstPolicyCommit)||f.generatedAt!==s.generatedAt||f.researchOnly!==true){skip("first_git_proof_invalid");continue;}
  const raw=new Map();
  for(const p of s.rankedProps||[]){const k=key(p);if(!raw.has(k))raw.set(k,[]);raw.get(k).push(p);}
  for(const format of ["power","flex"])for(let n=format==="power"?2:3;n<=6;n++){
   const l=f[format][n];if(!l)continue;
   const picks=l.picks||[],games=new Set(),players=new Set();let valid=picks.length===n&&l.strictIndependentGamesOnly===true;
   for(const p of picks){
    const g=official.get(p.gameId),start=at(g?.startTimeUTC),matching=raw.get(key(p))||[];
    const teams=[team(g?.home),team(g?.away)];
    if(!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||!markets.has(p.market)||
      p.model!=="weighted-form-v1"||p.tier!=="Standard"||!Number.isFinite(p.line)||
      !eligibleVector(p)||!teams.includes(team(p.team))||!teams.includes(team(p.opponent))||
      team(p.team)===team(p.opponent)||Math.abs(at(p.gameStartAt)-start)>300000||
      !Number.isFinite(at(p.gameStartAt))||Math.abs(at(p.eventStartsAt)-start)>300000||
      !Number.isFinite(at(p.eventStartsAt))||
      !validArchiveChronology(at(p.capturedAt),recorded,archived,start)||
      archived>=start-15*60000||matching.length!==1||
      matching[0].capturedAt!==p.capturedAt||matching[0].eventStartsAt!==p.eventStartsAt||
      !near(matching[0].probability,p.probability)||!eligibleVector(matching[0]))valid=false;
    games.add(p.gameId);players.add(p.playerId);
   }
   if(!valid||games.size!==n||players.size!==n){skip("invalid_original_legs");continue;}
   const pacificSlates=[...new Set(picks.map(p=>pacificDay(p.gameStartAt)))];
   // UTC calendar days are NOT the NHL slate. A multi-Pacific-date entry
   // cannot count as one independent nightly paper lineup validation trial.
   if(pacificSlates.length!==1||!pacificSlates[0]){
    skip("cross_pacific_slate_lineup");continue;
   }
   const calculated=scenario(picks.map(p=>p.probability),format),logged=l.privateFormatScenario;
   if(!calculated||logged?.format!==format||!Array.isArray(logged.modeledCountMass)||
      logged.modeledCountMass.length!==n+1||
      !calculated.modeledCountMass.every((v,i)=>near(v,logged.modeledCountMass[i]))||
      !near(calculated.hypotheticalGrossWeight,logged.hypotheticalGrossWeight)){skip("scenario_mismatch");continue;}
   const id=JSON.stringify([format,n,picks.map(key).sort()]);
   if(seen.has(id)){skip("repeat_exact_slip");continue;}seen.add(id);
   const stress=referenceBounds(picks.map(p=>p.probability),format);
   const k=format+"_"+n,b=groups[k]||(groups[k]={registered:0,pending:0,excludedPush:0,missingFinalStat:0,
     decided:0,allCorrect:0,sumAllCorrectProbability:0,sumBrier:0,sumLogLoss:0,observedHitCount:Array(n+1).fill(0),referenceGrossLowerSum:0,referenceGrossUpperSum:0,referenceIndependentGrossSum:0});
   b.registered++;b.referenceGrossLowerSum+=stress.referenceGrossLower;b.referenceGrossUpperSum+=stress.referenceGrossUpper;b.referenceIndependentGrossSum+=stress.independentReferenceGross;
   let correct=0,missing=false,pending=false,push=false;
   for(const p of picks){
    const results=(history.players[String(p.playerId)]?.games||[]).filter(g=>g.gameId===p.gameId&&g.playerId===p.playerId);
    if(results.length!==1||!["FINAL","OFF"].includes(results[0].gameState)||results[0].type!==(p.market==="saves"?"goalie":"skater")||!Number.isFinite(results[0].timeOnIceSeconds)||results[0].timeOnIceSeconds<=0){pending=true;continue;}
    const actual=results[0][p.market];
    if(!Number.isInteger(actual)||actual<0){missing=true;continue;}
    if(actual===p.line){push=true;continue;}
    correct+=Number((actual>p.line?"Higher":"Lower")===p.lean);
   }
   if(pending){b.pending++;continue;}
   if(missing){b.missingFinalStat++;continue;}
   if(push){b.excludedPush++;continue;}
   resolvedScenarioObservations.push({id,formatSize:k,
    slate:pacificSlates[0],slateTimeZone:"America/Los_Angeles",
    frozenAt:frame.firstCommittedAt,mass:calculated.modeledCountMass,hits:correct});
   b.decided++;b.allCorrect+=Number(correct===n);b.observedHitCount[correct]++;
   b.sumAllCorrectProbability+=calculated.allCorrect;
   b.sumBrier+=calculated.modeledCountMass.reduce((a,v,i)=>a+(v-Number(i===correct))**2,0);
   b.sumLogLoss-=Math.log(Math.max(1e-12,calculated.modeledCountMass[correct]));
  }
 }
 for(const b of Object.values(groups)){
  b.referenceDependenceStress={registered:b.registered,meanLower:b.referenceGrossLowerSum/b.registered,meanUpper:b.referenceGrossUpperSum/b.registered,meanIndependent:b.referenceIndependentGrossSum/b.registered,verifiedEV:null,referenceOnly:true};
  b.hitCountBrier=b.decided?b.sumBrier/b.decided:null;
  b.hitCountLogLoss=b.decided?b.sumLogLoss/b.decided:null;
  b.allCorrectFrequency=b.decided?b.allCorrect/b.decided:null;
  b.meanModeledAllCorrect=b.decided?b.sumAllCorrectProbability/b.decided:null;
  b.distinctResolvedPacificSlates=new Set(resolvedScenarioObservations
   .filter(r=>r.formatSize===Object.keys(groups).find(k=>groups[k]===b))
   .map(r=>r.slate)).size;
  b.minimumIndependentPacificSlateSample=50;
  b.additionalPacificSlatesToReview=Math.max(0,50-b.distinctResolvedPacificSlates);
  b.eligibleForPayoutAdjustedRelease=false;
 }
 return {kind:"nhl_private_precommitted_format_scenario_audit_v1",groups,excluded,resolvedScenarioObservations,
  researchOnly:true,overlappingSlipsNotIndependent:true,pooledSampleSize:null,
  noVerifiedJointProbability:true,platformSettlementVerified:false,verifiedROI:null,
  productionEligible:false,warning:"First-write format scenarios; official stat outcomes only. Pushes and missing final stats excluded. Shared legs and games make slips dependent; no independent evidence of betting returns."};
}
module.exports={audit};
