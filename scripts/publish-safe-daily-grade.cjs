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
    const {firstOriginals}=require(path.resolve(privateRoot,"src/nfl-original-freeze-identity.cjs"));
    const {original,filesIn}=require(path.resolve(privateRoot,"scripts/grade-nfl-precommitted.cjs"));
    const {verifyCommitChronology}=require(path.resolve(privateRoot,"src/nfl-prospective-freeze.cjs"));
    const {matchOfficialGame}=require(path.resolve(privateRoot,"src/nfl-precommitted-grading.cjs"));
    const originals=firstOriginals(filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/).map(p=>({...original(p),snapshot:get(p)})).filter(x=>Date.parse(x.firstCommittedAt)<=Date.parse(report.generatedAt)&&x.gitHistoryCount===1&&x.snapshot?.kind==="nfl_independent_partner_standard_directional_original_research_v1"&&verifyCommitChronology(x.snapshot,x.firstCommittedAt).verified));
    const grades=new Map(rows.map(r=>[r.id,r]));
    if(grades.size!==rows.length||grades.size!==originals.earliest.size)throw Error("NFL original ID reconciliation failed: grade IDs="+grades.size+", frozen IDs="+originals.earliest.size+", rows="+rows.length);
    const eastern=at=>{const a=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(at));return ["year","month","day"].map(k=>a.find(x=>x.type===k)?.value).join("-");};
    const entries=[];
    for(const {p,firstCommittedAt} of originals.earliest.values()){
     const r=grades.get(p.id);
     if(!r||r.firstGitCommittedAt!==firstCommittedAt||r.line!==p.line||r.market!==p.market||r.modeledSide!==p.selectedSide||r.sourceGameId!==p.sourceGameId)throw Error("NFL original row mismatch");
     const g=matchOfficialGame(p,schedule);
     if(g?ids.has(g.game_id):eastern(p.eventStartsAt)===day)entries.push({p,r,g});
    }
    const tallyNFL=xs=>{
     const settled=xs.filter(x=>x.r.status==="decided"),correct=settled.filter(x=>x.r.selectedSideResult==="correct").length,push=xs.filter(x=>x.r.status==="push").length;
     const unresolved=xs.filter(x=>!["decided","push"].includes(x.r.status)),reasons={};
     for(const x of unresolved)reasons[x.r.status]=(reasons[x.r.status]||0)+1;
     return {registered:xs.length,decided:settled.length,correct,incorrect:settled.length-correct,push,unresolvedPerSlate:unresolved.length,unresolvedByReason:reasons,hitRate:settled.length?correct/settled.length:null,alwaysHigher:settled.length?settled.filter(x=>x.r.actualSide==="Higher").length/settled.length:null,alwaysLower:settled.length?settled.filter(x=>x.r.actualSide==="Lower").length/settled.length:null};
    };
    const unique=new Map(),uniqueMarket=new Map();
    for(const x of entries){const p=x.p,k=JSON.stringify([x.g?.game_id||p.sourceGameId,p.historicalPlayerId,p.market,p.line,p.tier]),m=JSON.stringify([x.g?.game_id||p.sourceGameId,p.historicalPlayerId,p.market,p.tier]);if(!unique.has(k))unique.set(k,x);if(!uniqueMarket.has(m))uniqueMarket.set(m,x);}
    const distinct=[...unique.values()];
    Object.assign(nfl,{status:"archived_official_stat_outcomes_only",...tallyNFL(entries),firstDistinctThreshold:tallyNFL(distinct),firstPlayerGameMarket:tallyNFL([...uniqueMarket.values()]),distinctByMarket:Object.fromEntries([...new Set(distinct.map(x=>x.p.market))].sort().map(m=>[m,tallyNFL(distinct.filter(x=>x.p.market===m))])),originalIdsReconciled:true,sourceReportGeneratedAt:report.generatedAt});
   }
  }
 }
}catch(e){nfl={...nfl,status:"original_grade_reconciliation_failed",unresolvedPerSlate:null};console.error("NFL daily reconciliation failed: "+e.message);}
const out={kind:"public_original_daily_grade_v1",slateDate:day,generatedAt:new Date().toISOString(),nhl,nfl,platformSettlementVerified:false,payoutROI:null,modelPromoted:false,rawPropRowsExposed:0};
if(nfl.status==="original_grade_reconciliation_failed")throw Error("NFL slate reconciliation incomplete; existing report retained");
if(nhl.status!=="official_final_slate_graded"){console.log("Daily grade not ready; no stale totals published.");process.exit(0);}
const dest=path.join(publicRoot,"data","daily-grade-"+day+".json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+"\n");console.log(JSON.stringify({day,nhlStatus:nhl.status,nflStatus:nfl.status,officialFinalGames:nhl.finalGames}));
