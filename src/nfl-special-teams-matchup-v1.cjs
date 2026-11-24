"use strict";
const weightHoldout=require("./matchup-market-weight-holdout-v1.cjs");
// Historical specialist opportunity context. Only reconciled team totals
// support quantitative shadows; observed drives are not complete drive charts.
const {windows}=require("./prop-matchup-evidence-v1.cjs");
const num=Number.isFinite,key=(...x)=>JSON.stringify(x),sum=(a,f)=>a.reduce((s,x)=>s+x[f],0),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const MARKETS=["fg_made","fg_attempts","pat_made","kicking_points","punt_attempts","punt_gross_yards","punt_inside_20","punt_50_plus","punting_touchbacks","punting_average"];
function group(rows,fn){const m=new Map();for(const x of rows||[]){const k=fn(x),a=m.get(k)||[];a.push(x);m.set(k,a);}return m;}
const one=a=>a?.length===1?a[0]:null;
const count=x=>Number.isInteger(x)&&x>=0;
function exactCount(r,fields){const v=fields.filter(f=>count(r?.[f])).map(f=>r[f]);return v.length&&v.every(x=>x===v[0])?v[0]:null;}
// Drive metadata in the newer nflverse archive must agree within each
// source drive and include both exact boundary plays. No inferred ending.
function driveDiagnostics(events){
 const offensive=events.filter(x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type));
 if(!offensive.length)return "no_offensive_plays";
 if(offensive.some(x=>!Number.isInteger(x.fixed_drive)||!x.fixed_drive_result))return "missing_drive_identity_or_outcome";
 const groups=group(events.filter(x=>Number.isInteger(x.fixed_drive)),x=>x.fixed_drive);
 for(const rows of groups.values()){
  const off=rows.filter(x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type));if(!off.length)continue;
  const u=f=>[...new Set(off.map(x=>x[f]))],start=u("drive_play_id_started"),end=u("drive_play_id_ended"),result=u("fixed_drive_result"),inside=u("drive_inside20");
  if([start,end,result,inside].some(x=>x.length!==1))return "conflicting_drive_metadata";
  if(!Number.isInteger(start[0])||!Number.isInteger(end[0])||start[0]>end[0]||typeof result[0]!=="string"||![0,1].includes(inside[0]))return "invalid_drive_metadata";
  if(!rows.some(x=>x.play_id===start[0])||!rows.some(x=>x.play_id===end[0]))return "boundary_absent_from_filtered_archive";
 }
 return "verified";
}
function verifiedDriveSubset(events){
 const offensive=events.filter(x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type));
 if(!offensive.length||offensive.some(x=>!Number.isInteger(x.fixed_drive)||!x.fixed_drive_result))return null;
 const groups=group(events.filter(x=>Number.isInteger(x.fixed_drive)),x=>x.fixed_drive);
 const drives=[];
 for(const rows of groups.values()){
  const offense=rows.filter(x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type));
  if(!offense.length)continue;
  const unique=f=>[...new Set(offense.map(x=>x[f]))];
  const start=unique("drive_play_id_started"),end=unique("drive_play_id_ended"),result=unique("fixed_drive_result"),inside=unique("drive_inside20");
  if([start,end,result,inside].some(x=>x.length!==1)||!Number.isInteger(start[0])||!Number.isInteger(end[0])||start[0]>end[0]||!rows.some(x=>x.play_id===start[0])||!rows.some(x=>x.play_id===end[0])||typeof result[0]!=="string"||![0,1].includes(inside[0]))return null;
  drives.push({result:result[0],redZone:inside[0]===1});
 }
 if(!drives.length)return null;
 return {verifiedObservedDrives:drives.length,verifiedObservedRedZoneDrives:drives.filter(x=>x.redZone).length,verifiedObservedRedZoneTouchdowns:drives.filter(x=>x.redZone&&x.result.toLowerCase()==="touchdown").length,verifiedObservedPuntDrives:drives.filter(x=>x.result.toLowerCase()==="punt").length,verifiedObservedFieldGoalDrives:drives.filter(x=>x.result.toLowerCase()==="field goal").length,completeDriveChartVerified:false};
}
// Full source boundary evidence must agree with the filtered archive's
// original event identities and with a single known offensive club.
function verifyFullBoundarySubset(filtered,full,team,opp){
 if(!Array.isArray(full)||!full.length||new Set(full.map(x=>x.play_id)).size!==full.length||filtered.some(x=>!full.some(y=>y.play_id===x.play_id)))return null;
 const offensive=x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type);
 const known=full.filter(x=>offensive(x)&&x.posteam===team&&x.defteam===opp);
 if(!known.length||known.some(x=>!Number.isInteger(x.fixed_drive)))return null;
 const groups=group(full.filter(x=>Number.isInteger(x.fixed_drive)),x=>x.fixed_drive);
 const ids=new Set(known.map(x=>x.fixed_drive)),selected=[];
 for(const id of ids){
  const rows=groups.get(id);
  if(!rows||rows.some(x=>offensive(x)&&x.posteam&&x.posteam!==team))return null;
  // Include neutral boundary rows only within a drive already assigned by
  // exact offensive club identity, never infer missing outcome or team.
  selected.push(...rows.filter(x=>!offensive(x)||x.posteam===team&&x.defteam===opp));
 }
 const v=verifiedDriveSubset(selected);
 return v?{...v,fullSourceBoundaryVerified:true,completeDriveChartVerified:false}:null;
}
// Explain the full-source gate at individual-drive level, independently of
// the filtered-archive reason. Diagnostics cannot change the verified count.
function fullBoundaryDiagnostics(filtered,full,team,opp){
 if(!full.length)return {reason:"full_source_missing",drives:[]};
 if(new Set(full.map(x=>x.play_id)).size!==full.length)return {reason:"duplicate_full_play_ids",drives:[]};
 const ids=new Set(full.map(x=>x.play_id)),missing=filtered.filter(x=>!ids.has(x.play_id)).map(x=>x.play_id);
 if(missing.length)return {reason:"filtered_play_absent_from_full_source",missingPlayIds:missing,drives:[]};
 const offensive=x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type);
 const known=full.filter(x=>offensive(x)&&x.posteam===team&&x.defteam===opp);
 if(!known.length)return {reason:"no_exact_offensive_team_plays",drives:[]};
 if(known.some(x=>!Number.isInteger(x.fixed_drive)))return {reason:"missing_fixed_drive",playIds:known.filter(x=>!Number.isInteger(x.fixed_drive)).map(x=>x.play_id),drives:[]};
 const groups=group(full.filter(x=>Number.isInteger(x.fixed_drive)),x=>x.fixed_drive),drives=[];
 for(const id of new Set(known.map(x=>x.fixed_drive))){
  const rows=groups.get(id)||[],off=rows.filter(x=>offensive(x)&&x.posteam===team&&x.defteam===opp);
  const values=k=>[...new Set(off.map(x=>x[k]??null))],start=values("drive_play_id_started"),end=values("drive_play_id_ended"),outcome=values("fixed_drive_result"),inside=values("drive_inside20");
  const reason=rows.some(x=>offensive(x)&&x.posteam&&x.posteam!==team)?"mixed_offensive_ownership":driveDiagnostics(rows.filter(x=>!offensive(x)||x.posteam===team&&x.defteam===opp));
  if(reason!=="verified")drives.push({id,reason,start,end,outcome,inside,startPresentInGame:start.length===1&&ids.has(start[0]),endPresentInGame:end.length===1&&ids.has(end[0]),playCount:rows.length});
 }
 return {reason:drives.length?"individual_drive_exceptions":"verified_or_other_gate",drives};
}
function build({schedule,events,teamWeekly,kickers=[],rosters=[],snaps=[],boundaryEvents=[]}){
 const finals=group(schedule.filter(g=>g.game_type==="REG"&&g.game_id&&num(g.home_score)&&num(g.away_score)),g=>g.game_id);
 const fullPlays=group(boundaryEvents,x=>x.game_id),plays=group(events,x=>x.game_id),stats=group(teamWeekly,x=>key(Number(x.season),Number(x.week),x.team||x.recent_team));
 const roster=group(rosters.filter(x=>x.position==="P"),x=>key(Number(x.season),Number(x.week),x.team,x.pfr_id||x.pfr_player_id));
 const snap=group(snaps.filter(x=>x.position==="P"&&num(x.st_snaps)&&x.st_snaps>0),x=>key(x.game_id,x.team));
 const teamRows=[],puntRows=[],driveExceptions=[];
 for(const list of finals.values()){
  const g=one(list);if(!g)continue;
  const e=plays.get(g.game_id)||[];if(!e.length||e.some(x=>!x.play_id)||new Set(e.map(x=>x.play_id)).size!==e.length||e.some(x=>Number(x.season)!==Number(g.season)||Number(x.week)!==Number(g.week)))continue;
  for(const [team,opp] of [[g.home_team,g.away_team],[g.away_team,g.home_team]]){
   const t=one(stats.get(key(Number(g.season),Number(g.week),team)));
   if(!t||t.opponent_team!==opp)continue;
   const a=e.filter(x=>x.posteam===team&&x.defteam===opp),off=a.filter(x=>["pass","run","qb_spike","qb_kneel"].includes(x.play_type));
   const allPunts=a.filter(x=>x.punt_attempt===1),punts=allPunts.filter(x=>x.punt_blocked===0),fg=a.filter(x=>x.field_goal_attempt===1),pat=a.filter(x=>x.extra_point_attempt===1);
   // nflverse pt_att excludes blocked punts (pt_blocked is separate).
   const pd=exactCount(t,["pt_att","punt_attempts","punts"]),fd=exactCount(t,["fg_att"]),xd=exactCount(t,["pat_att"]);
   const puntVerified=pd!==null&&pd===punts.length&&allPunts.every(x=>[0,1].includes(x.punt_blocked)&&x.punter_player_id)&&(!count(t.pt_blocked)||t.pt_blocked===allPunts.length-punts.length);
   const kickVerified=fd!==null&&xd!==null&&fd===fg.length&&xd===pat.length&&fg.every(x=>["made","missed","blocked"].includes(x.field_goal_result)&&x.kicker_player_id)&&pat.every(x=>["good","failed","blocked","missed"].includes(x.extra_point_result)&&x.kicker_player_id);
   const driveRows=a.filter(x=>["pass","run","qb_spike","qb_kneel","punt","field_goal"].includes(x.play_type)&&x.drive!=null),drives=new Set(driveRows.map(x=>x.drive)),red=new Set(driveRows.filter(x=>num(x.yardline_100)&&x.yardline_100<=20).map(x=>x.drive));
   const third=off.filter(x=>x.down===3),fourth=off.filter(x=>x.down===4);
   // Only a complete separately supplied drive summary can establish true
   // possessions. The historical filtered play archive excludes some endings.
   const redTd=new Set(driveRows.filter(x=>x.touchdown===1&&(x.pass_touchdown===1||x.rush_touchdown===1)&&red.has(x.drive)).map(x=>x.drive));
   const archivedDrives=verifiedDriveSubset(a),full=fullPlays.get(g.game_id)||[];
   const fullDrives=full.every(x=>Number(x.season)===Number(g.season)&&Number(x.week)===Number(g.week))?verifyFullBoundarySubset(e,full,team,opp):null;
   const verifiedDrives=fullDrives||archivedDrives;
   if(!verifiedDrives)driveExceptions.push({gameId:g.game_id,team,opponent:opp,filteredReason:driveDiagnostics(a),full:fullBoundaryDiagnostics(e,full,team,opp)});
   const row={driveDiagnostic:verifiedDrives?"verified":driveDiagnostics(a),verifiedDriveSubset:verifiedDrives,gameId:g.game_id,year:Number(g.season),week:Number(g.week),team,opponent:opp,
    observedDrives:drives.size||null,observedRedZoneDrives:drives.size?red.size:null,observedRedZoneTouchdownDrives:drives.size?redTd.size:null,
    thirdDownPlays:third.length,thirdDownConversions:third.every(x=>[0,1].includes(x.third_down_converted))?sum(third,"third_down_converted"):null,
    fourthDownOffensivePlays:fourth.length,completeDriveChartVerified:false,
    punts:puntVerified?punts.length:null,fgAttempts:kickVerified?fg.length:null,patAttempts:kickVerified?pat.length:null,
    teamPoints:team===g.home_team?g.home_score:g.away_score,wind:num(g.wind)?g.wind:null,
    historicalWeatherOnly:true};
   teamRows.push(row);
   // Snap/roster crosswalk allows real zero-punt appearances, but only with
   // reconciled team totals and exactly one positively participating punter.
   const s=one(snap.get(key(g.game_id,team)));
   const r=s&&one(roster.get(key(row.year,row.week,team,s.pfr_player_id||s.pfr_id)));
   const id=r&&(r.gsis_id||r.player_id);
   if(!puntVerified||!id||Number(s.season)!==row.year||Number(s.week)!==row.week||allPunts.some(p=>p.punter_player_id!==id))continue;
   const measures={punt_attempts:punts.length};
   if(punts.every(x=>count(x.punt_yards))&&(!count(t.pt_yards)||t.pt_yards===sum(punts,"punt_yards"))){measures.punt_gross_yards=sum(punts,"punt_yards");measures.punt_50_plus=punts.filter(x=>x.punt_yards>=50).length;if(punts.length)measures.punting_average=measures.punt_gross_yards/punts.length;}
   for(const [m,f] of [["punt_inside_20","punt_inside_twenty"],["punting_touchbacks","punt_touchback"]])if(punts.every(x=>[0,1].includes(x[f])))measures[m]=sum(punts,f);
   puntRows.push({...row,playerId:id,measures,zeroAttempt:punts.length===0});
  }
 }
 const teamIndex=group(teamRows,x=>key(x.gameId,x.team));
 const kickRows=kickers.flatMap(x=>{const t=one(teamIndex.get(key(x.gameId,x.team)));return t&&t.fgAttempts!==null?[{...t,playerId:x.playerId,measures:x.measures,zeroAttempt:x.zeroAttempt}]:[];});
 return {teamRows,driveExceptions,playerRows:[...kickRows,...puntRows],coverage:{teamGames:teamRows.length,verifiedDriveMetadataTeamGames:teamRows.filter(x=>x.verifiedDriveSubset).length,fullSourceBoundaryTeamGames:teamRows.filter(x=>x.verifiedDriveSubset?.fullSourceBoundaryVerified).length,driveMetadataDiagnostics:Object.fromEntries([...group(teamRows,x=>x.driveDiagnostic)].map(([k,v])=>[k,v.length])),reconciledPuntTeamGames:teamRows.filter(x=>x.punts!==null).length,reconciledKickTeamGames:teamRows.filter(x=>x.fgAttempts!==null).length,punterAppearances:puntRows.length,kickerAppearances:kickRows.length},researchOnly:true};
}
function context(data,{playerId,team,opponent,season,week,market,line,weather=null,asOf=null,eventStartsAt=null}){
 const weatherValid=weather?.venueVerified===true&&weather?.isForecast===true&&weather?.eventStartsAt===eventStartsAt&&weather?.team===team&&weather?.opponent===opponent&&Number.isFinite(Date.parse(asOf))&&Number.isFinite(Date.parse(eventStartsAt))&&Date.parse(asOf)<Date.parse(eventStartsAt)-900000&&Number.isFinite(Date.parse(weather.issuedAt))&&Number.isFinite(Date.parse(weather.observedAt))&&Date.parse(weather.issuedAt)<=Date.parse(weather.observedAt)&&Date.parse(weather.observedAt)<=Date.parse(asOf)&&Date.parse(asOf)-Date.parse(weather.observedAt)<=24*3600000&&num(weather.windSpeedKmh)&&weather.windSpeedKmh>=0&&((num(weather.precipitationMm)&&weather.precipitationMm>=0)||(weather.precipitationMm===null&&num(weather.precipitationProbabilityPct)&&weather.precipitationProbabilityPct>=0&&weather.precipitationProbabilityPct<=100));
 const prior=x=>x.year<season||x.year===season&&x.week<week;
 const own=data.playerRows.filter(x=>prior(x)&&x.playerId===playerId&&x.team===team&&num(x.measures?.[market])).sort((a,b)=>a.year-b.year||a.week-b.week);
 const current=data.teamRows.filter(x=>prior(x)&&x.year===season);
 const summarize=a=>({games:a.length,verifiedDriveMetadataGames:a.filter(x=>x.verifiedDriveSubset).length,verifiedObservedRedZoneTouchdownRate:(()=>{const v=a.filter(x=>x.verifiedDriveSubset).map(x=>x.verifiedDriveSubset);const d=sum(v,"verifiedObservedRedZoneDrives");return d>0?sum(v,"verifiedObservedRedZoneTouchdowns")/d:null;})(),observedDrives:mean(a.map(x=>x.observedDrives).filter(num)),observedRedZoneDrives:mean(a.map(x=>x.observedRedZoneDrives).filter(num)),observedRedZoneTouchdownDrives:mean(a.map(x=>x.observedRedZoneTouchdownDrives).filter(num)),thirdDownConversions:mean(a.map(x=>x.thirdDownConversions).filter(num)),fourthDownOffensivePlays:mean(a.map(x=>x.fourthDownOffensivePlays).filter(num)),punts:mean(a.map(x=>x.punts).filter(num)),fgAttempts:mean(a.map(x=>x.fgAttempts).filter(num)),patAttempts:mean(a.map(x=>x.patAttempts).filter(num)),teamPoints:mean(a.map(x=>x.teamPoints).filter(num))});
 const off=current.filter(x=>x.team===team),def=current.filter(x=>x.opponent===opponent),h2h=own.filter(x=>x.opponent===opponent);
 const field=market.startsWith("punt")?"punts":market==="pat_made"?"patAttempts":"fgAttempts";
 const values=own.map(x=>x.measures[market]),base=mean(values.slice(-10));
 const o=off.filter(x=>num(x[field])),d=def.filter(x=>num(x[field])),l=current.filter(x=>num(x[field]));
 let shadow=null;
 const lg=mean(l.map(x=>x[field]));
 if(own.length>=8&&o.length>=5&&d.length>=5&&l.length>=64&&lg>0&&market!=="punting_average"){
  const factor=Math.max(.8,Math.min(1.2,1+.25*(mean(o.map(x=>x[field]))/lg-1)+.25*(mean(d.map(x=>x[field]))/lg-1)));
  shadow={projection:base*factor,factor,researchOnly:true,calibrated:false};
 }
 const driveRate=(a)=>{const rows=a.filter(x=>x.verifiedDriveSubset&&num(x[field]));const drives=rows.reduce((s,x)=>s+x.verifiedDriveSubset.verifiedObservedDrives,0);return rows.length>=5&&drives>0?{games:rows.length,observedDrivesPerGame:drives/rows.length,attemptsPerObservedDrive:rows.reduce((s,x)=>s+x[field],0)/drives}:null;};
 const ownDrive=driveRate(off),oppDrive=driveRate(def);
 const observedDriveOpportunityShadow=ownDrive&&oppDrive?{observedDrives:.5*(ownDrive.observedDrivesPerGame+oppDrive.observedDrivesPerGame),attemptRate:.5*(ownDrive.attemptsPerObservedDrive+oppDrive.attemptsPerObservedDrive),scope:"observed verified drive subset only; not a complete possession projection",calibrated:false}:null;
 if(observedDriveOpportunityShadow)observedDriveOpportunityShadow.teamAttemptScenario=observedDriveOpportunityShadow.observedDrives*observedDriveOpportunityShadow.attemptRate;
 return {status:own.length>=5?"reconciled_prior_appearance_context":"insufficient_reconciled_specialist_appearances",playerForm:windows(values,line),headToHead:windows(h2h.map(x=>x.measures[market]),line),teamOffense:summarize(off),opponentDefense:summarize(def),observedDriveOpportunityShadow,shadow,completeDriveChartVerified:false,liveWeatherVerified:weatherValid,weatherContext:weatherValid?{windSpeedKmh:weather.windSpeedKmh,precipitationMm:weather.precipitationMm,precipitationProbabilityPct:weather.precipitationProbabilityPct??null,observedAt:weather.observedAt,forecastOnly:true,weatherEffectFitted:false}:null,activeStatusVerified:false,calibrated:false,modelPromoted:false};
}
function study(data){
 const rows=[...data.playerRows].sort((a,b)=>a.year-b.year||a.week-b.week);
 const report={};
 for(const market of MARKETS){
  const weights=weightHoldout.create();
  let n=0,baseAbs=0,shadowAbs=0;const games=new Set();
  for(const r of rows){
   if(r.year<2025||!num(r.measures?.[market]))continue;
   const c=context(data,{playerId:r.playerId,team:r.team,opponent:r.opponent,season:r.year,week:r.week,market,line:0});
   if(!c.shadow)continue;
   const base=mean(c.playerForm.all.values.slice(-10)),actual=r.measures[market];
   if(!num(base))continue;
   weightHoldout.observe(weights,{base,position:c.shadow.projection,combined:c.shadow.projection,actual,gameId:r.gameId,train:r.year<2026});
   n++;games.add(r.gameId);baseAbs+=Math.abs(base-actual);shadowAbs+=Math.abs(c.shadow.projection-actual);
  }
  report[market]={learnedMatchupHoldout:weightHoldout.summarize(weights),paired:n,distinctGames:games.size,baselineMAE:n?baseAbs/n:null,matchupMAE:n?shadowAbs/n:null};
 }
 return {kind:"nfl_specialist_paired_prior_week_replay_v1",byMarket:report,retrospective:true,actualOffersUsed:false,modelPromoted:false,calibrated:false};
}
module.exports={MARKETS,build,context,study,verifiedDriveSubset,driveDiagnostics,verifyFullBoundarySubset,fullBoundaryDiagnostics};
