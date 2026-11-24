"use strict";
// Diagnose absent weekly stats without zero imputation or inventing DNP/voids.
const fs=require("node:fs"),path=require("node:path"),{original,filesIn,history}=require("./grade-nfl-precommitted.cjs"),{firstOriginals}=require("../src/nfl-original-freeze-identity.cjs"),{verifyCommitChronology}=require("../src/nfl-prospective-freeze.cjs"),{matchOfficialGame,finalScorePresent}=require("../src/nfl-precommitted-grading.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const team=x=>({LAR:"LA",AZ:"ARI",WSH:"WAS",JAC:"JAX"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
const valid=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
const gsis=r=>r.gsis_id||r.gsisId||r.player_id;
const pfr=r=>r.pfr_player_id||r.pfr_id;
function diagnose(p,g,weekly,roster,snaps){
 if(!g||!finalScorePresent(g))return "official_game_or_final_unverified";
 const inWeek=r=>Number(r.season)===p.season&&Number(r.week)===p.week;
 const stat=weekly.filter(r=>inWeek(r)&&r.player_id===p.historicalPlayerId);
 if(stat.length>1)return "ambiguous_weekly_stat_rows";
 if(stat.length===1)return team(stat[0].recent_team||stat[0].team)===team(p.team)?"weekly_stat_team_alias_or_grade_refresh_needed":"weekly_stat_team_mismatch";
 const profile=roster.filter(r=>inWeek(r)&&gsis(r)===p.historicalPlayerId&&team(r.team||r.recent_team)===team(p.team));
 const IDs=new Set(profile.map(pfr).filter(Boolean));
 if(IDs.size!==1)return profile.length?"roster_crosswalk_ambiguous_or_missing":"roster_identity_not_matched";
 const id=[...IDs][0],reverse=new Set(roster.filter(r=>inWeek(r)&&pfr(r)===id).map(gsis).filter(Boolean));
 if(reverse.size!==1||!reverse.has(p.historicalPlayerId))return "roster_crosswalk_ambiguous_or_missing";
 const matches=snaps.filter(r=>r.game_id===g.game_id&&pfr(r)===id&&team(r.team)===team(p.team));
 if(matches.length!==1)return matches.length?"duplicate_snap_rows":"snap_record_missing_not_dnp_proof";
 const s=matches[0],counts=[s.offense_snaps,s.defense_snaps,s.st_snaps];
 if(counts.some(x=>valid(x)&&x>0))return "positive_snaps_weekly_stats_missing";
 if(counts.every(valid)&&counts.every(x=>x===0))return "zero_recorded_snaps_not_platform_void_proof";
 return "incomplete_snap_counts";
}
// Identity evidence is an investigation, never a substitute for an official stat.
const name=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function identityReview(p,g,weekly,roster,snaps){
 const inWeek=r=>Number(r.season)===p.season&&Number(r.week)===p.week;
 const exact=roster.filter(r=>inWeek(r)&&gsis(r)===p.historicalPlayerId);
 const alternatives=roster.filter(r=>inWeek(r)&&name(r.full_name||r.player_name||r.name)===name(p.player)&&name(p.player)&&team(r.team||r.recent_team)===team(p.team));
 const stats=weekly.filter(r=>inWeek(r)&&r.player_id===p.historicalPlayerId);
 const identifiers=[...new Set(exact.map(pfr).filter(Boolean))];
 const appearance=snaps.filter(r=>r.game_id===g.game_id&&identifiers.includes(pfr(r)));
 return {sourcePlayer:p.player,sourcePlayerId:p.sourcePlayerId,originalHistoricalId:p.historicalPlayerId,officialGameId:g.game_id,sourceTeam:p.team,sourceOpponent:p.opponent,originalWeek:p.week,exactRosterTeams:[...new Set(exact.map(r=>r.team||r.recent_team).filter(Boolean))],exactWeeklyTeams:[...new Set(stats.map(r=>r.recent_team||r.team).filter(Boolean))],sameNameRosterIds:[...new Set(alternatives.map(gsis).filter(Boolean))],sameNameIsNotIdentityProof:true,exactPfrIds:identifiers,snapTeams:[...new Set(appearance.map(r=>r.team).filter(Boolean))],autoCorrected:false};
}
function main(day=process.argv[2]){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||""))throw Error("Specify official NFL slate date");
 const report=read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),grades=report.explicitFrozenDirections.rows;
 const sources=filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/).map(p=>({...original(p),snapshot:read(p)})).filter(x=>Date.parse(x.firstCommittedAt)<=Date.parse(report.generatedAt)&&x.gitHistoryCount===1&&x.snapshot?.kind==="nfl_independent_partner_standard_directional_original_research_v1"&&verifyCommitChronology(x.snapshot,x.firstCommittedAt).verified);
 const ix=firstOriginals(sources),byId=new Map(grades.map(r=>[r.id,r]));if(byId.size!==ix.earliest.size||byId.size!==grades.length)throw Error("original grade/source ID mismatch");
 const schedule=history("schedule"),weekly=history("player_weekly"),roster=history("weekly_rosters"),snaps=history("snap_counts"),rows=[];
 for(const {p,firstCommittedAt} of ix.earliest.values()){
  const r=byId.get(p.id);if(!r||r.firstGitCommittedAt!==firstCommittedAt||r.line!==p.line||r.market!==p.market||r.modeledSide!==p.selectedSide||r.sourceGameId!==p.sourceGameId)throw Error("source row mismatch");
  if(r.status!=="unresolved_player_appearance")continue;const g=matchOfficialGame(p,schedule);if(g?.gameday!==day)continue;
  rows.push({key:JSON.stringify([g.game_id,p.historicalPlayerId,p.market,p.line,p.tier]),identity:JSON.stringify([g.game_id,p.historicalPlayerId]),reason:diagnose(p,g,weekly,roster,snaps),review:identityReview(p,g,weekly,roster,snaps)});
 }
 const tally=a=>{const counts={};for(const r of a)counts[r.reason]=(counts[r.reason]||0)+1;return counts;};
 const distinct=[...new Map(rows.map(r=>[r.key,r])).values()],players=[...new Map(rows.map(r=>[r.identity,r])).values()];
 const result={kind:"nfl_unresolved_player_appearance_diagnostic_v1",slateDate:day,generatedAt:new Date().toISOString(),sourceGradeAt:report.generatedAt,registeredUnresolved:rows.length,distinctThresholds:distinct.length,distinctPlayerGames:players.length,byReason:tally(rows),distinctThresholdReasons:tally(distinct),playerGameReasons:tally(players),automaticGradeChanges:0,missingStatsImputedZero:false,platformSettlementVerified:false};
 fs.writeFileSync(path.join(root,"outputs/nfl/backtests/unresolved-identity-review-"+day+".json"),JSON.stringify({kind:"private_nfl_exact_identity_review_v1",slateDate:day,generatedAt:result.generatedAt,rows:players.map(x=>({reason:x.reason,...x.review})),autoGradeChanges:0},null,2)+"\n");
 fs.writeFileSync(path.join(root,"outputs/nfl/backtests/unresolved-appearance-"+day+".json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));return result;
}
if(require.main===module)main();module.exports={diagnose,identityReview,main};
