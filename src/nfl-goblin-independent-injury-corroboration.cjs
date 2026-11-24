"use strict";
/** Two-source pregame identity *corroboration*, not an authenticated
 * PrizePicks↔GSIS link. nflverse prior-week name/team/position candidates
 * can match an NFL.com explicitly reported OUT/QUESTIONABLE player by GSIS.
 * Unknown medical status never means healthy or game-day active.
 */
const {team}=require("./nfl-goblin-schedule-bridge-v1.cjs");
const date=s=>typeof s==="string"?Date.parse(s):NaN;
function summarize(candidates,official,{officialFirstGitAt,boardCapturedAt,now}={}){
 const base={kind:"nfl_independent_identity_injury_overlap_research_v1",
  sourceFirstGitBeforeBoard:false,conditionalPlayers:0,
  officialGsisCorroborated:0,confirmedOut:0,
  questionableHold:0,doubtfulHold:0,
  duplicateOrConflictingStatuses:0,
  notOfficiallyStatusMatched:0,
  authenticatedProviderGSIS:0,positiveActiveGameday:0,
  productionEligible:0,modelPromoted:false,providerRequests:0};
 const first=date(officialFirstGitAt),capture=date(boardCapturedAt),at=date(now),
  observed=date(official?.capturedAt);
 if(![first,capture,at,observed].every(Number.isFinite)||
    first>capture||observed>first+1000||capture>at||at-capture>30*60000||
    official?.kind!=="nfl_first_party_published_game_status_v1"||
    official.missingIsHealthy!==false||official.activeGameRosterVerified!==false||
    !Array.isArray(official.sources)||!official.sources.length||
    !official.sources.every(x=>/^https:\/\/(?:www|fantasy-www)\.nfl\.com\/news\/[a-z0-9-]+$/.test(x))||
    !Array.isArray(official.rows)||!Array.isArray(candidates))
  return base;
 const out={...base,sourceFirstGitBeforeBoard:true};
 const statuses=new Map();
 for(const x of official.rows){
  if(!/^00-\d{7}$/.test(x?.gsisId??"")||
    !["out","questionable","doubtful"].includes(x.status)||
    !Number.isInteger(x.week)||x.season!==2026||
    !Number.isFinite(date(x.modifiedAt))||date(x.modifiedAt)>observed)continue;
  const key=[x.gsisId,team(x.team),x.week].join("|");
  if(!statuses.has(key))statuses.set(key,[]);
  statuses.get(key).push(x);
 }
 const ids=new Set();
 for(const c of candidates){
  if(c.source!=="conditional_unique_name_team_position_prior_roster"||
   c.independentlyVerifiedProviderGSIS!==false||
   !/^00-\d{7}$/.test(c.gsisId??"")||
   !Array.isArray(c.priorWeeksUsed)||c.priorWeeksUsed.length<2||
   c.gameDayActiveVerified!==false||!c.providerPlayerId||
   ids.has(c.providerPlayerId))continue;
  ids.add(c.providerPlayerId);out.conditionalPlayers++;
  const week=Number(String(c.officialGameId||"").split("_")[1]);
  const found=statuses.get([c.gsisId,team(c.team),week].join("|"))||[];
  if(found.length>1){out.duplicateOrConflictingStatuses++;continue;}
  if(found.length===0){out.notOfficiallyStatusMatched++;continue;}
  out.officialGsisCorroborated++;
  if(found[0].status==="out")out.confirmedOut++;
  if(found[0].status==="questionable")out.questionableHold++;
  if(found[0].status==="doubtful")out.doubtfulHold++;
 }
 return out;
}
module.exports={summarize};
