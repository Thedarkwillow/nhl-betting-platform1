"use strict";
const fs=require("node:fs"),path=require("node:path");
const {audit}=require("../src/nhl-exact-line-exposure-audit.cjs"),{mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs"),{prepare}=require("../src/nhl-market-distribution-availability.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),optional=p=>{try{return read(p);}catch{return null;}},list=d=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort():[];
function main(){
 const hd="outputs/period-stats/training-source",pd="outputs/research/nhl-pp-history",h=mergeHistory(read("outputs/history/players.json"),list(hd).map(n=>read(hd+"/"+n)),list(pd).flatMap(n=>{const d=read(pd+"/"+n);return d.kind==="official_nhl_exact_game_pp_time_v1"?d.rows:[];}));
 const cur=read("outputs/official-nhl/season-schedules/2026-27.json"),prior=read("outputs/official-nhl/season-schedules/2025-26.json");if(cur.complete!==true||prior.complete!==true)throw Error("Complete schedule required");
 const schedule={...cur,games:[...prior.games,...cur.games]},distribution=prepare(h.history,schedule,{cutoff:"2026-07-01",holdout:"2026-07-01"});
 const replay=audit(read("outputs/research/registry/nhl-precommitted-ledger-latest.json"),h.history,schedule,distribution.selected);
 if(replay.evidenceValid!==true)throw Error("Unverified original Standard ledger; refusing retrospective accuracy report");
 const nfl=optional("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),d=nfl?.explicitFrozenDirections?.firstDistinctThresholdGrade,f=nfl?.explicitFrozenDirections;
 const valid=nfl?.kind==="nfl_private_pregame_evidence_separated_outcome_audit_v1"&&d?.kind==="nfl_original_first_distinct_threshold_official_stat_audit_v1"&&d.originalFirstGitBeforeKickoffProven===true&&d.releaseApproved===false;
 const out={kind:"private_exact_line_exposure_and_nfl_summary_v1",generatedAt:new Date().toISOString(),history:h.counts,trainingDistributionSelected:distribution.selected,replay,nfl:valid?{sourceAt:nfl.generatedAt,allOriginal:{decided:f.decided,correct:f.correct,pending:f.pending,distinctGames:f.distinctFinalGames,alwaysHigher:f.alwaysHigherOnExactSameSelectedLines,alwaysLower:f.alwaysLowerOnExactSameSelectedLines},distinctThreshold:d.earliestPerPlayerGameMarketAndLine,onePerPlayerMarket:d.earliestPerPlayerGameMarket}:null,providerRequests:0,modelPromoted:false,confidenceApproved:false};
 const p=path.join(root,"outputs/health/exact-line-exposure-nfl-latest.json");fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(out,null,2)+"\n");console.log(JSON.stringify({researchSaved:true,markets:Object.keys(replay.byMarket),matchedPP:Object.keys(replay.matchedPP),nflOriginal:out.nfl?.allOriginal??null,modelPromoted:false}));
}
if(require.main===module)main();
