"use strict";
/**
 * Separate, immutable-intended RESEARCH hypotheses for Daily Faceoff PP/EV
 * assignments and MoneyPuck expected goalie shot volume.
 * This module must never change production rankings, slips or EV.
 */
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const stamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const rnd=x=>Number(x.toFixed(5));
const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
function editorialTeam(prop,approved,asOf){
 const now=stamp(asOf),start=stamp(prop.eventStartsAt),team=canonicalTeam(prop.team),opp=canonicalTeam(prop.opponent);
 const matches=(approved?.nhlEditorial?.games||[]).filter(g=>g.gameId===prop.gameId&&
  stamp(g.eventStartsAt)&&Math.abs(stamp(g.eventStartsAt)-start)<=300000&&
  [canonicalTeam(g.home),canonicalTeam(g.away)].includes(team)&&
  [canonicalTeam(g.home),canonicalTeam(g.away)].includes(opp)&&team!==opp&&
  g.officialClubLineupConfirmed===false&&g.source==="NHL.com editorial game preview"&&
  stamp(g.sourceCapturedAt)&&stamp(g.sourceCapturedAt)<=now&&now-stamp(g.sourceCapturedAt)<=4*3600000&&
  stamp(g.sourceCapturedAt)<start&&now<start);
 if(matches.length!==1)return null;
 const teams=(matches[0].teams||[]).filter(t=>t.team===team&&t.confirmed===false);
 return teams.length===1?{game:matches[0],team:teams[0]}:null;
}
function sourceGate(prop,approved,asOf){
 const now=stamp(asOf),start=stamp(prop?.eventStartsAt),quote=stamp(prop?.capturedAt),
  provider=stamp(approved?.generatedAt);
 if(!now||!start||!quote||!provider||now>=start||quote>now||quote>=start||
  provider>now||provider>=start||now-quote>90*60000||now-provider>4*3600000)
  return {status:"stale_or_after_puck_drop"};
 if(!Number.isInteger(prop?.gameId)||!Number.isInteger(prop?.playerId)||
  prop.gameId<=0||prop.playerId<=0||!Number.isFinite(prop?.projection)||
  prop.projection<0||!Number.isFinite(prop?.line)||prop.line<0||
  !["shotsOnGoal","goals","points","assists","saves"].includes(prop.market))
  return {status:"invalid_original_line_or_identity"};
 const games=(approved?.dailyFaceoff?.games||[]).filter(g=>g.gameId===prop.gameId&&
  stamp(g.eventStartsAt)&&Math.abs(stamp(g.eventStartsAt)-start)<=300000&&
  [canonicalTeam(g.home),canonicalTeam(g.away)].includes(canonicalTeam(prop.team))&&
  [canonicalTeam(g.home),canonicalTeam(g.away)].includes(canonicalTeam(prop.opponent))&&
  canonicalTeam(prop.team)!==canonicalTeam(prop.opponent));
 if(games.length!==1){const editorial=prop.market!=="saves"&&editorialTeam(prop,approved,asOf);if(editorial)return {status:"matched",game:editorial.game};return {status:"no_unique_matched_official_game_in_dfo_snapshot"};}
 return {status:"matched",game:games[0]};
}
function readDfoRole(prop,approved,now){
 const t=canonicalTeam(prop.team),record=approved.dailyFaceoff?.lineups?.[t];
 const updated=stamp(record?.sourceUpdatedAt),captured=stamp(record?.sourceCapturedAt);
 const current=stamp(now),start=stamp(prop.eventStartsAt);
 if(!updated||!captured||updated>captured||captured>current||updated>=start||
  current-updated>36*3600000||current-captured>4*3600000)
  return {status:"lineup_missing_or_stale",role:null};
 const matches=(record?.players||[]).filter(p=>p.playerId===prop.playerId&&canonicalTeam(p.team)===t);
 if(matches.length!==1)return {status:"player_lineup_unmatched_or_conflicted",role:null};
 const player=matches[0],roles=player.roles||[];
 if(player.gameTimeDecision||String(player.injuryStatus||"").trim())
  return {status:"injury_or_game_time_decision_requires_review",role:null};
 const unique=new Set(),byCategory=new Map();
 for(const x of roles){
  const category=String(x.categoryIdentifier||"").toLowerCase(),
   group=String(x.groupIdentifier||"").toLowerCase();
  if(!["ev","pp","pk"].includes(category)||!group||
   !/^(f|d|pp|pk)[1-9]$/.test(group))return {status:"unrecognized_role_schema",role:null};
  if(byCategory.has(category)&&byCategory.get(category)!==group)
   return {status:"conflicting_role_assignments",role:null};
  if(unique.has(category+"|"+group))continue;
  unique.add(category+"|"+group);byCategory.set(category,group);
 }
 const es=byCategory.get("ev")||null,pp=byCategory.get("pp")||null;
 if(!es)return {status:"even_strength_role_unknown",role:null};
 return {status:"matched_projected_role",role:{evenStrengthGroup:es,powerPlayGroup:pp,
  sourceUpdatedAt:record.sourceUpdatedAt,sourceCapturedAt:record.sourceCapturedAt,
  projectedNotOfficial:true,officialLineupVerified:false,sourceProvider:"Daily Faceoff"}};
}
function readRole(prop,approved,now){
 const dfo=readDfoRole(prop,approved,now),ed=editorialTeam(prop,approved,now);
 if(ed&&(ed.team.availability||[]).some(x=>x.playerId===prop.playerId))return {status:"editorial_injury_or_scratch_requires_review",role:null};
 if(dfo.role){
  const other=(ed?.team.players||[]).filter(x=>x.playerId===prop.playerId);
  if(other.length===1&&other[0].evenStrengthGroup!==dfo.role.evenStrengthGroup)return {status:"conflicting_editorial_and_dfo_roles",role:null};
  return dfo;
 }
 // Do not override explicit injury or conflicting DFO evidence.
 if(!ed||dfo.status!=="lineup_missing_or_stale")return dfo;
 const rows=(ed.team.players||[]).filter(x=>x.playerId===prop.playerId&&x.projectedOnly===true);
 if(rows.length!==1||!(/^[fd][1-4]$/.test(rows[0].evenStrengthGroup)))return dfo;
 return {status:"matched_projected_role",role:{evenStrengthGroup:rows[0].evenStrengthGroup,powerPlayGroup:null,
  sourceUpdatedAt:null,sourceCapturedAt:ed.game.sourceCapturedAt,projectedNotOfficial:true,officialLineupVerified:false,
  sourceProvider:"NHL.com editorial game preview",publicationTimeVerified:false}};
}
/* Deliberately predeclared, *not fitted*: tiny candidate opportunity shifts.
 * Their entire purpose is prospective ablation; never production weights. */
