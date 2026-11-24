"use strict";
const {projectPlayer}=require("./projections.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const TEAM={
 "new jersey devils":"NJD","seattle kraken":"SEA","new york rangers":"NYR","ottawa senators":"OTT",
 "boston bruins":"BOS","toronto maple leafs":"TOR","vegas golden knights":"VGK",
 "florida panthers":"FLA","edmonton oilers":"EDM","calgary flames":"CGY",
 "montreal canadiens":"MTL","vancouver canucks":"VAN","san jose sharks":"SJS",
 "los angeles kings":"LAK","chicago blackhawks":"CHI","colorado avalanche":"COL",
 "tampa bay lightning":"TBL","detroit red wings":"DET","winnipeg jets":"WPG",
 "carolina hurricanes":"CAR","buffalo sabres":"BUF","minnesota wild":"MIN",
 "pittsburgh penguins":"PIT","washington capitals":"WSH","philadelphia flyers":"PHI",
 "dallas stars":"DAL","st louis blues":"STL","st. louis blues":"STL",
 "nashville predators":"NSH","anaheim ducks":"ANA","utah mammoth":"UTA",
 "columbus blue jackets":"CBJ","new york islanders":"NYI"
};
const norm=x=>String(x??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();
function parsePlayers(payload){
 const source=Array.isArray(payload)?payload:Array.isArray(payload?.players)?payload.players:
  payload?.data&&Array.isArray(payload.data)?payload.data:null;
 const out=new Map(),issues=[];
 function add(id,name){
  const key=String(id??""),value=String(name??"").trim();
  if(!/^\d+$/.test(key)||value.length<4||!/[a-z]/i.test(value)){issues.push("invalid_player_record");return;}
  const existing=out.get(key);
  if(existing&&norm(existing)!==norm(value)){issues.push("conflicting_player_name_"+key);out.delete(key);return;}
  out.set(key,value);
 }
 if(payload?.participants&&typeof payload.participants==="object"){
  for(const participant of Object.values(payload.participants)){
   const container=participant?.players;
   if(Array.isArray(container)){
    for(const p of container)if(p&&typeof p==="object")
     add(p.playerId??p.id??p.player_id,p.playerName??p.name??p.player_name??p.fullName);
   }else if(container&&typeof container==="object"){
    for(const [id,p] of Object.entries(container)){
     if(typeof p==="string")add(id,p);
     else if(p&&typeof p==="object")
      add(p.playerId??p.id??id,p.playerName??p.name??p.player_name??p.fullName??p.full_name);
    }
   }
  }
 }else if(source){
  for(const p of source)if(p&&typeof p==="object"){
   const id=p.playerId??p.player_id??p.id;
   const name=p.playerName??p.player_name??p.name??p.fullName??p.full_name;
   add(id,name);
  }
 }else if(payload&&typeof payload==="object"){
  for(const [id,p] of Object.entries(payload.players&&typeof payload.players==="object"?payload.players:payload)){
   if(p&&typeof p==="object")add(id,p.playerName??p.player_name??p.name??p.fullName);
   else if(typeof p==="string")add(id,p);
  }
 }
 return {names:Object.fromEntries(out),issues,shape:source?"array":"map"};
}
function playerAlias(name){
 const raw=String(name??"");
 if(raw.includes(",")){
  const [last,...first]=raw.split(",");
  return norm(first.join(" ")+" "+last);
 }
 return norm(raw);
}
function namesAgree(a,b){
 const x=playerAlias(a),y=playerAlias(b);
 if(x===y)return true;
 const xa=x.split(" "),ya=y.split(" ");
 return xa.length>=2&&ya.length>=2&&
   xa.at(-1)===ya.at(-1)&&xa[0][0]===ya[0][0];
}
function marketField(name){
 const s=norm(name);
 if(/third period|second period|first period|p1|p2|p3/.test(s))return null;
 if(/player shots on goal/.test(s))return "shotsOnGoal";
 if(/player assists/.test(s))return "assists";
 if(/player goals/.test(s))return "goals";
 if(/player points/.test(s))return "points";
 if(/player blocks/.test(s))return "blockedShots";
 if(/player saves/.test(s))return "saves";
 return null;
}
function mapTeams(names){
 const c=names.map(n=>TEAM[norm(n)]??null);
 return c.length===2&&c.every(Boolean)&&c[0]!==c[1]?c:null;
}
function findOfficialGame(fixture,games){
 const teams=mapTeams(fixture.teams||[]),at=Date.parse(fixture.eventStartsAt);
 if(!teams||!Number.isFinite(at))return null;
 const eligible=games.filter(g=>{
  if(!Number.isInteger(g.id)||!Number.isFinite(Date.parse(g.startTimeUTC))||
     Math.abs(Date.parse(g.startTimeUTC)-at)>300000)return false;
  return teams.includes(g.away)&&teams.includes(g.home);
 });
 return eligible.length===1?eligible[0]:null;
}
function auditHistoricalArchive(archive,playerNames,history,games){
 if(!Array.isArray(archive?.samples)||!history?.players||!Array.isArray(games))throw Error("Missing archive or NHL history");
 const issues={},rows=[],acceptedIds=new Set(),seen=new Set();
 const inc=why=>(issues[why]=(issues[why]||0)+1);
 // Each historical row is a *line observation*, not a pregame bet or model prediction.
 for(const fixture of archive.samples){
  if(!fixture.rows?.length)continue;
  const game=findOfficialGame(fixture,games);
  const activeLines=new Map();
  for(const item of fixture.rows){
   if(!item.activeAtLastObservation||!marketField(item.stat))continue;
   const group=[item.playerId,marketField(item.stat)].join("|");
   activeLines.set(group,(activeLines.get(group)||0)+1);
  }
  for(const row of fixture.rows){
   if(!game){inc("unmatched_official_game");continue;}
   if(!row.sourceIsPrizePicks||row.tier!=="unverified"||!Number.isFinite(row.line)){inc("invalid_or_tier_assumed");continue;}
   if(!row.activeAtLastObservation||!Number.isFinite(Date.parse(row.lastObservedAt))||
      Date.parse(row.lastObservedAt)>=Date.parse(game.startTimeUTC)){inc("not_active_at_last_pregame_observation");continue;}
   const field=marketField(row.stat);
   if(!field){inc("unsupported_or_partial_period");continue;}
   if((activeLines.get([row.playerId,field].join("|"))||0)>1){inc("ambiguous_simultaneous_line_variants");continue;}
   const name=playerNames[String(row.playerId)];
   if(!name){inc("unresolved_provider_player_id");continue;}
   const matches=Object.values(history.players).filter(p=>{
    if(!namesAgree(p.name,name))return false;
    return (p.games||[]).some(g=>String(g.gameId)===String(game.id)&&
       ((g.team===game.away)||(g.team===game.home)));
   });
   if(matches.length!==1){inc(matches.length?"ambiguous_nhl_player":"player_not_verified_in_official_game");continue;}
   const p=matches[0],played=p.games.find(g=>String(g.gameId)===String(game.id));
   if(!Number.isFinite(played[field])){inc("official_stat_missing");continue;}
   const recordKey=[game.id,p.playerId,field].join("|");
   // A player can have multiple PrizePicks line variants, including unknown tiers.
   // Exclude all of them rather than selecting the post-hoc best-performing variant.
   if(seen.has(recordKey)){inc("duplicate_or_alternative_line");continue;}
   seen.add(recordKey);
   const prior=(p.games||[]).filter(g=>g.gameDate<played.gameDate).sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
   const model=prior.length>=5?projectPlayer({...p,games:prior}).projections?.[field]:null;
   const prob=model?.ready?estimateCountProbabilities(model.estimate,row.line):null;
   const outcome=played[field]>row.line?"Higher":played[field]<row.line?"Lower":"Push";
   const entry={season:fixture.season,source:"OddsPapi archived PrizePicks",fixtureId:fixture.fixtureId,
    gameId:game.id,gameStartAt:game.startTimeUTC,playerId:p.playerId,playerName:p.name,
    providerPlayerId:row.playerId,team:played.team,market:field,line:row.line,
    sourceFirstObservedAt:row.firstObservedAt,sourceLastObservedAt:row.lastObservedAt,
    actual:played[field],outcome,officialResultVerified:true,providerPlayerIdentityVerified:true,
    playerPriorGames:prior.length,modelProjection:model?.estimate??null,
    modelHigher:prob?.higher??null,modelLower:prob?.lower??null,
    modelChosenSide:null,verifiedProspectivePrediction:false,tier:"unverified",
    expectedValue:null};
   rows.push(entry);acceptedIds.add(String(row.playerId));
  }
 }
 const bySeason={};
 for(const season of ["2025-26","2026-27"]){
  const segment=rows.filter(x=>x.season===season);
  bySeason[season]={matchedLines:segment.length,distinctGames:new Set(segment.map(x=>x.gameId)).size,
   over:segment.filter(x=>x.outcome==="Higher").length,under:segment.filter(x=>x.outcome==="Lower").length,
   push:segment.filter(x=>x.outcome==="Push").length,modelEvaluable:segment.filter(x=>x.modelHigher!==null).length,
   hitRate:null,verifiedModelHitRate:null};
 }
 return {kind:"historical_prizepicks_line_outcome_audit",bySeason,matchedLines:rows.length,
  matchedProviderPlayers:acceptedIds.size,issues,lines:rows,calibrated:false,
  retrospectiveModelHitRate:null,prospectiveVerifiedHitRate:null,
  tierHitRatesUnavailable:true,canEvaluateStandardGoblinDemon:false,
  warning:"Official NHL outcomes of historical PrizePicks line observations, NOT a model-pick hit rate. OddsPapi does not verify Standard/Goblin/Demon tier or selected Higher/Lower side. Historical snapshots collected retrospectively; no past published picks asserted."};
}
module.exports={parsePlayers,marketField,findOfficialGame,auditHistoricalArchive};
