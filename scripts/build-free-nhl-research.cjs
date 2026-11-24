"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const {normalizeSchedule}=require("../src/schedule.cjs");
const {identifyGame}=require("../src/nhl-game-identity.cjs");
const {buildOpponentContext}=require("../src/nhl-opponent-context.cjs");
const {backtestContext}=require("../src/nhl-context-backtest.cjs");
const {applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const {revalidateResearchLineups}=require("../src/nhl-lineup-revalidation.cjs");
const {prepareDistributionSnapshot}=require("../src/nhl-distribution-snapshot.cjs");
const {selectIndividualProps,POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const {frozenSelectionReadiness}=require("../src/nhl-prospective-freeze-readiness.cjs");
const {freezeSimpleBenchmarks}=require("../src/nhl-simple-pregame-challengers.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function optional(p){try{return read(p);}catch{return null;}}
async function resolveSchedule(out,{client=fetch,cached=optional("outputs/official-nhl/season-schedules/2026-27.json")}={}){
 const dates=new Set();
 for(const p of out.rankedProps){
  const time=Date.parse(p.eventStartsAt);
  if(!Number.isFinite(time))continue;
  dates.add(new Date(time).toISOString().slice(0,10));
  // An NHL game starting after midnight UTC belongs to the previous
  // North American local calendar date; NHL schedule(date) is date-scoped.
  dates.add(new Date(time-86400000).toISOString().slice(0,10));
 }
 const games=new Map(),errors=[];
 // The Git-archived complete official season schedule is an independent
 // identity fallback when the live NHL schedule endpoint times out.
 // Never infer game IDs from name-only or approximate team matches.
 if(cached?.complete===true&&Array.isArray(cached.games))
  for(const g of cached.games)
   if(Number.isInteger(g.id)&&g.home&&g.away&&Number.isFinite(Date.parse(g.startTimeUTC)))
    games.set(g.id,g);
 for(const date of [...dates].slice(0,5)){
  try{
   const res=await client("https://api-web.nhle.com/v1/schedule/"+date,{signal:AbortSignal.timeout(18000)});
   if(!res.ok)throw Error("NHL schedule HTTP "+res.status);
   for(const g of normalizeSchedule(await res.json())){
    // The current official schedule supersedes a cached entry for the
    // same home/away fixture and start, even if a corrected game ID differs.
    // Otherwise two versions would look like ambiguous duplicate games.
    for(const [id,old] of games){
     if(id!==g.id&&old.home===g.home&&old.away===g.away&&
        Number.isFinite(Date.parse(old.startTimeUTC))&&
        Date.parse(old.startTimeUTC)===Date.parse(g.startTimeUTC))
      games.delete(id);
    }
    games.set(g.id,g);
   }
  }catch(e){errors.push({date,error:e.message});}
 }
 let count=0,mismatch=0;
 for(const p of out.rankedProps){
  // Restrict candidate identity to the original captured event time;
  // other cached games between the same clubs must never create ambiguity.
  const expectedStart=Date.parse(p.eventStartsAt);
  const candidates=Number.isFinite(expectedStart)?[...games.values()].filter(g=>
   Number.isFinite(Date.parse(g.startTimeUTC))&&
   Math.abs(Date.parse(g.startTimeUTC)-expectedStart)<=300000):[];
  const g=identifyGame(p,candidates);
  if(!g)continue;
  if(Math.abs(Date.parse(g.gameStartAt)-Date.parse(p.eventStartsAt))>300000){mismatch++;continue;}
  p.gameId=g.gameId;p.gameStartAt=g.gameStartAt;count++;
 }
 out.gameIdentityResolved=count;
 out.cachedOfficialSeasonScheduleUsed=cached?.complete===true&&Array.isArray(cached.games);
 out.cachedOfficialSeasonScheduleArchivedAt=cached?.generatedAt||null;
 out.gameIdentityStartMismatches=mismatch;
 out.gameIdentityErrors=errors;
 out.gameIdentityMethod="Unambiguous cached or live official NHL schedule matching both teams and event start within 5 minutes";
 out.gradingEligibility="Only official-game-ID props archived in GitHub before puck drop count; verified game stats required";
}
async function main(){
 const history=read("outputs/history/players.json");
 const audit=backtestContext(history);
 const context=buildOpponentContext(history,{beforeDate:new Date().toISOString().slice(0,10)});
 context.approvedMarkets=Object.entries(audit.byMarket).filter(([market,result])=>result.adjustmentPassed).map(([market])=>market);
 const auditFile=path.join(root,"outputs/backtests/nhl-context-latest.json");
 fs.mkdirSync(path.dirname(auditFile),{recursive:true});
 fs.writeFileSync(auditFile,JSON.stringify({...audit,generatedAt:new Date().toISOString()},null,2)+"\n");
 const usage=optional("outputs/nhl-usage/latest.json");
 // All new categories are research-only, and require exact previous official
 // player stats, a specialized distribution, and an earlier frozen model.
 // Absent shadows leave legacy six-market research unchanged.
 const experimental={priorityShadow:optional("outputs/projections/nhl-four-priority-shadow-latest.json"),
  extraShadow:optional("outputs/projections/nhl-extra-market-shadow-latest.json"),
  officialHistory:history,
  periodHistory:optional("outputs/period-stats/history.json")};
 const out=buildFreeNhlResearch(read("outputs/free-source/nhl/latest.json"),
  read("outputs/projections/players.json"),new Date().toISOString(),
  context,usage,experimental);
 if(!out.boardFresh||!out.projectionsFresh)throw Error("Stale source or model; no archive");
 await resolveSchedule(out);
 const intel=optional("outputs/pregame-availability/latest.json");
 out.rankedProps=out.rankedProps.map(p=>applyPregameSignal(p,intel,out.generatedAt));
 out.lineups=optimize(out.rankedProps,{at:out.generatedAt});
 const priorResearch=optional("outputs/free-source/nhl/research-latest.json");
 out.lineupReoptimizationAudit=revalidateResearchLineups(priorResearch,out,{
  now:out.generatedAt,newBoardComplete:out.boardCoverageComplete===true,
  sourceSame:priorResearch?.source===out.source
 });
 // Independent player prop preferences are preselected and Git-frozen here,
 // even if the optimizer never chooses them for a 2–6 pick lineup.
 const individuals=selectIndividualProps(out.rankedProps);
 out.individualPropSelectionPolicy=POLICY;
 out.individualPropSelections=individuals.selected;
 out.individualPropSelectionSummary={
  eligibleOriginalOfferGroups:individuals.availableUniqueProps,
  selectedUniqueIndividualProps:individuals.selectedUniqueProps,
  modelProbabilityThreshold:individuals.modelHitProbabilityThreshold,
  abstentions:individuals.abstained,
  excludedSourceRows:individuals.exclusions,
  rankedHigherLowerSideIsNotAutomaticallyASelection:true,
  frozenBeforeGameOnlyWhenGitCommitPredatesPuckDrop:true,
  originalPlatformSettlementsVerified:false,expectedValueVerified:false,
  modelProbabilitiesCalibrated:false,
  individuallyRankedRegardlessOfOptimizerLineup:true
 };
 out.pregameIntelligence={sourceCapturedAt:intel?.generatedAt||null,
  sourceAvailable:!!intel,sourceLicenseForCommercialUseVerified:false,
  firstPartyGoalieConfirmationAvailable:false,
  externalReportedGoalieConfirmations:intel?.goalieReportedConfirmed||0,
  injuryWatchlist:out.rankedProps.filter(p=>p.roleEvidence?.reasons?.includes("EXTERNAL_INJURY_OUT_OR_IR_REPORT")||p.roleEvidence?.reasons?.includes("EXTERNAL_INJURY_UNCERTAIN_REPORT")).length,
  allPlayerMedicalClearancesVerified:false,
  forwardLineupAndPowerPlayVerified:false};
 // An apparently complete board without an original precommitted
 // Higher/Lower model selection is useful as a source archive, but it is NOT
 // an eligible prospective model capture. Reject before writing research.
 const freezeGate=frozenSelectionReadiness({research:out,now:new Date().toISOString()});
 console.log(JSON.stringify({freezeReadiness:freezeGate.ready,
  eligibleIndividualSelections:freezeGate.selectedIndividualProps,
  freezeBlockReasons:freezeGate.reasons,
  GitCommitBeforePuckDropStillRequired:true}));
 if(process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT,"frozen="+freezeGate.ready+"\n");
 if(!freezeGate.ready){
  // Empty/no-identity selections must NEVER replace a previous frozen cohort.
  // The separately versioned model PREVIEW is already archived to the
  // source repository. No retrospective upgrade to an official pick.
  console.warn("::warning::No new immutable prospective picks; "+
   freezeGate.reasons.join(", ")+"; existing frozen snapshots untouched.");
  return {status:"research_preview_only",freshSource:out.boardFresh,
   independentBoardRows:out.totalRows,uncommittedIndividualPicks:0};
 }
 // The exact original model choices and the three baseline challenger sides
 // enter the SAME first Git-frozen original research snapshot. A postgame
 // historical replay may never be called a prospective challenger.
 out.simplePregameBenchmarks=freezeSimpleBenchmarks(out.individualPropSelections,history,
  {now:out.generatedAt});
 const dir=path.join(root,"outputs/free-source/nhl"),grade=path.join(root,"outputs/research/snapshots");
 fs.mkdirSync(path.join(dir,"research-snapshots"),{recursive:true});fs.mkdirSync(grade,{recursive:true});
 const stamp=out.generatedAt.slice(0,19).replace(/[-:]/g,"")+"Z",json=JSON.stringify(out,null,2)+"\n";
 const candidate=prepareDistributionSnapshot(out,history,
  optional("outputs/projections/nhl-market-trained-v3-latest.json"));
 const shadowDir=path.join(root,"outputs/projections/distribution-snapshots");
 fs.mkdirSync(shadowDir,{recursive:true});
 const frozenFile=path.join(shadowDir,stamp+".json");
 // First-write immutable source snapshot; never rewrite a frozen per-offer
 // challenger prediction after game completion or a source refresh.
 fs.writeFileSync(frozenFile,JSON.stringify(candidate)+"\n",{flag:"wx"});
 fs.writeFileSync(path.join(root,"outputs/projections/distribution-shadow-latest.json"),
  JSON.stringify(candidate)+"\n");
 fs.writeFileSync(path.join(dir,"research-latest.json"),json);
 fs.writeFileSync(path.join(dir,"research-snapshots",stamp+".json"),json);
 fs.writeFileSync(path.join(grade,stamp+".json"),json);
 console.log(JSON.stringify({ranked:out.matchedRows,officialGameIds:out.gameIdentityResolved,
  gameIdentityErrors:out.gameIdentityErrors.length,
  frozenDistributionShadowRows:candidate.rows.length,shadowExclusions:candidate.exclusions,
  gitCommitPregameVerified:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,resolveSchedule};
