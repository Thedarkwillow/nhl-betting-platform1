"use strict";
/**
 * Point-in-time historical NHL team-by-team opponent coverage diagnostic.
 * This is never a model probability, verified live prop or bet eligibility.
 * It reads only official archive evidence and never refits earlier freezes.
 */
const fs=require("node:fs"),path=require("node:path");
const {archivedGames,verifyOpponentAttempts,verifyOpponentConcessions}=
 require("../src/nhl-opponent-opportunity-gate-v1.cjs");
const ROOT=path.resolve(__dirname,"..");
const TEAMS=Object.freeze(("ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH").split(" "));
const markets=["shotsOnGoal","points","assists","blockedShots"];
function build({concessions=[],attempts=[],asOf=new Date().toISOString()}={}){
 if(!Number.isFinite(Date.parse(asOf))||!Array.isArray(concessions)||!Array.isArray(attempts))
  throw Error("Valid as-of clock and official source archive arrays required");
 const evidence=Object.fromEntries(TEAMS.map(team=>{
  const by={};
  for(const market of markets){
   const q=market==="blockedShots"?
    // Historical official team shot attempts are available from either
    // distinct archive series. Duplicate game IDs do not count twice.
    verifyOpponentAttempts([...attempts,...concessions],team,asOf):
    verifyOpponentConcessions(concessions,team,asOf,market);
   by[market]={verifiedPriorGames:q.priorDistinctGames,
    lastPriorDate:q.lastPriorDate,minimumRequiredGames:q.minimumRequiredGames,
    sampleSourceQualified:q.verified===true,reason:q.reason,
    sourceMean:market==="blockedShots"?q.attemptsForPerGame:q.concededPerGame};
  }
  return [team,by];
 }));
 const coverage={};
 for(const market of markets){
  const stats=TEAMS.map(t=>evidence[t][market]);
  coverage[market]={teamsEvaluated:stats.length,
   teamsAtEightSourceVerified:stats.filter(s=>s.sampleSourceQualified).length,
   teamsWithFourOrMorePriorGames:stats.filter(s=>s.verifiedPriorGames>=4).length,
   maxVerifiedPriorGames:Math.max(...stats.map(s=>s.verifiedPriorGames)),
   minimumRequiredGames:8};
 }
 const countGames=files=>new Set(files.flatMap(a=>archivedGames(a).map(g=>g.gameId))).size;
 return {kind:"nhl_historical_opponent_concession_coverage_v1",
  generatedAt:asOf,source:"NHL official complete final-game archives",
  verifiedConcessionArchiveGames:countGames(concessions),
  verifiedAttemptArchiveGames:countGames(attempts),
  byMarket:coverage,byOpponent:evidence,
  asOfHistoricalOnly:true,researchOnly:true,sourceFirstGitBeforeAnyFutureFreezeStillRequired:true,
  historicalSourceDataCannotRequalifyOlderSelections:true,
  opponentOpportunityAloneNeverProvesPlayerProjection:true,
  allMarketProbabilitiesUncalibrated:true,originalPlatformOfferAuthenticated:false,
  approvedHighConfidencePicks:0,approvedLineups:0,bettingEligible:false,
  paidProviderRequests:0};
}
function archived(dir){
 const folder=path.join(ROOT,dir);
 if(!fs.existsSync(folder))return [];
 const files=fs.readdirSync(folder).filter(n=>
  /^\d{4}-\d{2}-\d{2}(?:__\d{10})?\.json$/.test(n)).sort().slice(-900);
 return files.flatMap(n=>{try{
  const doc=JSON.parse(fs.readFileSync(path.join(folder,n),"utf8"));
  return archivedGames(doc).length?[doc]:[];
 }catch{return [];}});
}
function main(){
 const now=new Date().toISOString();
 const result=build({asOf:now,
  concessions:archived("outputs/research/nhl-opponent-concessions-history"),
  attempts:archived("outputs/research/nhl-block-exposure-history")});
 const out=path.join(ROOT,"outputs/health/nhl-opponent-concession-coverage-latest.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({kind:result.kind,asOf:now,
  officialScoringGames:result.verifiedConcessionArchiveGames,
  officialBlockAttemptGames:result.verifiedAttemptArchiveGames,
  byMarket:result.byMarket,bettingEligible:false,providerCalls:0}));
 return result;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1}
module.exports={build,archived,main,TEAMS};
