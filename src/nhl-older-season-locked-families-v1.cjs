"use strict";
/**
 * FIXED LOCKED CHRONOLOGICAL SPLIT. Warmup: 2023-24; fit/select families:
 * 2024-25; evaluate without refitting: 2025-26. Only synthetic half-lines
 * from independently staged MoneyPuck historical game rows. NOT the NHL
 * first-Git PrizePicks/Underdog original-line cohorts, and the 2025-26
 * season has previously informed other project research (not pristine).
 * Future validation remains the sole promotion path. No live picks/EV.
 */
const {distribution}=require("./nhl-market-distribution-availability.cjs");
const {POLICY}=require("./nhl-market-direction-research-v1.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const MARKETS=Object.freeze({
 shotsOnGoal:Object.freeze([1.5,2.5,3.5]),
 points:Object.freeze([.5,1.5]),
 assists:Object.freeze([.5,1.5]),
 blockedShots:Object.freeze([.5,1.5,2.5])
});
const FAMILIES=Object.freeze(["empirical","shifted","poisson",
 "negativeBinomial","hurdle","fixed20261120"]);
const MARKER="nhl_older_season_locked_market_family_trial_v1";
const finite=Number.isFinite,integer=x=>Number.isInteger(x)&&x>=0;
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const season=g=>Number(String(g.gameId).slice(0,4));
const valid=g=>g&&g.type==="skater"&&["FINAL","OFF"].includes(g.gameState)&&
 Number.isInteger(g.gameId)&&Number.isInteger(g.playerId)&&
 ["2023","2024","2025"].includes(String(g.gameId).slice(0,4))&&
 typeof g.gameDate==="string"&&/^202[3-6]-\d\d-\d\d$/.test(g.gameDate)&&
 g.gameDate>=String(season(g))+"-09-01"&&
 g.gameDate<String(season(g)+1)+"-07-01"&&
 finite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>=180&&
 g.timeOnIceSeconds<=3900&&
 typeof g.team==="string"&&g.team.length>=2;
