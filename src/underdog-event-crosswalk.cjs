"use strict";
// Independent event crosswalk research. Missing source IDs are never fabricated.
// A schedule match does not authenticate a player, source event ID or platform offer.
const dt=x=>typeof x==="string"&&/(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const codes={NHL:"ANA BOS BUF CGY CAR CHI COL CBJ DAL DET EDM FLA LAK MIN MTL NSH NJD NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WSH WPG",NFL:"ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS"};
const aliases={NHL:{SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD",VEG:"VGK",UTAH:"UTA"},NFL:{JAC:"JAX",WSH:"WAS"}};
function club(s,x){if(typeof x!=="string")return null;const v=x.trim().toUpperCase(),k=aliases[s]?.[v]||v;return codes[s]?.split(" ").includes(k)?k:null;}
const eastern=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function nflClock(t){const z=Object.fromEntries(eastern.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return {date:z.year+"-"+z.month+"-"+z.day,clock:z.hour+":"+z.minute};}
function eventCrosswalk(row,league,now,schedule){
 const fail=reason=>({matched:false,reason});
 if(!["NHL","NFL"].includes(league)||row?.league!==league||row?.is_demo!==false||row.source==="demo")return fail("source_provenance");
 const team=club(league,row.player?.team),opp=club(league,row.event?.opponent),start=dt(row.event?.starts_at),at=dt(now),observed=dt(row.observed_at);
 if(!team||!opp||team===opp)return fail("missing_or_invalid_team_pair");
 if(!Number.isFinite(start))return fail("missing_event_start");
 if(!Number.isFinite(at)||!Number.isFinite(observed)||observed>at||at-observed>1800000)return fail("missing_or_stale_observation");
 if(start<=at)return fail("event_already_started");
 if(!Array.isArray(schedule?.games)||schedule.complete!==true||schedule.league!==league||!Number.isFinite(dt(schedule.observedAt))||dt(schedule.observedAt)>at)return fail("schedule_archive_unverified");
 const clock=league==="NFL"?nflClock(start):null;
 const games=schedule.games.filter(g=>{
  const home=club(league,league==="NHL"?g.home:g.home_team),away=club(league,league==="NHL"?g.away:g.away_team);
  if(!home||!away||home===away||![home,away].includes(team)||![home,away].includes(opp))return false;
  if(league==="NHL")return Number.isInteger(g.id)&&!g.finalized&&!["OFF","FINAL","LIVE","CRIT"].includes(g.gameState)&&Math.abs(dt(g.startTimeUTC)-start)<=300000&&dt(g.startTimeUTC)>at;
  return typeof g.game_id==="string"&&g.game_id&&g.game_type==="REG"&&g.home_score==null&&g.away_score==null&&g.gameday===clock.date&&typeof g.gametime==="string"&&g.gametime.slice(0,5)===clock.clock;
 });
 if(games.length!==1)return fail(games.length?"ambiguous_scheduled_game":"no_exact_scheduled_game");
 const g=games[0],sourceId=typeof row.event?.id==="string"&&row.event.id.trim()?row.event.id:null;
 return {matched:true,scheduleGameId:league==="NHL"?g.id:g.game_id,providerEventId:sourceId,providerEventIdVerified:false,playerIdentityVerified:false,platformAvailabilityVerified:false,scheduleAgeMinutes:Math.floor((at-dt(schedule.observedAt))/60000),researchOnly:true};
}
function summarizeCrosswalk(doc,league,now,schedule){
 const reasons={};let matched=0,missingProviderIdMatched=0;
 for(const row of doc?.data||[]){const v=eventCrosswalk(row,league,now,schedule);if(v.matched){matched++;if(v.providerEventId===null)missingProviderIdMatched++;}else reasons[v.reason]=(reasons[v.reason]||0)+1;}
 return {scheduleMatchedRows:matched,missingProviderIdScheduleMatchedRows:missingProviderIdMatched,rejectionCounts:reasons,providerEventIdsVerified:false,playerIdentitiesVerified:false,completeBoardVerified:false,productionEligible:false,rawRowsPublished:0};
}
module.exports={eventCrosswalk,summarizeCrosswalk};
