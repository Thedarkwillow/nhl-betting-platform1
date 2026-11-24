"use strict";
/**
 * NFL.com positive individual active statements are useful independent
 * context, but DO NOT establish a 48-player official game roster or prove
 * an original independent prop's GSIS/provider ID. Never use in gameDay().
 */
const KIND="nfl_official_named_positive_active_research_v1";
const stamp=x=>typeof x==="string"?Date.parse(x):NaN;
const CLUBS=Object.freeze({
 ARI:"Arizona Cardinals",ATL:"Atlanta Falcons",BAL:"Baltimore Ravens",
 BUF:"Buffalo Bills",CAR:"Carolina Panthers",CHI:"Chicago Bears",
 CIN:"Cincinnati Bengals",CLE:"Cleveland Browns",DAL:"Dallas Cowboys",
 DEN:"Denver Broncos",DET:"Detroit Lions",GB:"Green Bay Packers",
 HOU:"Houston Texans",IND:"Indianapolis Colts",JAX:"Jacksonville Jaguars",
 KC:"Kansas City Chiefs",LV:"Las Vegas Raiders",LAC:"Los Angeles Chargers",
 LA:"Los Angeles Rams",MIA:"Miami Dolphins",MIN:"Minnesota Vikings",
 NE:"New England Patriots",NO:"New Orleans Saints",NYG:"New York Giants",
 NYJ:"New York Jets",PHI:"Philadelphia Eagles",PIT:"Pittsburgh Steelers",
 SF:"San Francisco 49ers",SEA:"Seattle Seahawks",TB:"Tampa Bay Buccaneers",
 TEN:"Tennessee Titans",WAS:"Washington Commanders"
});
const norm=s=>String(s||"").trim().replace(/\s+/g," ").toLowerCase();
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const blank=reason=>({kind:KIND,status:"unverified",reason,
 namedFirstPartyStatementFound:false,independentlyVerifiedProviderGSIS:false,
 fullGameDayActiveRosterVerified:false,originalAppOfferAuthenticated:false,
 bettingEligible:false,modelPromoted:false});
function assess(p,doc,{firstGitAt,asOf}={}){
 const observed=stamp(asOf),capture=stamp(doc?.capturedAt),git=stamp(firstGitAt),
  start=stamp(p?.eventStartsAt),week=Number(String(p?.gameId||"").split("_")[1]);
 const team=CLUBS[p?.team]||null,name=String(p?.player||"").trim();
 if(doc?.kind!=="nfl_official_explicit_active_news_archive_v1"||
  doc.researchOnly!==true||doc.firstGitPending!==true||
  doc.noMedicalClearanceByOmission!==true||!Array.isArray(doc.positiveSnippets)||
  ![observed,capture,git,start].every(Number.isFinite)||
  !Number.isInteger(week)||doc.officialWeek!==week||
  !/^00-\d{7}$/.test(String(p?.historicalPlayerId||""))||
  !name.includes(" ")||!team||
  !String(p.gameId).split("_").includes(p.team)||
  capture>git||git>observed||observed-capture>12*3600000||
  start-git<15*60000)return blank("missing_first_git_original_player_game_proof");
 // Same positive sentence must contain EXACT full name, not just surname,
 // alongside a positive "is active for" statement. No negation, expectation
 // or another player may be converted into a positive status.
 const namePattern=escapeRE(name).replace(/\s+/g,"\\s+");
 const active=new RegExp("(?:^|[^\\w])"+namePattern+
  "\\s*(?:\\([^)]{0,120}\\)\\s*)?(?:is\\s+(?:officially\\s+)?active|has\\s+been\\s+declared\\s+active)\\s+for\\b","i");
 const records=doc.positiveSnippets.filter(r=>{
  const pub=stamp(r.publishedAt),update=stamp(r.updatedAt),seen=stamp(r.observedAt);
  if(![pub,update,seen].every(Number.isFinite)||pub>update||
   update>capture||seen>capture||pub>git||pub>=start-15*60000||
   capture-pub>36*3600000||norm(r.teamHeader)!==norm(team)||
   typeof r.snippet!=="string"||r.snippet.length>300||
   !/^https:\/\/(?:www\.|fantasy-www\.)?nfl\.com\/news\/[a-z0-9-]+(?:\?.*)?$/i.test(r.sourceUrl||""))
   return false;
  const sentence=r.snippet.replace(/\([^)]{0,120}\)/g," ");
  return active.test(sentence)&&
   !/\b(?:not active|inactive|ruled out|is out|expected to|will be|might be)\b/i.test(sentence);
 });
 if(records.length!==1)return blank(records.length?"duplicate_positive_claims":"no_unique_first_party_positive_mention");
 return {kind:KIND,status:"official_named_positive_research_only",
  namedFirstPartyStatementFound:true,player:p.player,team:p.team,
  gameId:p.gameId,sourceUrl:records[0].sourceUrl,
  firstGitAt,publishedAt:records[0].publishedAt,
  independentlyVerifiedProviderGSIS:false,fullGameDayActiveRosterVerified:false,
  originalAppOfferAuthenticated:false,bettingEligible:false,modelPromoted:false};
}
module.exports={KIND,assess};
