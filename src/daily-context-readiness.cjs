"use strict";
// Private aggregate only. Coverage is not clearance or model approval.
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const count=x=>Number.isInteger(x)&&x>=0?x:null;
function freshness(at,now,maxMinutes){const a=dt(at),t=dt(now);if(!Number.isFinite(a)||!Number.isFinite(t)||a>t)return {state:"missing_or_invalid",ageMinutes:null};const ageMinutes=Math.floor((t-a)/60000);return {state:t-a<=maxMinutes*60000?"fresh_archive":"stale_archive",ageMinutes};}
function roleCoverage({usage,external,league,approved}={},now){
 const e=freshness(external?.generatedAt,now,90),l=freshness(league?.capturedAt,now,360),a=freshness(approved?.generatedAt,now,90);
 return {kind:"nhl_role_source_coverage_v1",officialHistoricalMinutes:count(usage?.summary?.withToi),officialHistoricalGoalieRows:count(usage?.summary?.goalies),
 externalInjury:{...e,rows:e.state==="fresh_archive"&&Array.isArray(external?.injuries)?external.injuries.length:null},
 leaguePublished:{...l,rows:l.state==="fresh_archive"&&Array.isArray(league?.rows)?league.rows.length:null},
 projectedLineAndGoalie:{...a,teams:a.state==="fresh_archive"?count(approved?.dailyFaceoff?.lineTeams):null,reportedGoalies:a.state==="fresh_archive"?count(approved?.dailyFaceoff?.goalieReports):null},
 firstPartyMedicalClearanceVerified:false,actualStartingLineupVerified:false,modelPromoted:false};
}
function calibrationCoverage(report){
 const g=report?.hierarchicalCalibration?.byMarketTierSide;
 const tiers=Object.fromEntries(["Standard","Goblin","Demon"].map(t=>[t,{groups:0,observed:0,matchedHeldout:0,minimumEvidenceGroups:0}]));
 if(!g||typeof g!=="object")return {available:false,tiers:null,approved:false};
 for(const [key,v] of Object.entries(g)){let k;try{k=JSON.parse(key)}catch{continue}const t=tiers[k?.[2]];if(!t||count(v.observed)===null||count(v.matchedHeldout)===null||v.matchedHeldout>v.observed)continue;
  t.groups++;t.observed+=v.observed;t.matchedHeldout+=v.matchedHeldout;t.minimumEvidenceGroups+=Number(v.minimumEvidenceReached===true);}
 return {available:true,reportedAt:report.generatedAt??null,tiers,approved:false};
}
module.exports={freshness,roleCoverage,calibrationCoverage};
