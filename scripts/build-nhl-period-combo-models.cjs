"use strict";
const fs=require("node:fs"),path=require("node:path");
const {buildPeriodMarketResearch,walkForwardPeriodDiagnostics}=
 require("../src/nhl-period-count-model.cjs");
const {researchComboProbability}=require("../src/nhl-combo-joint-shadow.cjs");
const {resolveMarket}=require("../src/nhl-market-registry.cjs");
const {validateStructuredComboSource}=
 require("../src/nhl-combo-source-evidence.cjs");
const {periodResearchPreference}=require("../src/nhl-period-offer-research.cjs");
const {periodCode}=require("../src/nhl-combo-period-research.cjs");
const root=path.resolve(__dirname,"..");
const get=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const optional=p=>{try{return get(p);}catch{return null;}};
const COMBO=new Set(["shotsOnGoalCombo","goalieSavesCombo","goalsCombo"]);
function auditComboBoard(board,history,{now=new Date().toISOString()}={}){
 const rows=Array.isArray(board?.rows)?board.rows:[],
  summary={schemaVersion:1,kind:"nhl_original_combo_offer_structure_audit",
   scannedRawRows:rows.length,comboRows:0,withExactStructuredMembers:0,
   sameGameResearchReady:0,crossGameResearchReady:0,
   candidateProbabilities:[],reasons:{},generatedAt:now,
   originalProviderAuthenticated:false,originalPlatformSettlementVerified:false,
   liveLineupEligible:false};
 for(const row of rows){
  const canonical=COMBO.has(row.market)?row.market:resolveMarket(row.market);
  if(!COMBO.has(canonical))continue;
  summary.comboRows++;
  const offer={...row,market:canonical,
   sourceCapturedAt:row.sourceCapturedAt,
   membersProvenance:row.membersProvenance,
   members:row.members};
  const valid=validateStructuredComboSource(offer,history,{now});
  if(!valid.valid){
   summary.reasons[valid.reason]=(summary.reasons[valid.reason]||0)+1;
   continue;
  }
  summary.withExactStructuredMembers++;
  const model=researchComboProbability(offer,history,{asOf:now});
  if(!model.eligible){
   summary.reasons[model.reason]=(summary.reasons[model.reason]||0)+1;
   continue;
  }
  if(model.relation==="same_game")summary.sameGameResearchReady++;
  else summary.crossGameResearchReady++;
  // No user account identifiers or fake pick/lineup API payloads.
  summary.candidateProbabilities.push({market:model.market,
   relation:model.relation,line:model.line,memberCount:offer.members.length,
   probabilityModel:model.probabilities.distribution,
   higher:model.probabilities.higher,lower:model.probabilities.lower,
   push:model.probabilities.push,calibrated:false,
   liveEligible:false,originalProviderSettlementVerified:false});
 }
 return summary;
}
function auditPeriodBoard(board,periodHistory,model,officialHistory,
 {now=new Date().toISOString()}={}){
 const rows=Array.isArray(board?.rows)?board.rows:[],
  out={schemaVersion:1,kind:"nhl_period_source_offer_readiness",
   scannedRows:rows.length,periodRows:0,
   completeSourceAndModelResearchPreferences:0,
   exclusions:{},candidateResearchPreferences:[],
   generatedAt:now,originalProviderOffersAuthenticated:false,
   originalPlatformSettlementVerified:false,
   automaticLineupEligible:false};
 for(const row of rows){
  if(![1,2,3].includes(periodCode(row?.period)))continue;
  out.periodRows++;
  const market=row?.canonicalMarket||resolveMarket(row?.market)||row?.market;
  const offer={...row,market};
  const result=periodResearchPreference(offer,{
   periodHistory,periodModel:model,officialHistory,now});
  if(!result.eligible){
   out.exclusions[result.reason]=(out.exclusions[result.reason]||0)+1;
   continue;
  }
  out.completeSourceAndModelResearchPreferences++;
  out.candidateResearchPreferences.push({
   market:result.market,period:result.period,line:result.line,
   officialPlayerId:result.officialPlayerId,officialGameId:result.officialGameId,
   lean:result.lean,probabilities:result.probabilities,
   sourceCapturedAt:result.capturedAt,
   originalPlatformQuoteAuthenticated:false,
   eligibleForLiveOptimizedLineup:false});
 }
 return out;
}
function buildReports({periodHistory,playerHistory,board,now}={}){
 const asOf=now||new Date().toISOString();
 if(periodHistory?.kind!=="nhl_official_period_history_v1")
  throw Error("No completed NHL period history");
 const period=buildPeriodMarketResearch(periodHistory,{asOf});
 const walkforward=walkForwardPeriodDiagnostics(periodHistory);
 walkforward.dedicatedDistributionResearch=require('../src/nhl-dedicated-period-distributions.cjs').study(periodHistory);
 const combos=auditComboBoard(board,playerHistory,{now:asOf});
 const periodOffers=auditPeriodBoard(board,periodHistory,period,
  playerHistory,{now:asOf});
 return {period,walkforward,combos,periodOffers};
}
function main(){
 const data=buildReports({periodHistory:get("outputs/period-stats/history.json"),
  playerHistory:optional("outputs/history/players.json"),
  board:optional("outputs/free-source/nhl/latest.json")});
 for(const [dest,report] of [
  ["outputs/projections/nhl-period-shadow-latest.json",data.period],
  ["outputs/backtests/nhl-period-walkforward-latest.json",data.walkforward],
  ["outputs/backtests/nhl-combo-structured-offer-audit-latest.json",data.combos],
  ["outputs/backtests/nhl-period-offer-readiness-latest.json",data.periodOffers]
 ]){
  const target=path.join(root,dest);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 }
 console.log(JSON.stringify({kind:"nhl_combo_period_model_build",
  periodModelPlayers:data.period.playerCount,
  forwardBacktestMarkets:Object.keys(data.walkforward.byMarket).length,
  forwardBacktestDates:data.walkforward.distinctHoldoutDates,
  rawComboRows:data.combos.comboRows,
  sourceVerifiedComboMemberRows:data.combos.withExactStructuredMembers,
  periodOfferRows:data.periodOffers.periodRows,
  periodResearchPreferenceRows:data.periodOffers.completeSourceAndModelResearchPreferences,
  researchOnly:true,productionModelAffected:false}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={auditComboBoard,auditPeriodBoard,buildReports,main};
