"use strict";
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
function normalizeOfficialLog(data){
 if(!Array.isArray(data?.gameLog))throw Error("Unexpected official NHL game-log response");
 const games=data.gameLog.map(g=>({gameId:String(g.gameId??""),gameDate:g.gameDate,
  shotsOnGoal:Number.isFinite(g.shots)?g.shots:null,goals:Number.isFinite(g.goals)?g.goals:null,
  assists:Number.isFinite(g.assists)?g.assists:null,points:Number.isFinite(g.points)?g.points:null}))
  .filter(g=>/^\d{10}$/.test(g.gameId)&&/^\d{4}-\d\d-\d\d$/.test(g.gameDate));
 return games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId.localeCompare(b.gameId));
}
function evaluateHistory({response,official,season,playerId,market="player_shots_on_goal",retrievedAt}){
 if(!Array.isArray(response?.games)||!Number.isFinite(Date.parse(retrievedAt)))throw Error("Malformed historical PuckAPI response");
 const mapping={player_shots_on_goal:"shotsOnGoal",player_goals:"goals",player_assists:"assists",player_points:"points"};
 const field=mapping[market];if(!field)throw Error("Unsupported PuckAPI market");
 const completed=normalizeOfficialLog(official),byId=new Map(completed.map(g=>[g.gameId,g]));
 const exclusions={},decisions=[],seen=new Set(),sourceRows=[];
 const excluded=why=>(exclusions[why]=(exclusions[why]||0)+1);
 const priorMean=a=>a.reduce((sum,v)=>sum+v,0)/a.length;
 for(const row of response.games){
  const gameId=String(row.game_id??""),g=byId.get(gameId),day=row.game_date;
  if(!/^\d{10}$/.test(gameId)||!Number.isFinite(row.line)||row.line<0||
     !/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isInteger(row.actual)||row.actual<0){excluded("invalid_or_ungraded_line");continue;}
  if(seen.has(gameId)){excluded("duplicate_game");continue;}seen.add(gameId);
  const evidence={gameId,gameDate:day,line:row.line,actualFromProvider:row.actual,
    bookmaker:response.bookmaker??null,books:row.books??null,openLine:Number.isFinite(row.open_line)?row.open_line:null};
  sourceRows.push(evidence);
  if(!g||g.gameDate!==day||!Number.isFinite(g[field])){excluded("no_official_nhl_result");continue;}
  if(g[field]!==row.actual){excluded("provider_official_stat_mismatch");continue;}
  // Strictly earlier dates, never this game or a future correction.
  const prior=completed.filter(x=>x.gameDate<day&&Number.isFinite(x[field])).map(x=>x[field]);
  if(prior.length<5){excluded("under_five_prior_games");continue;}
  const estimate=0.5*priorMean(prior.slice(-5))+0.3*priorMean(prior.slice(-10))+0.2*priorMean(prior);
  const probs=estimateCountProbabilities(estimate,row.line);
  if(!probs||!Number.isFinite(probs.higher)||!Number.isFinite(probs.lower)){excluded("model_cannot_estimate");continue;}
  const side=probs.higher>=probs.lower?"Higher":"Lower",probability=Math.max(probs.higher,probs.lower);
  const result=g[field]>row.line?"Higher":g[field]<row.line?"Lower":"Push";
  decisions.push({season,playerId,player:response.player_name??null,gameId,gameDate:day,
   market:field,bookmaker:response.bookmaker??"median_across_sportsbooks",line:row.line,
   observedLineType:"pre-game closing line, per provider archive",evidenceTimestampAvailable:false,
   previousGames:prior.length,projection:Number(estimate.toFixed(4)),side,
   estimatedProbability:probability,actual:g[field],result,correct:result==="Push"?null:side===result,
   officialResultVerified:true,providerPrizePicks:false,prospectiveVerified:false});
 }
 const valid=decisions.filter(p=>p.correct!==null);
 return {season,playerId,market,sourceGames:response.games.length,matchedOfficialDecisions:decisions.length,
  evaluatedDecisions:valid.length,wins:valid.filter(p=>p.correct).length,
  pushes:decisions.length-valid.length,providerReportedGames:sourceRows,
  nextFromDate:response.next_from_date??null,truncated:response.truncated===true,
  exclusions,decisions};
}
function summarizeSeasonResults(parts){
 const decisions=parts.flatMap(p=>p.decisions),graded=decisions.filter(x=>x.correct!==null);
 const rate=graded.length?graded.filter(x=>x.correct).length/graded.length:null;
 const brier=graded.length?graded.reduce((s,x)=>s+(x.estimatedProbability-(x.correct?1:0))**2,0)/graded.length:null;
 const seasonTable={};
 for(const season of ["2025-26","2026-27"]){
  const a=graded.filter(x=>x.season===season);
  seasonTable[season]={samples:a.length,wins:a.filter(x=>x.correct).length,hitRate:a.length?a.filter(x=>x.correct).length/a.length:null,
   distinctGames:new Set(a.map(x=>x.gameId)).size};
 }
 return {kind:"historical_nhl_sportsbook_closing_line_backtest",source:"PuckAPI closing median across books + official NHL game logs",
  markets:["shotsOnGoal"],players:[...new Set(parts.map(x=>x.playerId))],
  seasons:seasonTable,overall:{samples:graded.length,wins:graded.filter(x=>x.correct).length,hitRate:rate,
   brierScore:brier,pushes:decisions.length-graded.length},
  coverage:"Small sampled set of player/game closing lines, NOT complete coverage of either season",
  prizePicksHistory:false,prospectiveHitRateVerified:false,probabilityCalibrated:false,
  expectedValue:null,warning:"Research-only retrospective selection using archived sportsbook closing lines and official results. Not actual historical PrizePicks lines. Missing lines and post-selection bias limit generalization. No verified payouts or lineup EV."};
}
module.exports={evaluateHistory,summarizeSeasonResults,normalizeOfficialLog};
