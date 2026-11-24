"use strict";
const {canonical}=require("./nhl-opponent-context.cjs"),{beforeFreeze}=require("./archived-prop-market-benchmark.cjs");
const dt=Date.parse,num=Number.isFinite,sum=a=>a.reduce((s,x)=>s+x,0),avg=a=>sum(a)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const fresh=(at,now,h)=>num(dt(at))&&dt(at)<=dt(now)&&dt(now)-dt(at)<=h*3600000;
const validSource=(x,now,h)=>x?.document&&fresh(x.firstCommittedAt,now,h)&&fresh(x.document.generatedAt||x.document.capturedAt,now,h)&&dt(x.document.generatedAt||x.document.capturedAt)<=dt(x.firstCommittedAt)+1000;
function prior(history,id,team,day){let a=(history?.players?.[String(id)]?.games||[]).filter(g=>g.gameDate<day&&canonical(g.team)===canonical(team)&&g.type==="skater"&&["OFF","FINAL"].includes(g.gameState)&&num(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-10);return a.length>=5&&new Set(a.map(g=>g.gameId)).size===a.length?a:[];}
function roles(p,approved,now){if(!validSource(approved,now,8)||approved.document.kind!=="approved_nhl_source_research_snapshots")return null;
 const team=approved.document.dailyFaceoff?.lineups?.[canonical(p.team)],list=team?.players||[];
 if(!fresh(team?.sourceCapturedAt,now,8)||!num(dt(team?.sourceUpdatedAt))||dt(team.sourceUpdatedAt)>dt(team.sourceCapturedAt))return null;
 const members=list.filter(x=>canonical(x.team)===canonical(p.team)&&Number.isInteger(x.playerId)&&!x.injuryStatus&&!x.gameTimeDecision),me=members.filter(x=>x.playerId===p.playerId);if(me.length!==1)return null;
 const ev=me[0].roles?.filter(x=>x.categoryIdentifier==="ev")||[],pp=me[0].roles?.filter(x=>x.categoryIdentifier==="pp")||[];if(ev.length!==1||pp.length>1||!/^([fd][1-4])$/.test(ev[0].groupIdentifier)||pp.length&&!/^pp[12]$/.test(pp[0].groupIdentifier))return null;
 const peers=members.filter(x=>x.playerId!==p.playerId&&x.roles?.some(y=>y.categoryIdentifier==="ev"&&y.groupIdentifier===ev[0].groupIdentifier));
 if(new Set(peers.map(x=>x.playerId)).size!==peers.length)return null;
 return {evenStrengthGroup:ev[0].groupIdentifier,powerPlayGroup:pp[0]?.groupIdentifier??null,projectedLinemateIds:peers.map(x=>x.playerId),capturedAt:team.sourceCapturedAt,projectedNotConfirmed:true};
}
function context(p,{history,approved=null,injury=null,special=null,goalies=null,odds=[],position=null,now}){
 if(!num(dt(now))||!(dt(p.gameStartAt)-dt(now)>=900000))return null;
 const day=require("./nhl-standard-forward-diagnostics.cjs").pacificDay(now),t=canonical(p.team),o=canonical(p.opponent),own=prior(history,p.playerId,t,day),role=roles(p,approved,now);
 let specialTeams=null;if(validSource(special,now,24)&&special.document.kind==="official_nhl_special_teams_snapshot_v1"&&special.document.fullLeague===true){const all=Object.values(special.document.teams),a=special.document.teams[t],b=special.document.teams[o];
  if(all.length===32&&a?.games>=5&&b?.games>=5&&all.every(x=>num(x.powerPlayEfficiency)&&num(x.penaltyKillEfficiency)&&x.powerPlayEfficiency>=0&&x.powerPlayEfficiency<=1&&x.penaltyKillEfficiency>=0&&x.penaltyKillEfficiency<=1)){const league=avg(all.map(x=>x.powerPlayEfficiency)),allowed=avg(all.map(x=>1-x.penaltyKillEfficiency));specialTeams={ownPP:a.powerPlayEfficiency,opponentPK:b.penaltyKillEfficiency,leaguePP:league,opponentPPAllowed:1-b.penaltyKillEfficiency,relativePPMatchup:league>0&&allowed>0?cap(.5*a.powerPlayEfficiency/league+.5*(1-b.penaltyKillEfficiency)/allowed,.5,1.5):null,capturedAt:special.document.capturedAt,seasonAggregate:true};}}
 let availability={status:"unknown",reportedUnavailableTeammates:[],replacementMinutesScenario:null,medicalClearanceVerified:false};
 if(validSource(injury,now,8)&&injury.document.kind==="nhl_league_published_pregame_status_v1"&&Array.isArray(injury.document.sources)&&injury.document.sources.some(x=>x.gameId===p.gameId)){
  const rows=(injury.document.rows||[]).filter(x=>x.gameId===p.gameId&&canonical(x.team)===t&&num(dt(x.reportedAt))&&dt(x.reportedAt)<=dt(injury.document.capturedAt)&&Math.abs(dt(x.eventStartsAt)-dt(p.gameStartAt))<=300000),out=rows.filter(x=>["injured","scratched","out","suspended"].includes(x.status));
  availability.status=out.some(x=>x.playerId===p.playerId)?"reported_unavailable":"not_listed_unavailable_not_clearance";
  const ids=[...new Set(out.filter(x=>x.playerId!==p.playerId).map(x=>x.playerId))];availability.reportedUnavailableTeammates=ids;
  if(own.length&&role&&availability.status!=="reported_unavailable"){
   const getPosition=a=>({L:"LW",R:"RW"}[a.at(-1)?.position]||a.at(-1)?.position),pos=getPosition(own),others=ids.map(id=>prior(history,id,t,day)).filter(a=>a.length&&getPosition(a)===pos);
   const mins=sum(others.map(a=>avg(a.map(g=>g.timeOnIceSeconds))))/60,base=avg(own.map(g=>g.timeOnIceSeconds))/60;
   // Scenario, not a causal estimate or a replacement assignment. Never
   // distribute all missing minutes to one player or assert their availability.
   availability.replacementMinutesScenario=others.length?{samePositionReportedOut:others.length,missingHistoricalMinutes:mins,playerHistoricalMinutes:base,illustrativeAdditionalMinutes:Math.min(2,.1*mins),validated:false}:null;
  }
 }
 let goalie={status:"unknown",officialClubConfirmed:false};if(validSource(goalies,now,1.5)&&goalies.document.kind==="nhl_external_pregame_availability_research"){
 const events=(goalies.document.events||[]).filter(x=>x.nhlGameId===p.gameId&&Math.abs(dt(x.eventStartsAt)-dt(p.gameStartAt))<=300000);
 const a=events.length===1?(events[0].goalies||[]).filter(x=>canonical(x.team)===o&&x.officialRosterIdentityMatched===true):[];
 if(a.length===1)goalie={status:a[0].sourceStatus,officialClubConfirmed:a[0].officialTeamStarterConfirmation===true,opponentGoalieId:a[0].playerId};
 }
 const benchmark=beforeFreeze(p,odds,now),raw=p.probabilities?.higher;let agreement=null;
 const values=own.filter(g=>num(g[p.market])).map(g=>g[p.market]).slice(-10),form=values.length>=5?values.filter(v=>v>p.line).length/values.length:null;
 const reasons=[];if(num(raw)&&benchmark&&Math.abs(raw-benchmark.higher)>=.15)reasons.push("model_sportsbook_gap_15pp");
 if(num(raw)&&num(form)&&(raw-.5)*(form-.5)<0)reasons.push("model_recent_form_direction_conflict");
 if(p.lean==="Lower"&&specialTeams?.relativePPMatchup>=1.15&&role?.powerPlayGroup&&["assists","points","goals","powerPlayPoints"].includes(p.market))reasons.push("lower_versus_strong_PP_matchup");
 if(availability.status==="reported_unavailable")reasons.push("reported_unavailable");
 if(p.lean==="Lower"&&position?.defenseFactor>=1.1&&position?.offenseFactor>=1.03)reasons.push("lower_against_weak_position_defense_and_strong_offense");
 if(p.lean==="Higher"&&position?.defenseFactor<=.9&&position?.offenseFactor<=.97)reasons.push("higher_against_strong_position_defense_and_weak_offense");
 const positional=position?{role:position.position,defenseFactor:position.defenseFactor,offenseFactor:position.offenseFactor,window:position.defense?.last5??null}:null;
 if(benchmark)agreement={conditionalNameTeamGameLine:true,books:benchmark.bookCount,higher:benchmark.higher,observedAt:benchmark.quoteAt,sharedPlayerIdVerified:false};
 return {kind:"nhl_matchup_context_review_v1",market:p.market,position:own.at(-1)?.position??null,role,specialTeams,availability,goalie,positional,formAboveRate:form,formSample:values.length,benchmark:agreement,reasons,reviewRequired:reasons.length>0||availability.status==="unknown"||!role||!specialTeams,calibrated:false,modelPromoted:false};
}
module.exports={fresh,validSource,roles,context};
