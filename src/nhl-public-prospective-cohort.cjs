"use strict";
/**
 * Public only as aggregated precommitted NHL outcome counts. No player IDs,
 * exact lines, private model identities, unlicensed source offers or returns.
 */
const PACIFIC="America/Los_Angeles";
const SCORECARD_KIND="nhl_public_cohort_aggregate_official_stat_v1";
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function pacificDay(iso){
 const d=date(iso);if(d===null)return null;
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:PACIFIC,year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(d));
 const val=k=>parts.find(x=>x.type===k)?.value;
 return [val("year"),val("month"),val("day")].join("-");
}
function wilson95(correct,decided){
 if(!Number.isInteger(correct)||!Number.isInteger(decided)||decided<=0||
  correct<0||correct>decided)return null;
 const z=1.959963984540054,z2=z*z,p=correct/decided,denom=1+z2/decided,
  middle=(p+z2/(2*decided))/denom,
  half=z*Math.sqrt(p*(1-p)/decided+z2/(4*decided*decided))/denom;
 return {lower:Number(Math.max(0,middle-half).toFixed(4)),
  upper:Number(Math.min(1,middle+half).toFixed(4)),
  method:"Wilson 95%, unclustered; same-game dependence not modeled"};
}
function aggregate(recordGroups,{minimumPublishedDecisions=10}={}){
 const safeGroups=Object.entries(recordGroups).map(([group,rows])=>{
  const x={group,picks:rows.length,pending:0,correct:0,incorrect:0,push:0};
  for(const r of rows){
   if(r.selectionStatus==="pending_official_player_stats")x.pending++;
   else if(r.selectionStatus==="correct")x.correct++;
   else if(r.selectionStatus==="incorrect")x.incorrect++;
   else if(r.selectionStatus==="push")x.push++;
   else throw Error("Unknown original prospective result state");
  }
  const decided=x.correct+x.incorrect,graded=decided+x.push;
  const publish=decided>=minimumPublishedDecisions;
  return {...x,decided,graded,
   observedRate:publish?Number((x.correct/decided).toFixed(4)):null,
   wilson95:publish?wilson95(x.correct,decided):null,
   smallSampleWithheld:decided>0&&!publish};
 });
 return safeGroups.sort((a,b)=>b.picks-a.picks||a.group.localeCompare(b.group));
}
function buildPublicProspectiveCohort(ledger,{minimumPublishedDecisions=10}={}){
 const unavailable=(why)=>({kind:SCORECARD_KIND,status:why,
  sourceEvidence:"Original Git-first-added NHL model selections and official completed game stats",
  cohortVerified:false,counts:{registered:0,correct:0,incorrect:0,push:0,pending:0},
  minimumPublishedDecisions,byPacificGameDay:[],byMarket:[],byTier:[],
  prospectiveRate:null,observedWilson95:null,
  originalPlatformSettlementsVerified:false,realizedReturnVerified:false});
 if(!ledger||ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!ledger.counts)return unavailable("original_commit_ledger_missing");
 if(!Number.isInteger(minimumPublishedDecisions)||minimumPublishedDecisions<10)
  throw Error("Public selected-model hit-rate minimum must be >=10");
 const maps=[{}, {}, {}],unique=new Set(),totals={registered:0,correct:0,incorrect:0,push:0,pending:0};
 for(const p of ledger.records){
  if(!p||typeof p.id!=="string"||unique.has(p.id)||
   !["Higher","Lower"].includes(p.selectedSide)||
   !["Standard","Goblin","Demon"].includes(p.tier)||
   !["shotsOnGoal","blockedShots","goals","assists","points","saves","shotsAgainst"].includes(p.market)||
   date(p.firstGitCommittedAt)===null||date(p.gameStartAt)===null||
   date(p.firstGitCommittedAt)>=date(p.gameStartAt)||
   !["pending_official_player_stats","correct","incorrect","push"].includes(p.selectionStatus))
   return unavailable("unverified_or_conflicting_commit_identity");
  unique.add(p.id);
  const day=pacificDay(p.gameStartAt);
  if(!day)return unavailable("invalid_official_game_start");
  for(const [k,map]of [[day,maps[0]],[p.market,maps[1]],[p.tier,maps[2]]]){
   (map[k]??=[]).push(p);
  }
  totals.registered++;
  const state={correct:"correct",incorrect:"incorrect",push:"push",
   pending_official_player_stats:"pending"}[p.selectionStatus];
  totals[state]++;
 }
 for(const k of Object.keys(totals)){
  if(totals[k]!==ledger.counts[k])return unavailable("ledger_status_totals_do_not_reconcile");
 }
 const decided=totals.correct+totals.incorrect;
 const publish=decided>=minimumPublishedDecisions;
 return {kind:SCORECARD_KIND,status:"verified_original_pregame_registry_aggregates",
  sourceEvidence:"Original Git-first-added NHL model selections and official completed game stats",
  cohortVerified:true,counts:totals,decided,graded:decided+totals.push,
  minimumPublishedDecisions,
  byPacificGameDay:aggregate(maps[0],{minimumPublishedDecisions}).slice(0,90),
  byMarket:aggregate(maps[1],{minimumPublishedDecisions}).slice(0,16),
  byTier:aggregate(maps[2],{minimumPublishedDecisions}).slice(0,4),
  prospectiveRate:publish?Number((totals.correct/decided).toFixed(4)):null,
  observedWilson95:publish?wilson95(totals.correct,decided):null,
  smallSampleWithheld:decided>0&&!publish,
  originalPlatformSettlementsVerified:false,realizedReturnVerified:false,
  gameClusterDependenceNotAccountedFor:true,
  originalFrozenPickIdentifiersNotPublic:true,
  note:"Aggregated selected-direction official-stat outcomes only. No raw provider offers, model formulas or original fantasy-platform settlements. Rate withheld until >=10 decisions; Wilson interval is unclustered and not proof of profitable bets."};
}
module.exports={SCORECARD_KIND,pacificDay,wilson95,buildPublicProspectiveCohort};
