"use strict";
/**
 * Grading from ORIGINAL Git-before-kickoff NFL numeric research and explicitly
 * frozen sides, against source-verified final-week nflverse stats. nflverse
 * player stats are NOT provider PrizePicks/Underdog settlement evidence.
 */
const {SPECS,marketValue}=require("../scripts/backtest-nfl-historical-stats.cjs");
const {verifyCommitChronology}=require("./nfl-prospective-freeze.cjs");
const {firstOriginals}=require("./nfl-original-freeze-identity.cjs");
const {audit:distinctThresholdAudit}=require("./nfl-distinct-frozen-thresholds.cjs");
const specs=new Map(SPECS.filter(s=>s.family!=="kicking").map(s=>[s.id,s]));
const t=s=>typeof s==="string"&&s.trim()?Date.parse(s):NaN;
const n=v=>typeof v==="number"&&Number.isFinite(v);
function matchOfficialGame(row,schedule){
 const start=t(row.eventStartsAt);
 if(!Number.isFinite(start))return null;
 const dt=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(start));
 const d=Object.fromEntries(dt.map(x=>[x.type,x.value]));
 const local=d.year+"-"+d.month+"-"+d.day;
 const found=schedule.filter(g=>
   g.season===row.season&&g.week===row.week&&g.gameday===local&&
   (g.home_team===row.team&&g.away_team===row.opponent||
    g.home_team===row.opponent&&g.away_team===row.team)&&
   typeof g.game_id==="string"&&g.game_id);
 return found.length===1?found[0]:null;
}
function finalScorePresent(game){
 return !!game&&n(game.home_score)&&n(game.away_score)&&
   (n(game.result)||typeof game.game_status==="string"&&/final/i.test(game.game_status));
}
function evaluateRow(row,{weekly,schedule,now},kind){
 const base={id:row.id||row.sourceProjectionId,market:row.market,tier:row.tier,
  line:row.line,modelProjection:kind==="frozen"?row.historicalProjection:row.projection,
  modeledSide:kind==="frozen"?row.selectedSide:null,
  sourceGameId:kind==="frozen"?row.sourceGameId:row.observedProviderGameId};
 const game=matchOfficialGame(row,schedule);
 if(!game)return {...base,status:"pending_official_game_match"};
 // Require verified game score/result and sufficient elapsed time. An active
 // NFL game or an unconfirmed final is never settled as a prop.
 if(!finalScorePresent(game)||!Number.isFinite(t(now))||
   t(now)-t(row.eventStartsAt)<8*3600000)
   return {...base,status:"pending_official_final"};
 const playerId=kind==="frozen"?row.historicalPlayerId:row.historicalPlayerId;
 const matched=weekly.filter(p=>p.season===row.season&&p.week===row.week&&
   p.player_id===playerId&&String(p.recent_team||p.team||"")===row.team);
 if(matched.length!==1)return {...base,status:"unresolved_player_appearance"};
 const spec=specs.get(row.market);
 if(!spec||!n(row.line)||!n(base.modelProjection))
   return {...base,status:"unsupported_market_or_projection"};
 const actual=marketValue(spec,matched[0]);
 if(!n(actual))return {...base,status:"missing_official_stat"};
 const result=actual>row.line?"Higher":actual<row.line?"Lower":"Push";
 return {...base,status:result==="Push"?"push":"decided",
  actual,actualSide:result,absoluteError:Math.abs(actual-base.modelProjection),
  selectedSideResult:kind==="frozen"&&result!=="Push"?
    (result===row.selectedSide?"correct":"incorrect"):null,
  officialScheduleGameId:game.game_id};
}
function evaluateOriginalFrozen(snapshots,weekly,schedule,{now=new Date().toISOString()}={}){
 const rows=[],exclusions={},verified=[];
 for(const item of snapshots){
  const s=item.snapshot,valid=verifyCommitChronology(s,item.firstCommittedAt);
  if(s?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
    item.gitHistoryCount!==1||!valid.verified){
   const key=valid.reason||"not_original_git_frozen";
   exclusions[key]=(exclusions[key]||0)+1;
   continue;
  }
  verified.push(item);
 }
 // Repeated workflow_dispatch triggers may freeze the IDENTICAL original
 // quote again seconds later. Grade only the earliest Git first-addition;
 // fail on any changed threshold, side, player or pregame numeric projection.
 const indexed=firstOriginals(verified);
 for(const src of indexed.earliest.values()){
  rows.push({...evaluateRow(src.p,{weekly,schedule,now},"frozen"),
   firstGitCommittedAt:src.firstCommittedAt});
 }
 const decided=rows.filter(x=>x.status==="decided"),pushes=rows.filter(x=>x.status==="push");
 const correct=decided.filter(x=>x.selectedSideResult==="correct").length;
 return {kind:"nfl_original_git_precommitted_directional_research_grade_v1",
  generatedAt:now,registered:rows.length,decided:decided.length,correct,
  incorrect:decided.length-correct,pushes:pushes.length,
  pending:rows.length-decided.length-pushes.length,
  selectedSideAccuracy:decided.length?correct/decided.length:null,
  alwaysHigherOnExactSameSelectedLines:decided.filter(x=>x.actualSide==="Higher").length,
  alwaysLowerOnExactSameSelectedLines:decided.filter(x=>x.actualSide==="Lower").length,
  distinctFinalGames:new Set(decided.map(x=>x.officialScheduleGameId)).size,
  firstGitExactDuplicateObservationsNotCounted:indexed.exactRepeated,
  originalFirstGitFramesVerified:indexed.verifiedFrames,
  firstDistinctThresholdGrade:distinctThresholdAudit(indexed,rows),
  exclusions,rows,platformPayoutSettlementsVerified:false,
  validatedExpectedValue:false,calibratedProbabilities:false,
  productionPromotionPermitted:false};
}
function evaluatePriorNumericPreviews(previews,weekly,schedule,{now=new Date().toISOString()}={}){
 // Define a deterministic earliest-recorded research cohort, avoiding later
 // line movement and duplicate offered-side views being cherry-picked.
 const eligible=new Map(),excluded={};
 const ordered=[...previews].sort((a,b)=>
   t(a.firstCommittedAt)-t(b.firstCommittedAt)||
   String(a.path||"").localeCompare(String(b.path||"")));
 for(const item of ordered){
  const preview=item.preview;
  if(preview?.kind!=="nfl_partner_past_only_boxscore_projection_preview_v1"||
    !Array.isArray(preview.rows)||item.gitHistoryCount!==1||
    !Number.isFinite(t(preview.generatedAt))||
    !Number.isFinite(t(item.firstCommittedAt))||
    t(preview.generatedAt)-t(item.firstCommittedAt)>=1000){
    excluded.invalid_original_precommit=(excluded.invalid_original_precommit||0)+1;continue;
  }
  for(const row of preview.rows){
   if(row.tier!=="Standard"||!specs.has(row.market)||!n(row.projection)||
      !n(row.line)||!row.historicalPlayerId||!row.observedProviderGameId||
      !Number.isFinite(t(row.eventStartsAt))||
      t(row.eventStartsAt)-t(item.firstCommittedAt)<15*60000){
     excluded.unqualified_line=(excluded.unqualified_line||0)+1;continue;
   }
   const key=[row.observedProviderGameId,row.historicalPlayerId,row.market,row.line].join("|");
   if(!eligible.has(key))eligible.set(key,{row,firstCommittedAt:item.firstCommittedAt});
  }
 }
 const results=[...eligible.values()].map(x=>({...evaluateRow(x.row,{weekly,schedule,now},"preview"),
  firstGitCommittedAt:x.firstCommittedAt}));
 const decided=results.filter(x=>x.status==="decided");
 const stats=results.filter(x=>x.status==="decided"||x.status==="push");
 const sum=stats.reduce((s,x)=>s+x.absoluteError,0);
 const covered=new Set(decided.map(x=>x.officialScheduleGameId)).size;
 // A directional interpretation of an old numeric forecast is diagnostic
 // only: no independently precommitted Higher/Lower selection existed.
 const directionReconstruction=decided.filter(x=>x.modelProjection!==x.line);
 const directionalCorrect=directionReconstruction.filter(x=>
   (x.modelProjection>x.line?"Higher":"Lower")===x.actualSide).length;
 return {kind:"nfl_original_pregame_numeric_forecasts_research_scoring_v1",
  generatedAt:now,registered:results.length,decided:decided.length,
  pushes:results.filter(x=>x.status==="push").length,
  pending:results.filter(x=>x.status!=="decided"&&x.status!=="push").length,
  distinctFinalGames:covered,meanAbsoluteError:stats.length?sum/stats.length:null,
  retrospectiveDerivedSideCorrect:directionalCorrect,
  retrospectiveDerivedSideDecided:directionReconstruction.length,
  retrospectivelyDerivedSideNotOriginalFrozen:true,
  originalNumericProjectionGitPrecommitted:true,
  projectedSideHitRateIsNotVerifiedProspectiveSelectionHitRate:true,
  excluded,rows:results,validatedPlatformEV:false,
  sourceStatsAreNotPrizePicksSettlement:true};
}
module.exports={matchOfficialGame,finalScorePresent,evaluateRow,
 evaluateOriginalFrozen,evaluatePriorNumericPreviews};
