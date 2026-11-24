"use strict";
/** Explicit NFL.com game-day active *mentions*, not full active rosters.
 * A named individual may be positively identified in an official published
 * article before kickoff, but a multi-field PrizePicks→GSIS link remains
 * provisional unless the source itself carries both identifiers.
 */
const {normalize}=require("./nfl-goblin-free-identity-research.cjs");
const {team}=require("./nfl-goblin-schedule-bridge-v1.cjs");
const NAMES={
 ARI:"Arizona Cardinals",ATL:"Atlanta Falcons",BAL:"Baltimore Ravens",
 BUF:"Buffalo Bills",CAR:"Carolina Panthers",CHI:"Chicago Bears",
 CIN:"Cincinnati Bengals",CLE:"Cleveland Browns",DAL:"Dallas Cowboys",
 DEN:"Denver Broncos",DET:"Detroit Lions",GB:"Green Bay Packers",
 HOU:"Houston Texans",IND:"Indianapolis Colts",JAX:"Jacksonville Jaguars",
 KC:"Kansas City Chiefs",LV:"Las Vegas Raiders",LAC:"Los Angeles Chargers",
 LAR:"Los Angeles Rams",MIA:"Miami Dolphins",MIN:"Minnesota Vikings",
 NE:"New England Patriots",NO:"New Orleans Saints",NYG:"New York Giants",
 NYJ:"New York Jets",PHI:"Philadelphia Eagles",PIT:"Pittsburgh Steelers",
 SEA:"Seattle Seahawks",SF:"San Francisco 49ers",TB:"Tampa Bay Buccaneers",
 TEN:"Tennessee Titans",WAS:"Washington Commanders"
};
const date=x=>typeof x==="string"?Date.parse(x):NaN;
const POSITIVE=/\bis (?:officially )?active\b|\bhas been declared active\b/i;
const NEGATIVE=/\b(?:not active|inactive|ruled out|is out|will be inactive)\b/i;
// Do not attribute another player's positive sentence to the named candidate.
// Editorial injury parentheses between name and "is active" are allowed.
const namedPositive=(snippet,full)=>{
 const s=normalize(String(snippet||"").replace(/\([^)]{0,120}\)/g," "));
 return ["isactivefor","isofficiallyactivefor","hasbeendeclaredactivefor"].some(v=>
  s.includes(full+v));
};
function scan(candidates,articles,gameCrosswalk,{firstGitAt,now}={}){
 const out={kind:"nfl_official_positive_game_statement_research_counts_v1",
  articlesObserved:0,explicitMentions:0,corroboratedConditionalPlayers:0,conditionalGameDayMentions:[],
  officialPositiveProviderGSISVerified:0,officialCompleteGameRosterVerified:false,
  approvedSelections:0,originalAppActiveVerified:false,
  noActiveByOmission:true,modelPromoted:false,providerRequests:0};
 const observed=date(now),git=date(firstGitAt),captured=date(articles?.capturedAt);
 if(articles?.kind!=="nfl_official_explicit_active_news_archive_v1"||
    articles.firstGitPending!==true||articles.researchOnly!==true||
    articles.noMedicalClearanceByOmission!==true||
    ![observed,git,captured].every(Number.isFinite)||
    git<captured-1000||git>observed||observed-captured>12*3600000||
    !Array.isArray(articles.positiveSnippets)||!Array.isArray(candidates)||
    !Array.isArray(gameCrosswalk))return out;
 out.articlesObserved=Number.isInteger(articles.articlesExamined)?
  articles.articlesExamined:0;
 const events=new Map(gameCrosswalk.map(x=>[x.providerGameId,x]));
 const accepted=new Map();
 for(const record of articles.positiveSnippets){
  const url=String(record.sourceUrl||"");
  if(!/^https:\/\/(?:(?:www|fantasy-www)\.)?nfl\.com\/news\/[a-z0-9-]+(?:\?.*)?$/.test(url))continue;
  const pub=date(record.publishedAt),update=date(record.updatedAt),seen=date(record.observedAt);
  if(![pub,update,seen].every(Number.isFinite)||
     pub>update||update>captured||seen>captured||
     captured-pub>36*3600000||
     record.snippet?.length>300||
     !POSITIVE.test(record.snippet||"")||NEGATIVE.test(record.snippet||""))continue;
  out.explicitMentions++;
  for(const p of candidates){
   const g=events.get(p.originalProviderGameId);
   if(p.source!=="conditional_unique_name_team_position_prior_roster"||
      p.independentlyVerifiedProviderGSIS!==false||p.gameDayActiveVerified!==false||
      !/^00-\d{7}$/.test(String(p.gsisId||""))||
      !g||g.officialGameId!==p.officialGameId||!Number.isFinite(date(g.officialKickoffAt))||
      date(g.officialKickoffAt)-git<15*60000||
      date(g.officialKickoffAt)-pub<15*60000)continue;
   const club=NAMES[team(p.team)];
   if(!club||normalize(record.teamHeader)!==normalize(club))continue;
   const full=normalize(p.originalPlayerName);
   // Full name must occur inside the SAME official positive sentence;
   // surname-only articles are insufficient for an automatic GSIS link.
   if(!full||!namedPositive(record.snippet,full))continue;
   // The archived source may have been published for another week;
   // require this player's exact current game week in the article metadata.
   const week=Number(String(g.officialGameId||"").split("_")[1]);
   if(articles.officialWeek!==week)continue;
   accepted.set(p.providerPlayerId,{providerPlayerId:p.providerPlayerId,
     gsisCandidateId:p.gsisId,officialGameId:p.officialGameId,
     officialPublishedAt:record.publishedAt,sourceUrl:record.sourceUrl,
     status:"named_official_positive_conditional_identity_only",
     independentProviderGsisVerified:false,gameDayRosterVerified:false,
     bettingEligible:false});
  }
 }
 out.corroboratedConditionalPlayers=accepted.size;
 out.conditionalGameDayMentions=[...accepted.values()].sort((a,b)=>
  String(a.providerPlayerId).localeCompare(String(b.providerPlayerId)));
 // A positive official mention is genuine only for the spelled-out player
 // in the article. It does not turn a name/team/position GSIS hypothesis
 // into a shared-provider ID or a full confirmed 47/48-player game roster.
 return out;
}
module.exports={scan};
