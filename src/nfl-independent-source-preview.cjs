"use strict";
// Independent PrizePicks NFL Standard replay -> exact game/player and prior
// week research projection. Never label a scoped board full NFL coverage.
const {classifyMarket}=require("./nfl-market-registry.cjs");
const {SPECS,marketValue,forecast}=require("../scripts/backtest-nfl-historical-stats.cjs");
const {indexWeekly,idName,matchScheduledWeek}=require("./nfl-partner-board-research.cjs");
const {candidate}=require("./nfl-empirical-threshold-shadow.cjs");
const {attachNflAvailability}=require("./nfl-current-injury-evidence.cjs");
const {practice}=require("./nfl-point-in-time-readiness-v1.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const club=x=>String(x||"").trim().toUpperCase();
const specs=new Map(SPECS.map(x=>[x.id,x]));
const eastern=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function officialKickoffMatches(row,schedule){
 const stamp=dt(row.eventStartsAt);
 if(!Number.isFinite(stamp))return null;
 const matched=matchScheduledWeek(row,schedule);
 if(!matched?.gameId)return null;
 const p=Object.fromEntries(eastern.formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));
 const date=p.year+"-"+p.month+"-"+p.day,clock=p.hour+":"+p.minute;
 const games=schedule.filter(g=>g.game_id===matched.gameId&&g.game_type==="REG"&&g.gameday===date&&String(g.gametime).slice(0,5)===clock);
 return games.length===1?matched:null;
}
function buildIndependentNflPreview({board,weeklyRows,schedule,teamWeekly=[],historicalSchedule=schedule,injuryReport=null,clubPractice=null,now=new Date().toISOString()}={}){
 const t=dt(now),capture=dt(board?.generatedAt),pin=dt(board?.boardAsOfAt);
 const tier=board?.requestedTier??"standard",tierName=tier[0]?.toUpperCase()+tier.slice(1);
 if(board?.provider!=="prizepicksapi.com"||board.league!=="NFL"||!["standard","goblin","demon"].includes(tier)||board.scope!==tier+"_full_game_replay"||
  board.snapshotMode!=="immutable_as_of"||board.completePagination!==true||board.sourceStatus!=="fresh"||
  !Array.isArray(board.offers)||!board.offers.length||!Number.isFinite(t)||!Number.isFinite(capture)||!Number.isFinite(pin)||
  pin>capture||capture-pin>300000||t<capture||t-pin>1800000||!Array.isArray(weeklyRows)||!Array.isArray(schedule))
  throw Error("Fresh complete scoped immutable NFL board and history required");
 const rows=[],seen=new Set(),indexes=new Map(),rankCache=new Map(),sampleCache=new Map(),excluded={};
 const rank=require("./nfl-position-rankings-v1.cjs"),matchup=require("./nfl-partner-board-research.cjs"),ablation=require("./matchup-factor-ablation-v1.cjs");
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const p of board.offers){
  const name=p?.player?.name,team=club(p?.player?.team),opponent=club(p?.event?.opponent),start=p?.event?.starts_at;
  if(p?.league!=="NFL"||p.status!=="active"||p.is_demo===true||p.source!=="prizepicks"||
     typeof p.id!=="string"||!/^pp_[A-Za-z0-9_-]{1,100}$/.test(p.id)||seen.has(p.id)||
     !Number.isFinite(dt(p.observed_at))||dt(p.observed_at)>pin+1000||
     typeof name!=="string"||!team||!opponent||team===opponent||!Number.isFinite(p.line)||p.line<0||!Number.isFinite(dt(start))||dt(start)-t<900000||
     p.source_fields?.is_live===true||p.source_fields?.in_game===true||!Array.isArray(p.selections)||
     !["full game","game","full_game"].includes(String(p.market?.period||"").toLowerCase())){
     skip("invalid_source_or_period");continue;
  }
  seen.add(p.id);
  const m=classifyMarket("prizepicks",p.market.stat,{period:"full_game",sourceAuthenticity:"independent_immutable_replay",observedAt:p.observed_at});
  const spec=specs.get(m.marketId);
  if(m.status!=="recognized_research_only"||!spec||spec.family==="kicking"||m.comboValidationNeeded||m.periodSpecificValidationNeeded){
    skip("specialized_or_unmodeled");continue;
  }
  const game=officialKickoffMatches({eventStartsAt:start,team,matchup:opponent},schedule);
  if(!game){skip("official_game_kickoff_unresolved");continue;}
  const idx=game.season+"|"+game.week;
  if(!indexes.has(idx))indexes.set(idx,indexWeekly(weeklyRows,game.season,game.week));
  const exact=indexes.get(idx).filter(x=>x.latest?.team===team&&x.latest.name===idName(name)&&
    (spec.family!=="passing"||x.latest.position==="QB")&&
    (spec.family!=="rushing"||["QB","RB","FB","WR"].includes(x.latest.position))&&
    (spec.family!=="receiving"||["WR","TE","RB","FB"].includes(x.latest.position)));
  if(exact.length!==1){skip("player_or_position_unresolved");continue;}
  const player=exact[0],values=player.observations.map(x=>x.measures[spec.id]).filter(Number.isInteger),f=forecast(values);
  if(!f||values.length<8){skip("insufficient_prior_games");continue;}
  const ck=JSON.stringify([game.season,game.week,spec.id,player.latest.position]);
  if(!sampleCache.has(ck))sampleCache.set(ck,matchup.matchupSample(weeklyRows,historicalSchedule,game.season,game.week,spec,player.latest.position));
  const sample=sampleCache.get(ck),own=sample.filter(x=>x.playerId===player.id&&x.team===team);
  const matchupResearch=matchup.describeMatchup(sample,player.id,team,opponent,p.line,f.shrunk_last5,game.season);
  matchupResearch.independentWorkload=ablation.nflOpportunity(own,f.shrunk_last5);
  if(spec.id==="receiving_yards")matchupResearch.receivingDepthComponents=require("./nfl-receiving-depth-components-v1.cjs").components(own,sample.filter(x=>x.y===game.season&&x.opponent===opponent));
  matchupResearch.independentFactors=ablation.nflFactors(matchupResearch,f.shrunk_last5);
  matchupResearch.position=player.latest.position;
  if(teamWeekly.length){
   if(!rankCache.has(idx))rankCache.set(idx,rank.rankings(weeklyRows,historicalSchedule,teamWeekly,game.season,game.week));
   const table=rankCache.get(idx).tables[spec.id+"|"+player.latest.position];
   if(table)matchupResearch.reconciledPositionRanking={complete:table.complete,qualifiedTeams:table.qualifiedTeams,opponent:table.rows.find(x=>x.team===opponent)??null,rankDirection:"1_most_allowed"};
  }
  const sides=p.selections.filter(s=>s.available===true&&s.tier===tier&&(tier==="standard"?["more","less"].includes(s.side):s.side==="more"));
  if(!sides.length||new Set(sides.map(s=>s.side)).size!==sides.length){skip("no_unambiguous_standard_side");continue;}
  for(const s of sides){
   const selectedSide=s.side==="more"?"Higher":"Lower";
   const v=candidate({market:spec.id,season:game.season,week:game.week,historicalPlayerId:player.id,
    historicalProjection:f.shrunk_last5,line:p.line,eventStartsAt:start,team,selectedSide,sourceGameId:game.gameId},weeklyRows,now);
   if(!v){skip("conditional_distribution_unavailable");continue;}
   const probability=v.probabilities[selectedSide.toLowerCase()];
   if(!Number.isFinite(probability)||probability<=0||probability>=1){skip("extreme_or_invalid_probability");continue;}
   const availability=attachNflAvailability({historicalPlayerId:player.id,team,season:game.season,week:game.week,eventStartsAt:start},injuryReport,now);
   const clubPracticeEvidence=practice({historicalPlayerId:player.id,gameId:game.gameId,
     player:name,team},clubPractice,now);
   if(availability.blocksResearch){skip("current_injury_report_risk");continue;}
   rows.push({sport:"NFL",source:"PrizePicks independent feed",player:name,historicalPlayerId:player.id,gameId:game.gameId,
    market:spec.id,team,opponent,eventStartsAt:start,capturedAt:board.generatedAt,observedAt:p.observed_at,sourceProjectionId:p.id,
    tier:tierName,side:selectedSide,line:p.line,projection:f.shrunk_last5,probability,probabilities:v.probabilities,
    priorGames:v.priorGames,season:game.season,week:game.week,availability,matchupResearch,
    clubPractice:clubPracticeEvidence,gameDayActiveVerified:false,
    conditionalOnPlaying:true,researchOnly:true,calibrated:false,autoPickEligible:false,
    originalPlatformSettlementVerified:false});
  }
 }
 rows.sort((a,b)=>b.probability-a.probability||b.priorGames-a.priorGames);
 return {kind:tier==="standard"?"nfl_independent_standard_research_preview_v1":"nfl_independent_alternate_research_preview_v1",requestedTier:tier,generatedAt:now,boardAt:board.generatedAt,
  scope:board.scope,completeScopedPagination:true,fullNFLBoardVerified:false,sourceOffers:board.offers.length,
  matchedRows:rows.length,excluded,rows,researchOnly:true,calibrated:false,publicReleaseApproved:false,autoPickEligible:false,
  originalPlatformSettlementVerified:false,expectedValue:null};
}
module.exports={officialKickoffMatches,buildIndependentNflPreview};
