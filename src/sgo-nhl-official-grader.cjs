"use strict";
const {projectPlayer}=require("./projections.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const SUPPORTED=new Set(["goals","assists","points","shotsOnGoal","blockedShots","saves"]);
const PLATFORMS=new Set(["prizepicks","underdog"]);
function normalizeName(s){
 return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function indexGame(game){
 if(!game||!Number.isInteger(game.gameId)||!Array.isArray(game.players))
  throw Error("Invalid normalized official NHL boxscore archive");
 const byName=new Map();
 for(const p of game.players){
  if(!Number.isInteger(p.playerId)||!p.name)continue;
  const name=normalizeName(p.name);
  if(!byName.has(name))byName.set(name,[]);
  byName.get(name).push(p);
 }
 return byName;
}
function gradeGame(lines,official){
 const graded=[],excluded=[],byName=indexGame(official);
 for(const line of lines){
  if(!PLATFORMS.has(line.book)||!SUPPORTED.has(line.market)||
    !Number.isFinite(line.line)||line.line<0||
    line.closeField!=="closeOverUnder"||line.sourceGameMatched!==true||
    line.officialGameId!==official.gameId||line.originalOfferVerified===true){
   excluded.push({book:line.book,reason:"invalid_or_unverified_source_identity"});
   continue;
  }
  let matches=byName.get(normalizeName(line.player))||[];
  let identityMethod="exact_normalized_name";
  if(matches.length===0){
   // NHL gamecenter supplies initial + surname ("J. Sanderson"), but provider
   // uses "Jake Sanderson". Only match if that initial/surname is UNIQUE among
   // all players in this official boxscore. No fuzzy or position-based guesses.
   const tokens=normalizeName(line.player).split(" ").filter(Boolean);
   if(tokens.length>=2){
    const initial=tokens[0][0],surname=tokens.at(-1);
    const candidates=official.players.filter(p=>{
     const t=normalizeName(p.name).split(" ").filter(Boolean);
     return t.length>=2&&t[0][0]===initial&&t.at(-1)===surname;
    });
    matches=candidates;
    identityMethod="unique_initial_surname";
   }
  }
  if(matches.length!==1){
   excluded.push({book:line.book,gameId:official.gameId,
    player:line.player,market:line.market,
    reason:matches.length?"ambiguous_official_player_identity":"player_missing_from_official_boxscore"});
   continue;
  }
  const player=matches[0],actual=player[line.market];
  if(!Number.isFinite(actual)||actual<0){
   excluded.push({book:line.book,gameId:official.gameId,
    player:line.player,market:line.market,reason:"stat_missing_from_official_boxscore"});
   continue;
  }
  const result=actual>line.line?"Higher":actual<line.line?"Lower":"Push";
  graded.push({book:line.book,season:line.season,gameId:official.gameId,
   gameStartAt:official.gameStartAt,playerId:player.playerId,
   playerName:player.name,providerPlayerId:line.providerPlayerId,
   market:line.market,statID:line.statID,line:line.line,actual,result,
   source:"SportsGameOdds independent bookmaker closeOverUnder",
   providerCloseFieldPresent:true,
   officialPlayerIdentityMatchedByExactNormalizedName:identityMethod==="exact_normalized_name",
   officialPlayerIdentityMatchedByUniqueInitialSurname:identityMethod==="unique_initial_surname",
   officialIdentityMatchMethod:identityMethod,
   actualFromOfficialNhlBoxscore:true,
   originalProviderOfferVerified:false,independentThirdPartyOnly:true,
   originalTierVerified:false,prospectivePredictionVerified:false,
   derivedDirectionFromCurrentNhlBoxscore:true,
   originalPlatformSettlementVerified:false,
   prizePicksDnpRebootVerified:false,
   periodScope:"full_game_only",
   originalScoringPartnerSnapshotVerified:false,
   payoutAdjustmentVerified:false,
   outcomeGraded:true,verifiedModelHitRate:null});
 }
 return {graded,excluded};
}
function tally(rows,extract){
 const buckets={};
 for(const row of rows){
  const key=extract(row);
  if(!buckets[key])buckets[key]={lines:0,higher:0,lower:0,push:0,distinctGames:new Set()};
  const b=buckets[key];b.lines++;
  if(row.result==="Higher")b.higher++;
  else if(row.result==="Lower")b.lower++;
  else b.push++;
  b.distinctGames.add(row.gameId);
 }
 return Object.fromEntries(Object.entries(buckets).sort().map(([k,v])=>
  [k,{lines:v.lines,higher:v.higher,lower:v.lower,push:v.push,
   distinctGames:v.distinctGames.size,
   modelHitRate:null,tiersVerified:false}]));
}
function backtest(graded,officialGames){
 // Reconstruct historical decisions strictly from earlier *verified* NHL boxscores;
 // not timestamped predictions, not actual pick'em payout-adjusted EV.
 const records=new Map();
 for(const g of officialGames){
  const time=Date.parse(g.gameStartAt);
  if(!Number.isFinite(time))continue;
  for(const player of g.players||[]){
   if(!Number.isInteger(player.playerId))continue;
   const key=String(player.playerId);
   if(!records.has(key))records.set(key,[]);
   records.get(key).push({...player,gameId:g.gameId,gameStartAt:g.gameStartAt,
    gameDate:g.gameDate||g.gameStartAt.slice(0,10)});
  }
 }
 for(const rows of records.values())rows.sort((a,b)=>Date.parse(a.gameStartAt)-Date.parse(b.gameStartAt)||a.gameId-b.gameId);
 const decisions=[],excluded={};
 for(const line of graded){
  if(line.result==="Push"){excluded.push=(excluded.push||0)+1;continue;}
  const history=(records.get(String(line.playerId))||[]).filter(g=>
   Date.parse(g.gameStartAt)<Date.parse(line.gameStartAt)&&Number.isFinite(g[line.market]));
  if(history.length<5){excluded.insufficient_prior_games=(excluded.insufficient_prior_games||0)+1;continue;}
  const goalie=line.market==="saves";
  // A skater who also appears as a goalie for a different data issue is excluded.
  const player={playerId:line.playerId,name:line.playerName,
   type:goalie?"goalie":"skater",games:history};
  let projection;
  try{projection=projectPlayer(player,{minGames:5}).projections[line.market];}
  catch{excluded.projection_error=(excluded.projection_error||0)+1;continue;}
  const p=estimateCountProbabilities(projection?.estimate,line.line);
  if(!p||!Number.isFinite(p.higher)||!Number.isFinite(p.lower)){
   excluded.projection_unavailable=(excluded.projection_unavailable||0)+1;continue;
  }
  const chosen=p.higher>=p.lower?"Higher":"Lower";
  decisions.push({book:line.book,season:line.season,gameId:line.gameId,
   playerId:line.playerId,market:line.market,
   line:line.line,actual:line.actual,result:line.result,
   priorGames:history.length,projection:projection.estimate,
   modelChosen:chosen,modelSelectedProbability:Math.max(p.higher,p.lower),
   modelCorrect:chosen===line.result,
   alwaysLowerCorrect:line.result==="Lower",
   alwaysHigherCorrect:line.result==="Higher",
   retrospectiveOnly:true,prospectiveVerified:false,
   originalTierVerified:false,payoutEV:null});
 }
 const byBookSeason={};
 for(const row of decisions){
  const key=row.book+"|"+row.season;
  if(!byBookSeason[key])byBookSeason[key]={n:0,correct:0,lower:0,higher:0,brier:0,
   distinctGames:new Set()};
  const b=byBookSeason[key];b.n++;
  b.correct+=Number(row.modelCorrect);
  b.lower+=Number(row.alwaysLowerCorrect);
  b.higher+=Number(row.alwaysHigherCorrect);
  b.brier+=(row.modelSelectedProbability-Number(row.modelCorrect))**2;
  b.distinctGames.add(row.gameId);
 }
 const summaries=Object.fromEntries(Object.entries(byBookSeason).sort().map(([k,v])=>[k,{
  evaluated:v.n,correct:v.correct,retrospectiveHitRate:v.correct/v.n,
  baselineAlwaysLower:v.lower/v.n,baselineAlwaysHigher:v.higher/v.n,
  brierScore:v.brier/v.n,distinctGames:v.distinctGames.size,
  prospectiveVerified:false,calibrated:false,evVerified:false
 }]));
 return {type:"retrospective_reconstructed_model_from_cached_official_nhl_games",
  evaluated:decisions.length,excluded,byBookSeason:summaries,decisions,
  modelVersion:"weighted-form-v1 + poisson-v0",
  source:"Official NHL boxscores strictly earlier than each selected game's start",
  prospectiveVerified:false,calibrated:false,payoutVerified:false,
  dataComplete:false,
  warning:"Exploratory retrospective replay; not predictions recorded before games. Current NHL boxscores are not original PrizePicks settled outcomes: DNP, Reboot, scoring-partner correction snapshots and original payout changes are not verified. Prior game history may be truncated; compare baselines before deployment. No verified profitability."};
}
module.exports={normalizeName,indexGame,gradeGame,tally,backtest};
