"use strict";
// Aggregate only. No player identities, individual selections, source quotes,
// or raw private rows are published. The day is the official game-date slate.
const fs=require("node:fs"),path=require("node:path");
const privateRoot=process.argv[2],publicRoot=process.argv[3],day=process.argv[4];
if(!privateRoot||!publicRoot||!/^\d{4}-\d{2}-\d{2}$/.test(day||""))throw Error("Roots and exact slate date required");
const get=p=>JSON.parse(fs.readFileSync(path.join(privateRoot,p),"utf8"));
const optional=p=>{try{return get(p);}catch{return null;}};
const official=optional("outputs/player-stats/"+day+".json");
const ledger=optional("outputs/research/registry/nhl-precommitted-ledger-latest.json");
const {rowValid}=require(path.resolve(privateRoot,"src/nhl-frozen-baseline-challenge.cjs"));
const date=at=>{const x=new Date(at);if(!Number.isFinite(+x))return null;const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(x);return ["year","month","day"].map(k=>p.find(z=>z.type===k)?.value).join("-");};
const tally=rows=>{const correct=rows.filter(r=>r.selectionStatus==="correct").length,incorrect=rows.filter(r=>r.selectionStatus==="incorrect").length,push=rows.filter(r=>r.selectionStatus==="push").length,decided=correct+incorrect;return {registered:rows.length,correct,incorrect,push,pending:rows.length-decided-push,decided,hitRate:decided?correct/decided:null,alwaysHigher:decided?rows.filter(r=>r.officialResult==="Higher").length/decided:null,alwaysLower:decided?rows.filter(r=>r.officialResult==="Lower").length/decided:null,distinctGradedGames:new Set(rows.filter(r=>r.selectionStatus!=="pending_official_player_stats").map(r=>r.gameId)).size};};
const nhl={status:"awaiting_complete_official_archive_and_original_ledger"};
if(official?.requestedDate===day&&official.source==="NHL public API"&&official.sourceSchemaVersion===5&&Number.isInteger(official.scheduledGames)&&official.scheduledGames>=0&&official.completedGames===official.scheduledGames&&official.collectedGames===official.scheduledGames&&Array.isArray(official.errors)&&!official.errors.length&&Array.isArray(official.players)&&new Set(official.players.map(r=>r.gameId)).size===official.scheduledGames&&ledger?.kind==="private_immutable_source_linked_nhl_selected_predictions"&&Array.isArray(ledger.records)&&ledger.records.every(rowValid)&&new Set(ledger.records.map(r=>r.id)).size===ledger.records.length&&Date.parse(ledger.builtAt)>=Date.parse(official.fetchedAt)){
 const ids=new Set(official.players.map(r=>r.gameId)),rows=ledger.records.filter(r=>ids.has(r.gameId));
 const relevant=ledger.records.filter(r=>r.officialGameDate===day||r.selectionStatus==="pending_official_player_stats"&&date(r.gameStartAt)===day);
 if(relevant.every(r=>ids.has(r.gameId))){
  Object.assign(nhl,{status:"official_final_slate_graded",scheduledGames:official.scheduledGames,finalGames:official.completedGames,officialPlayerRows:official.players.length,statsFetchedAt:official.fetchedAt,ledgerBuiltAt:ledger.builtAt,all:tally(rows),byTier:Object.fromEntries(["Standard","Goblin","Demon"].map(t=>[t,tally(rows.filter(r=>r.tier===t))])),standardByMarket:Object.fromEntries([...new Set(rows.filter(r=>r.tier==="Standard").map(r=>r.market))].sort().map(m=>[m,tally(rows.filter(r=>r.tier==="Standard"&&r.market===m))])),gamesWithOriginalSelections:new Set(rows.map(r=>r.gameId)).size});
 }
}
let nfl={status:"schedule_unavailable"};
try{
 const schedule=require(path.resolve(privateRoot,"scripts/build-nfl-partner-board-research.cjs")).dataset(Number(day.slice(0,4)),"schedule");
 if(Array.isArray(schedule)&&schedule.length>0&&schedule.every(g=>typeof g.gameday==="string")){
  const games=schedule.filter(g=>g.gameday===day),ids=new Set(games.map(g=>g.game_id));
  nfl={status:games.length?"requires_slate_specific_original_grade":"no_games_on_archived_schedule",scheduledGames:games.length,finalGames:games.filter(g=>Number.isFinite(g.home_score)&&Number.isFinite(g.away_score)).length};
  if(games.length){
   const report=optional("outputs/nfl/backtests/pregame-forecast-proof-latest.json");
   const rows=report?.explicitFrozenDirections?.rows;
   if(Array.isArray(rows)){
    const graded=rows.filter(r=>ids.has(r.officialScheduleGameId)&&["decided","push"].includes(r.status)),decided=graded.filter(r=>r.status==="decided"),correct=decided.filter(r=>r.selectedSideResult==="correct").length;
    Object.assign(nfl,{status:"archived_official_stat_outcomes_only",decided:decided.length,correct,incorrect:decided.length-correct,push:graded.length-decided.length,hitRate:decided.length?correct/decided.length:null,unresolvedPerSlate:null});
   }
  }
 }
}catch{}
const out={kind:"public_original_daily_grade_v1",slateDate:day,generatedAt:new Date().toISOString(),nhl,nfl,platformSettlementVerified:false,payoutROI:null,modelPromoted:false,rawPropRowsExposed:0};
if(nhl.status!=="official_final_slate_graded"){console.log("Daily grade not ready; no stale totals published.");process.exit(0);}
const dest=path.join(publicRoot,"data","daily-grade-"+day+".json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+"\n");console.log(JSON.stringify({day,nhlStatus:nhl.status,nflStatus:nfl.status,officialFinalGames:nhl.finalGames}));
