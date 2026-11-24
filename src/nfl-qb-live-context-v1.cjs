"use strict";
// Exact point-in-time context. Presence of a depth chart or absence from
// an injury list is not confirmation of starting or active status.
const {gameDay,sameOfficialClubHost}=require("./nfl-point-in-time-readiness-v1.cjs"),{attachNflAvailability}=require("./nfl-current-injury-evidence.cjs");
const dt=Date.parse,num=Number.isFinite,median=a=>{const v=[...a].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
const one=a=>a.length===1?a[0]:null;
function timely(x,p,now,max=4*3600000){
 const a=dt(x?.observedAt),g=dt(x?.firstGitAt),n=dt(now),s=dt(p.eventStartsAt);
 return x?.gameId===p.gameId&&[a,g,n,s].every(num)&&a<=g&&g<=n&&n-a<=max&&n<=s-900000&&x.firstGitVerified===true;
}
function context(p,{now,roster=null,injury=null,starters=[],quotes=[],weather=[]}={}){
 const active=gameDay(p,roster,now),health=attachNflAvailability(p,injury,now);
 const lineup=one(starters.filter(x=>timely(x,p,now)&&x.team===p.team&&sameOfficialClubHost(x.sourceUrl,p.team)&&x.explicitStartingLineup===true&&Array.isArray(x.entries)));
 const entries=lineup?.entries||[],qbs=entries.filter(x=>x.position==="QB"),qb=qbs.length===1&&qbs[0].gsisId===p.historicalPlayerId&&active.gameDayActiveVerified&&!health.blocksResearch;
 const positions=["LT","LG","C","RG","RT"],ol=positions.map(position=>one(entries.filter(x=>x.position===position)));
 const lineComplete=ol.every(Boolean)&&new Set(ol.map(x=>x?.gsisId)).size===5&&ol.every(x=>/^00-\d{7}$/.test(x.gsisId||""));
 const olStatus=lineComplete?ol.map(x=>({position:x.position,active:gameDay({...p,historicalPlayerId:x.gsisId},roster,now).gameDayActiveVerified,injury:attachNflAvailability({...p,historicalPlayerId:x.gsisId},injury,now).status})):null;
 const olVerified=!!olStatus&&olStatus.every(x=>x.active),olRisk=!!olStatus&&olStatus.some(x=>["out","doubtful","questionable","ambiguous","did_not_participate","probable","report_status_unconfirmed","unrecognized"].includes(x.injury));
 const q=quotes.filter(x=>timely(x,p,now,1800000)&&dt(x.eventStartsAt)===dt(p.eventStartsAt)&&x.team===p.team&&x.opponent===p.opponent&&x.source==="The Odds API"&&num(x.teamSpread)&&num(x.total)&&x.total>Math.abs(x.teamSpread)&&x.twoSidedVerified===true&&num(dt(x.marketUpdatedAt))&&dt(x.marketUpdatedAt)<=dt(x.observedAt)&&dt(now)-dt(x.marketUpdatedAt)<=1800000);
 const unique=q.filter(x=>q.filter(z=>z.book===x.book).length===1);
 const market=unique.length>=2?{books:unique.length,teamSpread:median(unique.map(x=>x.teamSpread)),total:median(unique.map(x=>x.total)),impliedTeamTotal:median(unique.map(x=>(x.total-x.teamSpread)/2)),pointInTimeVerified:true}:null;
 const wx=one(weather.filter(x=>timely(x,p,now,24*3600000)&&dt(x.eventStartsAt)===dt(p.eventStartsAt)&&[x.team,x.opponent].includes(p.team)&&[x.team,x.opponent].includes(p.opponent)&&x.source==="NOAA/NWS hourly forecast"&&x.venueVerified===true&&x.isForecast===true&&x.roofExposure==="outdoor"&&num(x.windSpeedKmh)&&x.windSpeedKmh>=0&&num(dt(x.issuedAt))&&dt(x.issuedAt)<=dt(x.observedAt)));
 return {startingQBVerified:qb,gameDayActiveVerified:active.gameDayActiveVerified,injuryStatus:health.status,medicalClearanceVerified:false,offensiveLineStartingFiveVerified:lineComplete&&olVerified,offensiveLineAvailability:olStatus,offensiveLineInjuryRisk:olRisk,market,weather:wx?{windSpeedKmh:wx.windSpeedKmh,precipitationProbabilityPct:wx.precipitationProbabilityPct,observedAt:wx.observedAt}:null,liveInputsComplete:qb&&lineComplete&&olVerified&&!olRisk&&!!market&&!!wx,researchOnly:true,modelPromoted:false};
}
module.exports={context,timely};
