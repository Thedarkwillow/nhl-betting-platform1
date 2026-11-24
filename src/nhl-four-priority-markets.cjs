"use strict";
/**
 * P0 priority NHL stat markets. Canonical official game counts are not by
 * themselves verified ORIGINAL PrizePicks/Underdog offers.
 *
 * NHL Goalie Fantasy Score is platform/version specific:
 * - Underdog: published rules 6 win +0.6 saves -3 goals against.
 * - PrizePicks: USER-SUPPLIED values 10 win +10 official shutout
 *   +0.3 saves -2 goals against (independent in-app chart not yet verified).
 * For research we require official start and win/shutout counts; this DOES NOT
 * establish PrizePicks settlement eligibility or any playable prop.
 */
const PRIZEPICKS_NHL_GOALIE_SCORING_V1=Object.freeze({
 ruleId:"prizepicks-nhl-goalie-fantasy-user-provided-20261106",
 sport:"NHL",platform:"PrizePicks",bonusUnit:"fantasy_points",
 win:10,shutout:10,save:0.3,goalAgainst:-2,
 source:"user_provided_2026_11_06",inAppScoringChartIndependentlyVerified:false,
 originalPlatformSettlementVerified:false,
 validForLivePicks:false
});
const NHL_MARKET_STATS=Object.freeze({
 hits:{playerType:"skater",unit:"count",status:"research_shadow"},
 faceoffsWon:{playerType:"skater",unit:"count",status:"research_shadow"},
 timeOnIceSeconds:{playerType:"either",unit:"seconds",status:"research_shadow"},
 underdogGoalieFantasyScore:{playerType:"goalie",unit:"underdog_points",status:"research_shadow"},
 prizePicksGoalieFantasyScore:{playerType:"goalie",unit:"prizepicks_points",
  status:"research_shadow",ruleSource:"user_provided_2026_11_06"}
});
function officialTOISeconds(raw){
 if(typeof raw!=="string")return null;
 const found=/^(\d{1,3}):([0-5]\d)$/.exec(raw);
 if(!found)return null;
 const seconds=Number(found[1])*60+Number(found[2]);
 return seconds>=0&&seconds<=3900?seconds:null;
}
function integerCount(value){
 return Number.isInteger(value)&&value>=0?value:null;
}
function goalieDecision(raw){
 const d=String(raw??"").trim().toUpperCase();
 return ["W","L","O"].includes(d)?d:null;
}
function underdogGoalieFantasyScore(row){
 if(row?.type!=="goalie"||row?.goalieStarted!==true||
   !["W","L","O"].includes(row?.goalieDecision)||
   integerCount(row?.saves)===null||integerCount(row?.goalsAgainst)===null)
  return null;
 return Number((6*(row.goalieDecision==="W"?1:0)+
  0.6*row.saves-3*row.goalsAgainst).toFixed(4));
}
/**
 * This scoring is conditional on an official per-game goalie/summary feed.
 * A 0-GA game does NOT prove an official individual shutout; a starting
 * goalie does NOT necessarily earn the goalie win if later replaced.
 * Do not infer either bonus from team results or generic boxscore.
 */
function prizePicksGoalieFantasyScore(row){
 if(row?.type!=="goalie"||row?.goalieStarted!==true||
   ![0,1].includes(row?.goalieOfficialWins)||
   ![0,1].includes(row?.goalieOfficialShutouts)||
   integerCount(row?.saves)===null||integerCount(row?.goalsAgainst)===null)
  return null;
 if(row.goalieOfficialShutouts===1&&row.goalsAgainst!==0)return null;
 const r=PRIZEPICKS_NHL_GOALIE_SCORING_V1;
 return Number((r.win*row.goalieOfficialWins+
  r.shutout*row.goalieOfficialShutouts+
  r.save*row.saves+r.goalAgainst*row.goalsAgainst).toFixed(4));
}
function normalizePriorityBoxscoreFields(player,{goalie=false}={}){
 if(goalie){
  const result={goalieDecision:goalieDecision(player?.decision),
   goalieStarted:typeof player?.starter==="boolean"?player.starter:null,
   goalsAgainst:integerCount(player?.goalsAgainst),
   // gamecenter boxscore does not reliably provide an exact shutout or
   // individual win flag; official goalie/summary supplement supplies both.
   goalieOfficialWins:null,goalieOfficialShutouts:null,
   prizePicksGoalieFantasyScore:null,underdogGoalieFantasyScore:null};
  result.underdogGoalieFantasyScore=underdogGoalieFantasyScore({
   type:"goalie",...result,saves:integerCount(player?.saves)});
  return {hits:null,faceoffsWon:null,timeOnIceSeconds:officialTOISeconds(player?.toi),...result};
 }
 // The NHL gamecenter often only has faceoffWinningPctg. Percentages alone
 // cannot reconstruct exact wins because the attempt denominator is unknown.
 const faceoffs=integerCount(player?.faceoffsWon)??integerCount(player?.faceOffWins);
 return {hits:integerCount(player?.hits),faceoffsWon:faceoffs,
  timeOnIceSeconds:officialTOISeconds(player?.toi),
  goalieDecision:null,goalieStarted:null,goalsAgainst:null,
  goalieOfficialWins:null,goalieOfficialShutouts:null,
  underdogGoalieFantasyScore:null,prizePicksGoalieFantasyScore:null};
}
module.exports={NHL_MARKET_STATS,PRIZEPICKS_NHL_GOALIE_SCORING_V1,
 officialTOISeconds,integerCount,
 goalieDecision,underdogGoalieFantasyScore,prizePicksGoalieFantasyScore,
 normalizePriorityBoxscoreFields};