function hypothesisFactor(market,role){
 if(!role)return null;
 const es=role.evenStrengthGroup,pp=role.powerPlayGroup;
 const evBonus=es==="f1"||es==="d1"?.02:es==="f4"?-.02:0;
 const ppBonus=pp==="pp1"?.03:pp==="pp2"?.01:0;
 const roleSensitive=["goals","points","assists"].includes(market);
 const adjustment=cap(1+evBonus+(roleSensitive?ppBonus:ppBonus*.5),.94,1.07);
 return rnd(adjustment);
}
function roleCandidate(prop,approved,asOf,gate){
 if(prop.market==="saves")return {status:"not_skater_role_market",role:null};
 const status=readRole(prop,approved,asOf);
 if(!status.role)return status;
 const factor=hypothesisFactor(prop.market,status.role),mean=rnd(prop.projection*factor),
  probability=estimateCountProbabilities(mean,prop.line),
  original=estimateCountProbabilities(prop.projection,prop.line);
 if(!probability||!original)return {status:"unsupported_probability"};
 return {status:"role_research_only",role:status.role,unfittedFactor:factor,
  baseMean:rnd(prop.projection),roleShadowMean:mean,
  roleShadowHigher:probability.higher,championHigher:original.higher,
  coefficientNotValidated:true,modelDeployed:false,
  warning:"Unfitted projected even-strength/PP opportunity hypothesis, not evidence of a calibrated role effect."};
}
function goalieCandidate(prop,approved,asOf,game){
 if(prop.market!=="saves")return {status:"not_goalie_market"};
 const t=canonicalTeam(prop.team),reports=(game?.goalies||[]).filter(p=>p.playerId===prop.playerId&&canonicalTeam(p.team)===t);
 if(reports.length!==1)return {status:"no_unique_goalie_report"};
 const report=reports[0],source=stamp(report.reportAt);
 const status=["reported_confirmed","expected","unconfirmed"].includes(report.status)?report.status:"unconfirmed";
 if(status!=="unconfirmed"&&(!source||source>stamp(asOf)||source>=stamp(prop.eventStartsAt)))
  return {status:"goalie_report_after_asof_or_game"};
 const own=approved.moneyPuck?.goalies?.rows?.[String(prop.playerId)];
 if(!own||own.gamesPlayed<5||canonicalTeam(own.team)!==t||
  !Number.isFinite(own.xOnGoalAgainstPer60)||!Number.isFinite(own.xGoalsAgainstPer60)||
  own.xOnGoalAgainstPer60<own.xGoalsAgainstPer60)
  return {status:"missing_reliable_goalie_shot_quality"};
 const minutes=prop.roleEvidence?.usage?.expectedMinutesShadow;
 if(!Number.isFinite(minutes)||minutes<10||minutes>60)
  return {status:"insufficient_past_only_goalie_minutes"};
 const opponent=canonicalTeam(prop.opponent),
  teamRows=Object.values(approved.moneyPuck?.teams?.rows||{}).filter(x=>x.gamesPlayed>=5&&Number.isFinite(x.shotsOnGoalForPer60)),
  league=teamRows.length>=12?teamRows.reduce((a,b)=>a+b.shotsOnGoalForPer60,0)/teamRows.length:null,
  other=approved.moneyPuck?.teams?.rows?.[opponent];
 const ratio=league>0&&other?.gamesPlayed>=5&&Number.isFinite(other.shotsOnGoalForPer60)?
  cap(other.shotsOnGoalForPer60/league,.8,1.2):1;
 const qualityRate=own.xOnGoalAgainstPer60-own.xGoalsAgainstPer60;
 // This is a conditional-on-playing shadow, NOT a P(start) estimate.
 const conditionalMean=rnd(.75*prop.projection+.25*(qualityRate*minutes/60)*(.85+.15*ratio));
 const prob=estimateCountProbabilities(conditionalMean,prop.line);
 if(!prob)return {status:"unsupported_goalie_probability"};
 return {status:"goalie_conditional_research_only",sourceStatus:status,
  reportedAt:report.reportAt||null,reportedBy:report.reportSource||null,
  reportUrl:report.reportUrl||null,
  startingGoalieVerifiedByTeam:false,startingProbability:null,
  expectedMinutesIfPlayingShadow:rnd(minutes),opponentRelativeShotVolume:rnd(ratio),
  baseMean:rnd(prop.projection),conditionalSavesShadowMean:conditionalMean,
  conditionalHigherIfPlaying:prob.higher,unknownStarterNoSlip:true,
  projectionConditionalOnPlaying:true,modelDeployed:false,
  warning:"DFO reported goalie status is secondary; no first-party confirmed start or unconditional saves probability."};
}
function buildRoleGoalieShadow(research,approved,asOf){
 if(!Array.isArray(research?.rankedProps)||!approved?.dailyFaceoff||!approved?.moneyPuck)
  throw Error("Missing original research or licensed private source snapshot");
 const rows=[],reasons={},seen=new Set();let skaters=0,goalies=0,reportConfirmed=0;
 for(const p of research.rankedProps){
  const key=[p.gameId,p.playerId,p.market,p.line,p.tier,p.lean,p.eventStartsAt].join("|");
  if(seen.has(key))continue;seen.add(key);
  const g=sourceGate(p,approved,asOf);
  if(g.status!=="matched"){reasons[g.status]=(reasons[g.status]||0)+1;continue;}
  const candidate=p.market==="saves"?
   goalieCandidate(p,approved,asOf,g.game):roleCandidate(p,approved,asOf,g);
  if(candidate.status==="role_research_only")skaters++;
  if(candidate.status==="goalie_conditional_research_only"){
   goalies++;if(candidate.sourceStatus==="reported_confirmed")reportConfirmed++;
  }
  if(!["role_research_only","goalie_conditional_research_only"].includes(candidate.status))
   reasons[candidate.status]=(reasons[candidate.status]||0)+1;
  // Append all eligible candidate evidence, including unresolved role reasons.
  rows.push({gameId:p.gameId,eventStartsAt:p.eventStartsAt,playerId:p.playerId,
   playerTeam:canonicalTeam(p.team),opponentTeam:canonicalTeam(p.opponent),
   market:p.market,line:p.line,tier:p.tier,selectedSide:p.lean,
   originalCapturedAt:p.capturedAt,sourceCapturedAt:approved.generatedAt,
   researchAsOf:asOf,...candidate});
 }
 return {schemaVersion:1,kind:"nhl_dfo_role_goalie_conditional_shadow_v1",
  asOf,sourceCapturedAt:approved.generatedAt,
  counts:{originalProps:research.rankedProps.length,matchedGameRows:rows.length,
   skaterRoleCandidates:skaters,conditionalGoalieCandidates:goalies,
   dfoReporterConfirmedGoalieCandidates:reportConfirmed,
   exclusions:reasons},
  rows,uncalibrated:true,modelDeployed:false,
  starterProbabilityEstimated:false,officialClubStarterConfirmed:false,
  platformOfferAuthenticated:false,prospectiveGradesPending:true,
  warning:"Hypothetical DFO EV/PP coefficients are unfitted; goalie saves is conditional on playing and no team starter was authenticated. This is a separate private prospective research snapshot; never modify current published props or slips."};
}
module.exports={sourceGate,readRole,hypothesisFactor,roleCandidate,goalieCandidate,buildRoleGoalieShadow};