function probs(prior,m,line){
 const full=prior.filter(g=>integer(g[m])&&valid(g)).slice(-30);
 if(full.length<10)return null;
 const last=full.slice(-10),five=last.slice(-5),
  ice=.65*mean(last.map(g=>g.timeOnIceSeconds))+
      .35*mean(five.map(g=>g.timeOnIceSeconds)),
  prevIce=full.reduce((x,g)=>x+g.timeOnIceSeconds,0);
 if(prevIce<=0||ice<180)return null;
 const values=full.map(g=>g[m]),mu=values.reduce((a,b)=>a+b,0)*ice/prevIce,
  d=distribution(values,mu,line,"count");
 if(!d||FAMILIES.slice(0,5).some(k=>!finite(d[k])||d[k]<=0||d[k]>=1))
  return null;
 const w=POLICY[m],fixed=m==="shotsOnGoal"?
  w.nb*d.negativeBinomial+w.shift*d.shifted:
  m==="points"?w.nb*d.negativeBinomial+w.hurdle*d.hurdle:
  m==="assists"?w.hurdle*d.hurdle+w.empirical*d.empirical:
  w.nb*d.negativeBinomial+w.empirical*d.empirical;
 return {empirical:d.empirical,shifted:d.shifted,poisson:d.poisson,
  negativeBinomial:d.negativeBinomial,hurdle:d.hurdle,fixed20261120:fixed,
  asOfPriorDate:full.at(-1).gameDate,historyGames:full.length};
}
function accumulator(){
 return {n:0,games:new Set(),dates:new Set(),
  higher:0,lower:0,
  by:Object.fromEntries(FAMILIES.map(k=>[k,{
    brier:0,logLoss:0,wins:0,vsLower:new Map(),vsHigher:new Map()
  }]))};
}
function incr(a,y,day,gameId,q){
 a.n++;a.games.add(gameId);a.dates.add(day);
 a.higher+=y;a.lower+=1-y;
 for(const k of FAMILIES){
  const p=q[k],x=a.by[k],win=Number((p>.5)===Boolean(y));
  x.brier+=(p-y)**2;
  x.logLoss-=Math.log(y?p:1-p);
  x.wins+=win;
  for(const [map,diff] of [[x.vsLower,win-(1-y)],[x.vsHigher,win-y]]){
   const g=map.get(gameId)||{n:0,diff:0};g.n++;g.diff+=diff;map.set(gameId,g);
  }
 }
}
const rate=(a,n)=>n?a/n:null;
function compact(a){
 return {thresholds:a.n,distinctGames:a.games.size,distinctDates:a.dates.size,
  alwaysHigherWins:a.higher,alwaysHigherRate:rate(a.higher,a.n),
  alwaysLowerWins:a.lower,alwaysLowerRate:rate(a.lower,a.n),
  models:Object.fromEntries(FAMILIES.map(k=>{
   const x=a.by[k];return [k,{wins:x.wins,losses:a.n-x.wins,
    hitRate:rate(x.wins,a.n),brier:rate(x.brier,a.n),
    logLoss:rate(x.logLoss,a.n),
    vsAlwaysLowerGame95:ci([...x.vsLower.values()]),
    vsAlwaysHigherGame95:ci([...x.vsHigher.values()],{baseline:"Higher"})}];
  }))};
}
function study(rows){
 if(!Array.isArray(rows))throw Error("Temporary three-season official result rows required");
 const days=new Map(),seen=new Set(),source={
  uniqueValidSkaterGames:0,duplicates:0,invalid:0,
  bySeason:{2023:0,2024:0,2025:0}};
 for(const g of rows){
  if(!valid(g)){source.invalid++;continue;}
  const k=g.gameId+"|"+g.playerId;
  if(seen.has(k)){source.duplicates++;continue;}
  seen.add(k);source.uniqueValidSkaterGames++;source.bySeason[season(g)]++;
  const x=days.get(g.gameDate)||[];x.push(g);days.set(g.gameDate,x);
 }
 if(source.duplicates>0)throw Error("Duplicate source game/player identity");
 const history=new Map(),all=Object.fromEntries([2024,2025].map(y=>[y,
  Object.fromEntries(Object.keys(MARKETS).map(m=>[m,accumulator()]))]));
 let tested=0,leaks=0,seasonFirst=Object.fromEntries([2023,2024,2025].map(y=>[y,null]));
 for(const [day,gs] of [...days.entries()].sort(([a],[b])=>a.localeCompare(b))){
  const y=season(gs[0]);
  if(seasonFirst[y]===null)seasonFirst[y]=day;
  // Entire game date is scored before ANY same-day result becomes history.
  for(const g of gs){
   if(season(g)!==y)throw Error("Mixed source season on same game date");
   if(y!==2024&&y!==2025)continue;
   const prior=history.get(g.playerId)||[];
   for(const [m,lines] of Object.entries(MARKETS)){
    if(!integer(g[m]))continue;
    for(const line of lines){
     const p=probs(prior,m,line);
     if(!p)continue;
     if(p.asOfPriorDate>=day){leaks++;continue;}
     incr(all[y][m],Number(g[m]>line),day,g.gameId,p);tested++;
    }
   }
  }
  for(const g of gs){
   const h=history.get(g.playerId)||[];h.push(g);
   history.set(g.playerId,h.slice(-45));
  }
 }
 if(leaks)throw Error("Target or same-day game leaked into historical forecast");
 const train=all[2024],hold=all[2025],training={},
  evaluation={},choices={},checks={};
 for(const m of Object.keys(MARKETS)){
  const tr=compact(train[m]),ev=compact(hold[m]);
  const eligible=tr.thresholds>=300&&tr.distinctGames>=40&&
   tr.distinctDates>=20;
  const chosen=eligible?[...FAMILIES].sort((a,b)=>
   tr.models[a].brier-tr.models[b].brier||FAMILIES.indexOf(a)-FAMILIES.indexOf(b))[0]:null;
  training[m]=tr;
  evaluation[m]={...ev,trainingSelectedFamily:chosen,
   selectedOnTrainingOnly:chosen?ev.models[chosen]:null,
   selectionWasFrozenBeforeHoldout:true,
   descriptiveBeatsAlwaysLower:chosen&&ev.models[chosen].wins>ev.alwaysLowerWins,
   descriptiveBeatsAlwaysHigher:chosen&&ev.models[chosen].wins>ev.alwaysHigherWins};
  choices[m]=chosen;
  checks[m]={sufficientTraining:eligible,
   evaluationGames:ev.distinctGames,
   evaluationDates:ev.distinctDates,
   historicalEvidenceAdequate:eligible&&ev.thresholds>=300&&
     ev.distinctGames>=40&&ev.distinctDates>=20};
 }
 return {kind:MARKER,generatedAt:new Date().toISOString(),
  warmupSeason:"2023-24",trainingSeason:"2024-25",evaluationSeason:"2025-26",
  trainingCutoff:"2025-07-01",evaluationCutoff:"2026-07-01",
  evaluationNeverUsedForFamilySelection:true,
  testedSyntheticThresholds:tested,
  thresholds:MARKETS,families:FAMILIES,
  source,training,selectedFamilies:choices,evaluation,checks,
  flags:{temporaryHistoricalSourceRowsNotPublished:true,
   targetDateScoredBeforeDailyHistoryUpdate:true,
   noSyntheticFeaturesFabricated:true,
   historicalHoldoutPreviouslyStudiedByProject:true,
   notUntouchedProspectiveEvidence:true,
   noHistoricalPrizePicksOrUnderdogQuotes:true,
   onlyConditionalOnHistoricalAppearance:true,
   historicalPowerPlayAndDefensiveZoneInputsNotAuthenticated:true,
   oppositePlatformSideBookabilityUnknown:true,
   noFutureOutcomeInTrainingOrPreGameFeatures:true,
   noAutomatedPromotion:true,calibrated:false,bettingEligible:false,
   verifiedExpectedValue:false,placedWagers:0}};
}
module.exports={MARKER,MARKETS,FAMILIES,probs,study};
