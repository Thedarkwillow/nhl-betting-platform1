"use strict";
// NWS hourly forecast, not postgame weather. The caller must supply a
// reviewed exact stadium-id/name coordinate crosswalk and official kickoff.
// No city centroid, guessed roof, stale forecast or invented rainfall amount.
const dt=x=>typeof x==="string"?Date.parse(x):NaN,finite=Number.isFinite;
function parseHourly(p,game,venue,observedAt,issuedAt){
 const start=dt(game.eventStartsAt),now=dt(observedAt),issue=dt(issuedAt);
 if(![start,now,issue].every(finite)||now>=start-900000||issue>now||now-issue>24*3600000||venue?.verified!==true||venue.stadiumId!==game.stadiumId||venue.stadiumName!==game.stadiumName)return null;
 const periods=(p||[]).filter(x=>dt(x.startTime)<=start&&start<dt(x.endTime));if(periods.length!==1)return null;
 const x=periods[0],wind=String(x.windSpeed||"").match(/^(\d+(?:\.\d+)?) mph$/);
 if(!wind)return null;
 const pop=x.probabilityOfPrecipitation?.value;
 return {source:"NOAA/NWS hourly forecast",venueVerified:true,isForecast:true,stadiumId:game.stadiumId,eventStartsAt:game.eventStartsAt,team:game.team,opponent:game.opponent,issuedAt,observedAt,windSpeedKmh:Number(wind[1])*1.609344,precipitationProbabilityPct:finite(pop)&&pop>=0&&pop<=100?pop:null,precipitationMm:null,roofExposure:game.roof==="outdoors"?"outdoor":null,weatherEffectFitted:false,researchOnly:true};
}
async function collect(game,venue,{fetchFn=fetch,clock=()=>new Date().toISOString(),userAgent="NHL-NFL-private-research/1.0 (github.com/Thedarkwillow/nhl-betting-platform)"}={}){
 if(venue?.verified!==true||venue.nwsGeographicCoverage===false||venue.stadiumId!==game.stadiumId||venue.stadiumName!==game.stadiumName||!finite(venue.lat)||!finite(venue.lon)||Math.abs(venue.lat)>90||Math.abs(venue.lon)>180||!(dt(game.eventStartsAt)-dt(clock())>900000))return null;
 const get=async url=>{const u=new URL(url);if(u.protocol!=="https:"||u.hostname!=="api.weather.gov")throw Error("Non-NWS endpoint");const r=await fetchFn(u.href,{headers:{"User-Agent":userAgent,Accept:"application/geo+json"},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error("NWS forecast unavailable");return r.json();};
 const point=await get("https://api.weather.gov/points/"+venue.lat.toFixed(4)+","+venue.lon.toFixed(4));
 const forecast=await get(point.properties.forecastHourly);
 return parseHourly(forecast.properties.periods,game,venue,clock(),forecast.properties.updateTime||forecast.properties.generatedAt);
}
module.exports={collect,parseHourly};
