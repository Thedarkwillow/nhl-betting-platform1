"use strict";
// Experimental component models. No causal inference from same-game presence,
// and no use of future realized lineups, injuries, or actual game minutes.
const {canonical}=require("./nhl-opponent-context.cjs"),{validSource}=require("./nhl-matchup-context-review.cjs"),{pacificDay}=require("./nhl-standard-forward-diagnostics.cjs"),{poisson}=require("./nhl-shot-block-tail-v2.cjs");
const n=Number.isFinite,ct=x=>Number.isInteger(x)&&x>=0,sum=a=>a.reduce((s,x)=>s+x,0),avg=a=>sum(a)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x)),dt=Date.parse;
function prior(history,id,team,day){const a=(history?.players?.[String(id)]?.games||[]).filter(g=>g.gameDate<day&&g.type==="skater"&&canonical(g.team)===canonical(team)&&["OFF","FINAL"].includes(g.gameState)&&n(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-40);return new Set(a.map(x=>x.gameId)).size===a.length?a:[];}
function pp(prior,special){
 const a=prior.filter(x=>ct(x.powerPlayPoints)&&ct(x.points)&&x.points>=x.powerPlayPoints&&ct(x.powerPlayTimeOnIceSeconds)&&x.powerPlayTimeOnIceSeconds<=x.timeOnIceSeconds&&(!x.powerPlayPoints||x.powerPlayTimeOnIceSeconds>0)).slice(-20);
 if(a.length<8)return null;const ice=sum(a.map(x=>x.timeOnIceSeconds)),ppIce=sum(a.map(x=>x.powerPlayTimeOnIceSeconds)),evIce=ice-ppIce;if(ppIce<180||evIce<=0)return null;
 const toi=.65*avg(a.slice(-10).map(x=>x.timeOnIceSeconds))+.35*avg(a.slice(-5).map(x=>x.timeOnIceSeconds)),share=.65*sum(a.slice(-5).map(x=>x.powerPlayTimeOnIceSeconds))/sum(a.slice(-5).map(x=>x.timeOnIceSeconds))+.35*ppIce/ice;
 const expectedPP=toi*share,ppBase=(sum(a.map(x=>x.powerPlayPoints))+.5)/(ppIce+300)*expectedPP,nonPP=(sum(a.map(x=>x.points-x.powerPlayPoints))+.5)/(evIce+1800)*(toi-expectedPP);
 const factor=n(special?.relativePPMatchup)?cap(special.relativePPMatchup,.5,1.5):null;
 return {games:a.length,expectedPPSeconds:expectedPP,ppBaseline:ppBase,nonPPBaseline:nonPP,ppAdjusted:factor===null?null:ppBase*(1+.5*(factor-1)),factor,roleChangeNotEstimated:true};
}
function peers(p,history,ctx,day,a){
 const ids=ctx?.role?.projectedLinemateIds;if(!Array.isArray(ids)||!ids.length)return null;const results=[];
 for(const id of [...new Set(ids)]){const b=prior(history,id,p.team,day),g=new Set(b.map(x=>x.gameId)),both=a.filter(x=>g.has(x.gameId)&&ct(x[p.market])),rest=a.filter(x=>!g.has(x.gameId)&&ct(x[p.market]));if(both.length<5||rest.length<5)continue;const rate=x=>3600*sum(x.map(y=>y[p.market]))/sum(x.map(y=>y.timeOnIceSeconds));results.push({teammateId:id,coAppearanceGames:both.length,otherObservedGames:rest.length,coAppearancePer60:rate(both),otherPer60:rate(rest),sharedShiftVerified:false});}
 return results.length?{comparisons:results,coAppearanceOnly:true,causalChemistryVerified:false}:null;
}
function goalieQuality(p,ctx,approved,now){if(!validSource(approved,now,4))return null;const m=approved.document.moneyPuck,sk=m?.skaters?.rows?.[String(p.playerId)],g=m?.goalies?.rows?.[String(ctx?.goalie?.opponentGoalieId)];if(m?.completeSeasonSummary!==true||m.availableForCurrentShadow!==true||!sk||canonical(sk.team)!==canonical(p.team)||sk.gamesPlayed<5||![sk.xGoalsPer60,sk.xOnGoalPer60,sk.highDangerShotsPer60,sk.shotAttemptsPer60].every(x=>n(x)&&x>=0)||sk.highDangerShotsPer60>sk.shotAttemptsPer60||sk.xOnGoalPer60>sk.shotAttemptsPer60)return null;
 const goalies=Object.values(m.goalies.rows).filter(x=>x.gamesPlayed>=5&&x.iceTimeSeconds>=9000&&n(x.xGoalsAgainstPer60)&&x.xGoalsAgainstPer60>0&&n(x.goalsAgainstPer60)&&x.goalsAgainstPer60>=0);
 let ratio=null;if(g&&canonical(g.team)===canonical(p.opponent)&&goalies.includes(g)&&goalies.length>=20&&["expected","reported_confirmed"].includes(ctx?.goalie?.status)){const lg=sum(goalies.map(x=>x.goalsAgainstPer60*x.iceTimeSeconds))/sum(goalies.map(x=>x.xGoalsAgainstPer60*x.iceTimeSeconds));if(lg>0)ratio=cap(1+((g.goalsAgainstPer60/g.xGoalsAgainstPer60)/lg-1)*g.gamesPlayed/(g.gamesPlayed+20),.8,1.2);}
 return {expectedGoalsPer60:sk.xGoalsPer60,expectedOnGoalPer60:sk.xOnGoalPer60,highDangerAttemptsPer60:sk.highDangerShotsPer60,shotAttemptsPer60:sk.shotAttemptsPer60,goalieQualityFactor:ratio,goalieOfficialConfirmation:ctx?.goalie?.officialClubConfirmed===true,sourceCapturedAt:approved.document.generatedAt,privateResearchOnly:true};
}
function model(p,{history,ctx,approved,now}){
 if(!ctx||!(dt(p.gameStartAt)-dt(now)>=900000)||ctx.availability?.status==="reported_unavailable"||!n(p.line)||p.line%1!==.5)return null;
 const day=pacificDay(now),a=prior(history,p.playerId,p.team,day);if(a.length<8)return null;const v=a.filter(g=>ct(g[p.market])).slice(-20);if(v.length<8)return null;
 const toi=.65*avg(v.slice(-10).map(x=>x.timeOnIceSeconds))+.35*avg(v.slice(-5).map(x=>x.timeOnIceSeconds)),rate=sum(v.map(x=>x[p.market]))/sum(v.map(x=>x.timeOnIceSeconds)),base=rate*toi,ppEvidence=pp(a,ctx.specialTeams),quality=goalieQuality(p,ctx,approved,now),est={usage:base,recentForm:.6*avg(v.slice(-5).map(x=>x[p.market]))+.4*avg(v.map(x=>x[p.market]))};
 if(ppEvidence?.ppAdjusted!==null&&ppEvidence?.ppAdjusted!==undefined&&["points","powerPlayPoints"].includes(p.market))est.specialTeams=p.market==="points"?ppEvidence.nonPPBaseline+ppEvidence.ppAdjusted:ppEvidence.ppAdjusted;
 const repl=ctx.availability?.replacementMinutesScenario;if(n(repl?.illustrativeAdditionalMinutes)&&repl.illustrativeAdditionalMinutes>=0&&repl.illustrativeAdditionalMinutes<=2)est.replacementSensitivity=rate*(toi+60*repl.illustrativeAdditionalMinutes);
 if(quality&&["goals","shotsOnGoal"].includes(p.market)){const q=(p.market==="goals"?quality.expectedGoalsPer60:quality.expectedOnGoalPer60)*toi/3600;est.shotQuality=.5*base+.5*q;if(p.market==="goals"&&quality.goalieQualityFactor!==null)est.goalieQuality=.5*base+.5*q*quality.goalieQualityFactor;}
 // Independent shot opportunity and conversion hypotheses. Expected on-goal
 // rate is sourced rather than reconstructed from final target-game outcomes.
 const linemates=peers(p,history,ctx,day,a);
 if(quality&&p.market==="shotsOnGoal"&&quality.shotAttemptsPer60>0){
  const observedRate=rate*3600,conversion=cap(.5*observedRate/quality.shotAttemptsPer60+.5*quality.expectedOnGoalPer60/quality.shotAttemptsPer60,0,1);
  est.attemptConversion=quality.shotAttemptsPer60*toi/3600*conversion;
 }
 // Association only: projected linemate co-appearance is not shared-shift
 // chemistry. Keep a separate small, explicitly labeled sensitivity.
 if(linemates&&["shotsOnGoal","points","assists"].includes(p.market)){
  const effects=linemates.comparisons.filter(x=>x.otherPer60>0).map(x=>cap((x.coAppearancePer60/x.otherPer60-1)*Math.min(x.coAppearanceGames,x.otherObservedGames)/(Math.min(x.coAppearanceGames,x.otherObservedGames)+30),-.1,.1));
  if(effects.length)est.linemateAssociationSensitivity=base*(1+avg(effects));
 }
 const position=ctx.positional;if(n(position?.defenseFactor)&&n(position?.offenseFactor))est.positionAndUsage=base*cap(1+.65*(position.defenseFactor-1)+.35*(position.offenseFactor-1),.8,1.2);
 return {kind:"nhl_component_matchup_shadow_v1",expectedIceSeconds:toi,recentGames:v.length,estimates:est,higher:Object.fromEntries(Object.entries(est).map(([k,mu])=>[k,poisson(mu,p.line)])),powerPlay:ppEvidence,linemates,quality,researchOnly:true,modelPromoted:false};
}
module.exports={prior,pp,peers,goalieQuality,model};