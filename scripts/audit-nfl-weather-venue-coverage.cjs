"use strict";
// Exact stadium identity audit. Candidate data never promotes a venue to
// reviewed status. The forecast collector accepts only the reviewed registry.
const fs=require("node:fs"),{dataset}=require("./build-nfl-partner-board-research.cjs"),registry=require("../config/nfl-weather-venue-registry-v1.json");
function audit(schedule,reviewed){
 const out=new Map();
 for(const g of schedule.filter(x=>x.game_type==="REG")){
  const id=g.stadium_id,name=g.stadium;
  if(!id||!name)continue;
  const k=JSON.stringify([id,name]),a=out.get(k)||{stadiumId:id,stadiumName:name,scheduledGames:0,roofValues:new Set(),neutralGames:0};
  a.scheduledGames++;a.roofValues.add(g.roof??"unknown");a.neutralGames+=Number(g.location==="Neutral");out.set(k,a);
 }
 const values=[...out.values()],idNames=new Map();
 for(const x of values){const a=idNames.get(x.stadiumId)||new Set();a.add(x.stadiumName);idNames.set(x.stadiumId,a);}
 const rows=values.map(x=>{const matches=reviewed.filter(r=>r.stadiumId===x.stadiumId&&r.stadiumName===x.stadiumName&&r.verified===true&&Number.isFinite(r.lat)&&Number.isFinite(r.lon));
 return {...x,roofValues:[...x.roofValues],exactRegistryMatch:matches.length===1,stadiumIdNameConflict:idNames.get(x.stadiumId).size!==1,forecastEligible:matches.length===1&&matches[0].nwsGeographicCoverage!==false&&idNames.get(x.stadiumId).size===1&&x.roofValues.has("outdoors")};});
 return {kind:"nfl_weather_venue_coverage_audit_v1",scheduleVenuePairs:rows.length,reviewedPairs:rows.filter(x=>x.exactRegistryMatch).length,conflictingPairs:rows.filter(x=>x.stadiumIdNameConflict).length,forecastEligiblePairs:rows.filter(x=>x.forecastEligible).length,rows,modelPromoted:false};
}
if(require.main===module){const r=audit(dataset(2026,"schedule"),registry.venues);const f="outputs/nfl/research/weather-venue-audit-latest.json";fs.mkdirSync("outputs/nfl/research",{recursive:true});fs.writeFileSync(f,JSON.stringify(r,null,2)+"\n");console.log(JSON.stringify({scheduleVenuePairs:r.scheduleVenuePairs,reviewedPairs:r.reviewedPairs,conflictingPairs:r.conflictingPairs,forecastEligiblePairs:r.forecastEligiblePairs}));}
module.exports={audit};
