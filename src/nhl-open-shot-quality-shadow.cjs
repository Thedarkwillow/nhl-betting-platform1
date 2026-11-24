"use strict";
// Separate fixed shot-quality/attempt conversion shadow. Current season
// aggregates observed before puck drop only; no retrospective season totals.
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN,finite=x=>typeof x==="number"&&Number.isFinite(x),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function project(p,approved,now){
 const at=dt(now),start=dt(p?.gameStartAt||p?.eventStartsAt),cap=dt(p?.capturedAt),source=dt(approved?.generatedAt);
 if(!Number.isFinite(at)||!(cap<=at&&at-cap<=1800000&&source<=at&&at-source<=14400000&&at<start-900000)||!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||!["goals","shotsOnGoal"].includes(p.market)||!finite(p.projection)||p.projection<0)return null;
 const m=approved.moneyPuck,s=m?.skaters?.rows?.[String(p.playerId)],teams=m?.teams?.rows;
 if(m?.completeSeasonSummary!==true||m.availableForCurrentShadow!==true||!s||s.playerId!==p.playerId||canonicalTeam(s.team)!==canonicalTeam(p.team)||s.gamesPlayed<5||!(dt(s.sourceObservedAt)<=source&&source-dt(s.sourceObservedAt)<=3600000))return null;
 const min=p.roleEvidence?.usage?.expectedMinutesShadow,attempt=s.shotAttemptsPer60,xog=s.xOnGoalPer60,xg=s.xGoalsPer60,danger=s.highDangerShotsPer60;
 if(!finite(min)||min<7||min>35||!finite(attempt)||attempt<=0||!finite(xog)||xog<0||xog>attempt||!finite(xg)||xg<0||!finite(danger)||danger<0||danger>attempt)return null;
 const other=teams?.[canonicalTeam(p.opponent)],field=p.market==="goals"?"xGoalsAgainstPer60":"shotAttemptsAgainstPer60";
 const valid=Object.values(teams||{}).filter(t=>t.gamesPlayed>=5&&finite(t[field])&&t[field]>0&&dt(t.sourceObservedAt)<=source);
 if(valid.length<20||!other||other.gamesPlayed<5||!finite(other[field])||other[field]<=0||!(dt(other.sourceObservedAt)<=source))return null;
 const league=valid.reduce((a,b)=>a+b[field],0)/valid.length;
 const ratio=clamp(other[field]/league,.8,1.2),conversion=p.market==="goals"?xg/attempt:xog/attempt;
 const modelRate=attempt*min/60*conversion*(.6+.4*ratio),shadow=.75*p.projection+.25*modelRate;
 return {playerId:p.playerId,gameId:p.gameId,market:p.market,line:p.line,tier:p.tier,originalSide:p.lean,championProjection:p.projection,shadowProjection:shadow,shadowSide:shadow>p.line?"Higher":shadow<p.line?"Lower":"Abstain",observedAt:now,sourceObservedAt:approved.generatedAt,features:{attemptsPer60:attempt,highDangerShotsPer60:danger,conversion,opponentRatio:ratio,expectedMinutes:min},researchOnly:true,calibrated:false};
}
module.exports={project};
