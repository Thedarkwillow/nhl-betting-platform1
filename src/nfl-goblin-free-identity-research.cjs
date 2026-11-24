"use strict";
/**
 * Zero-cost prospective NFL provider→GSIS candidate matcher.
 *
 * The PrizePicks player key does not occur in nflverse. Exact name + team +
 * playing position + repeat prior-week GSIS consistency can make a unique
 * research candidate, NOT an independently verified shared-provider ID.
 * No name-only candidate is ever passed to the approved identity gate.
 */
const {team}=require("./nfl-goblin-schedule-bridge-v1.cjs");
const normalize=s=>String(s??"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const gsis=s=>typeof s==="string"&&/^00-\d{7}$/.test(s);
const pos=s=>String(s??"").toUpperCase().replace(/[^A-Z]/g,"");
const allowed=new Set(["QB","RB","FB","WR","TE","K","P","OT","G","C","T","OL","DL","DE","DT","LB","CB","S"]);
function build(offers,weeklyRows,gameCrosswalk,{sourceCapturedAt,rosterFirstGitAt,now}={}){
 const stamp=s=>typeof s==="string"?Date.parse(s):NaN;
 const capture=stamp(sourceCapturedAt),rosterGit=stamp(rosterFirstGitAt),asOf=stamp(now);
 const report={kind:"nfl_original_provider_to_gsis_candidate_research_v1",
  originalProviderPlayers:0,candidateMatches:0,ambiguousPlayers:0,
  insufficientPriorWeeks:0,noRosterMatch:0,conflictingSourceIdentity:0,
  invalidPlayerEntries:0,rosterProvenanceVerified:false,
  sourceIsSharedProviderIdentity:false,
  officialGameDayActiveVerified:0,independentlyVerifiedMappings:0,
  productionEligible:0,paidProviderRequests:0,modelPromoted:false,rows:[]};
 if(![capture,rosterGit,asOf].every(Number.isFinite)||
  rosterGit>capture||capture>asOf||asOf-capture>30*60000||
  !Array.isArray(offers)||!Array.isArray(weeklyRows)||!Array.isArray(gameCrosswalk)){
  report.status="uncertified_original_board_or_roster_first_git";
  return report;
 }
 report.rosterProvenanceVerified=true;
 const futureGames=new Map(gameCrosswalk.filter(g=>
  g?.source==="pregame_nflverse_schedule_git_verified"&&
  g.verifiedBeforeKickoff===true&&
  stamp(g.firstGitAt)<=capture&&stamp(g.officialKickoffAt)>asOf+15*60000)
  .map(x=>[x.providerGameId,x]));
 const src=new Map(),conflicted=new Set();
 for(const o of offers){
  if(o?.status!=="pre_game"||o.combo===true||o.eventType==="combo"||
   !futureGames.has(o.providerGameId)||
   !o.providerPlayerId||!normalize(o.player)||!allowed.has(pos(o.position))||
   !team(o.team))continue;
  const id=String(o.providerPlayerId),g=futureGames.get(o.providerGameId),
   key=JSON.stringify([normalize(o.player),team(o.team),pos(o.position),g.officialGameId]);
  if(src.has(id)&&src.get(id).key!==key)conflicted.add(id);
  else if(!src.has(id))src.set(id,{key,o,game:g});
 }
 report.originalProviderPlayers=src.size;
 const roster=new Map();
 for(const x of weeklyRows){
  if(Number(x?.season)!==2026||!Number.isInteger(Number(x.week))||
   !gsis(String(x.gsis_id||x.player_id||"")))continue;
  const n=normalize(x.full_name||x.player_name||x.player_display_name||
   (x.first_name&&x.last_name?x.first_name+" "+x.last_name:""));
  const t=team(x.team||x.recent_team),p=pos(x.position);
  if(!n||!t||!allowed.has(p))continue;
  const k=JSON.stringify([n,t,p]);
  if(!roster.has(k))roster.set(k,new Map());
  const m=roster.get(k),id=String(x.gsis_id||x.player_id);
  if(!m.has(id))m.set(id,new Set());
  m.get(id).add(Number(x.week));
 }
 const selectedByGSIS=new Map();
 for(const [providerId,{o,game}] of src){
  if(conflicted.has(providerId)){report.conflictingSourceIdentity++;continue;}
  const week=Number(String(game.officialGameId).split("_")[1]);
  if(!Number.isInteger(week)||week<2||week>18){report.invalidPlayerEntries++;continue;}
  const k=JSON.stringify([normalize(o.player),team(o.team),pos(o.position)]);
  const all=roster.get(k);
  if(!all||!all.size){report.noRosterMatch++;continue;}
  const earlier=[...all].map(([gsisId,weeks])=>({
   gsisId,weeks:[...weeks].filter(w=>w<week&&w>=week-3).sort((a,b)=>b-a)
  })).filter(x=>x.weeks.length);
  if(earlier.length!==1){report.ambiguousPlayers++;continue;}
  if(earlier[0].weeks.length<2){report.insufficientPriorWeeks++;continue;}
  const candidate={providerPlayerId:providerId,gsisId:earlier[0].gsisId,
   team:team(o.team),position:pos(o.position),originalPlayerName:o.player,
   officialGameId:game.officialGameId,
   originalProviderGameId:game.providerGameId,
   originalProviderPlayerIdFirstSeenAt:sourceCapturedAt,
   rosterFirstGitAt,priorWeeksUsed:earlier[0].weeks,
   source:"conditional_unique_name_team_position_prior_roster",
   independentlyVerifiedProviderGSIS:false,gameDayActiveVerified:false,
   researchOnly:true};
  if(selectedByGSIS.has(candidate.gsisId)&&
    selectedByGSIS.get(candidate.gsisId)!==providerId){
   report.ambiguousPlayers++;
   report.rows=report.rows.filter(x=>x.gsisId!==candidate.gsisId);
   continue;
  }
  selectedByGSIS.set(candidate.gsisId,providerId);
  report.rows.push(candidate);
 }
 report.candidateMatches=report.rows.length;
 report.status="conditional_id_candidates_never_bettable";
 return report;
}
module.exports={build,normalize};
