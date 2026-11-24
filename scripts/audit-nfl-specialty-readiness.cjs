"use strict";
/**
 * Validates real retrospective NFL event files, gives type/identity coverage.
 * NOT settlement validation, and not a prospective model feature.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const {auditContext}=require("../src/nfl-context-source-matrix.cjs");
const {reviewAll}=require("../src/nfl-market-settlement-gates.cjs");
const ROOT=path.resolve(__dirname,"..");
const KINDS=Object.freeze(["pass","run","punt","kickoff","field_goal","extra_point","no_play"]);
function read(root,year){
 const file=path.join(root,"outputs/nfl/history",String(year),"pbp_specialty_events.json.gz");
 if(!fs.existsSync(file))return null;
 const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
 if(doc.dataset!=="pbp_specialty_events"||doc.sport!=="NFL"||
    doc.recordCount!==doc.rows?.length||
    doc.specialtyOutcomeOnlyNotPregameAvailable!==true)
  throw Error("NFL specialty archive authenticity or provenance missing "+year);
 return doc;
}
function verifyYear(doc,year){
 const seen=new Set(),byType={},available={receiver:0,rusher:0,passer:0,punter:0,defense:0},
  counts={events:0,regularEvents:0,missingIdentifiers:0,passPlays:0,rushPlays:0,punts:0,fieldGoals:0,
   extraPoints:0,specialtySourceHasValidPeriod:true};
 for(const row of doc.rows){
  const w=Number(row.week);
  if(Number(row.season)!==year||row.season_type!=="REG"||
    !Number.isInteger(w)||w<1||w>18||
    typeof row.game_id!=="string"||row.play_id==null||
    ![1,2,3,4,5].includes(Number(row.qtr))||
    typeof row.play_type!=="string")throw Error("Bad NFL specialty event season/week/quarter/schema "+
      JSON.stringify({expectedSeason:year,actualSeason:row.season,
       seasonType:row.season_type,week:row.week,qtr:row.qtr,
       hasGameId:typeof row.game_id==="string",hasPlayId:row.play_id!=null}));
  const id=row.game_id+"|"+row.play_id;
  if(seen.has(id))throw Error("Duplicated source play in NFL specialty "+id);
  seen.add(id);counts.events++;
  byType[row.play_type]=(byType[row.play_type]||0)+1;
  if(row.season_type==="REG")counts.regularEvents++;
  if(row.play_type==="pass")counts.passPlays++;
  if(row.play_type==="run")counts.rushPlays++;
  if(row.play_type==="punt")counts.punts++;
  if(row.play_type==="field_goal")counts.fieldGoals++;
  if(row.play_type==="extra_point")counts.extraPoints++;
  if(typeof row.receiver_player_id==="string")available.receiver++;
  if(typeof row.rusher_player_id==="string")available.rusher++;
  if(typeof row.passer_player_id==="string")available.passer++;
  if(typeof row.punter_player_id==="string")available.punter++;
  if(typeof row.defteam==="string")available.defense++;
  if(row.posteam==null||row.defteam==null)counts.missingIdentifiers++;
 }
 if(counts.regularEvents<1000||counts.passPlays<100||counts.rushPlays<100||
    counts.punts<10||counts.fieldGoals<10||
    !available.passer||!available.receiver||!available.rusher||!available.punter)
  throw Error("Incomplete required market-event diversity or participant identities for season "+year);
 return {season:year,events:counts.events,counts,byPlayType:byType,
  identityCoverage:available,
  exactMarketSettlementVerified:false,sourcePublishedAfterGame:true,
  livePlayerPropsEligible:false};
}
function build({root=ROOT,seasons=[2024,2025,2026],manifest,backtest}={}){
 const byYear=[],notAvailable=[];
 for(const year of seasons){
  const data=read(root,year);
  if(!data){notAvailable.push(year);continue;}
  byYear.push(verifyYear(data,year));
 }
 const settle=reviewAll(),source=auditContext({manifest,backtest,seasons:[2025,2026]});
 return {schemaVersion:1,kind:"nfl_specialty_events_correlation_settlement_release_gates_v1",
  generatedAt:new Date().toISOString(),seasonsRequired:seasons,
  eventSeasonsValidated:byYear.length,eventSeasonsMissing:notAvailable,
  eventRowsVerified:byYear.reduce((n,x)=>n+x.events,0),
  historyCoverageForAllMarkets:source.contextReadyForModeling,
  missingHistoricalRequirementsMarketCount:source.missingContextMarketCount,
  statOnlyBacktests2026:source.statsOnlyBacktestMarketCount,
  settleRuleChecks:settle.totalChecks,settlementOriginalOfferRulesValidated:0,
  marketSpecificSpecialistGradesReconciled:0,
  historicalCorrelationsValidatedForLineups:false,
  livePrizePicksOrUnderdogOfferedLinesMatched:false,
  payoutAndJointCalibrationComplete:false,automaticPicksEnabled:0,
  documentationSource: "src/nfl-market-settlement-gates.cjs",
  publishedMarketRuleReferences:settle.publishedReferences,
  perSeason:byYear,settlementRules:settle.records,
  marketInputGaps:source.markets.filter(x=>x.missingHistoricalInputs.length)
   .map(x=>({market:x.id,missing:x.missingHistoricalInputs})),
  rawPlayerGameRowsIncluded:false};
}
function main(){
 const m=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/nfl/history/manifest.json"),"utf8"));
 const b=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/nfl/backtests/stats-only-latest.json"),"utf8"));
 const r=build({manifest:m,backtest:b});
 const dir=path.join(ROOT,"outputs/nfl/research");fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"specialty-readiness-latest.json"),JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({kind:r.kind,eventSeasons:r.eventSeasonsValidated,
  validatedEvents:r.eventRowsVerified,missingYears:r.eventSeasonsMissing,
  requiringHistoricalInputs:r.missingHistoricalRequirementsMarketCount,
  originalSettlementRulesValidated:0,lineupCorrelationCalibrated:false,
  eligibleAutomaticPicks:0}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={verifyYear,read,build};
