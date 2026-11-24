"use strict";
// Matched archived research offers, not authenticated in-app availability.
// Odds provider names lack shared ID: name/team/game/line matching stays
// explicitly conditional and is never presented as verified identity.
const {study}=require("./bounded-sportsbook-consensus.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const NHL="ANA:Anaheim Ducks|BOS:Boston Bruins|BUF:Buffalo Sabres|CGY:Calgary Flames|CAR:Carolina Hurricanes|CHI:Chicago Blackhawks|COL:Colorado Avalanche|CBJ:Columbus Blue Jackets|DAL:Dallas Stars|DET:Detroit Red Wings|EDM:Edmonton Oilers|FLA:Florida Panthers|LAK:Los Angeles Kings|MIN:Minnesota Wild|MTL:Montreal Canadiens|NSH:Nashville Predators|NJD:New Jersey Devils|NYI:New York Islanders|NYR:New York Rangers|OTT:Ottawa Senators|PHI:Philadelphia Flyers|PIT:Pittsburgh Penguins|SEA:Seattle Kraken|SJS:San Jose Sharks|STL:St Louis Blues|TBL:Tampa Bay Lightning|TOR:Toronto Maple Leafs|UTA:Utah Mammoth|VAN:Vancouver Canucks|VGK:Vegas Golden Knights|WSH:Washington Capitals|WPG:Winnipeg Jets";
const NFL="ARI:Arizona Cardinals|ATL:Atlanta Falcons|BAL:Baltimore Ravens|BUF:Buffalo Bills|CAR:Carolina Panthers|CHI:Chicago Bears|CIN:Cincinnati Bengals|CLE:Cleveland Browns|DAL:Dallas Cowboys|DEN:Denver Broncos|DET:Detroit Lions|GB:Green Bay Packers|HOU:Houston Texans|IND:Indianapolis Colts|JAX:Jacksonville Jaguars|KC:Kansas City Chiefs|LV:Las Vegas Raiders|LAC:Los Angeles Chargers|LAR:Los Angeles Rams|MIA:Miami Dolphins|MIN:Minnesota Vikings|NE:New England Patriots|NO:New Orleans Saints|NYG:New York Giants|NYJ:New York Jets|PHI:Philadelphia Eagles|PIT:Pittsburgh Steelers|SEA:Seattle Seahawks|SF:San Francisco 49ers|TB:Tampa Bay Buccaneers|TEN:Tennessee Titans|WAS:Washington Commanders";
const teams=Object.fromEntries([["NHL",NHL],["NFL",NFL]].map(([s,v])=>[s,Object.fromEntries(v.split("|").map(x=>x.split(":")))]));
function club(s,t){t=String(t||"").toUpperCase();t=(s==="NHL"?{SJ:"SJS",LA:"LAK",NJ:"NJD",TB:"TBL"}:{JAC:"JAX",WSH:"WAS",LA:"LAR"} )[t]||t;return norm(teams[s]?.[t]);}
const pair=(a,b)=>[a,b].sort().join("|");
// Prefer the exact original source name retained beside its provider IDs;
// never infer a first name from an initial or a sportsbook quote.
function exactSourceName(p){
 const model=norm(p?.player),source=norm(p?.sourcePlayerName),a=model.split(" "),b=source.split(" ");
 if(!p?.providerPlayerId||!p?.projectionId||a.length<2||b.length<2||b[0].length<2)return model;
 if(model===source||(a[0].length===1&&a[0]===b[0][0]&&a.slice(1).join(" ")===b.slice(1).join(" ")))return source;
 return model;
}
// Preserve the native book start. A time offset above five minutes may be
// accepted only through the original, contemporaneous and uniquely identified
// official NHL event crosswalk saved with the quotes.
function sameEvent(p,q,archive){
 const sport=p.sport||"NHL",start=p.gameStart||p.gameStartAt||p.eventStartsAt;
 if(pair(club(sport,p.team),club(sport,p.opponent))!==pair(norm(q.homeTeam),norm(q.awayTeam)))return false;
 if(Math.abs(dt(start)-dt(q.commenceTime))<=300000)return true;
 if(sport!=="NHL"||!Number.isInteger(p.gameId))return false;
 const matches=(archive?.eventCrosswalk||[]).filter(x=>x.sport==="NHL"&&x.eventId===q.eventId);
 if(matches.length!==1)return false;
 const x=matches[0],a=dt(archive.generatedAt),o=dt(x.officialObservedAt),official=dt(x.officialStartTimeUTC);
 return x.method==="official_schedule_bridge"&&x.officialScheduleFresh===true&&x.officialGameId===p.gameId&&x.homeTeam===q.homeTeam&&x.awayTeam===q.awayTeam&&x.commenceTime===q.commenceTime&&x.boardGame&&o<=a&&a-o<=1800000&&a<official&&Math.abs(dt(x.boardStart)-official)<=300000&&Math.abs(dt(start)-official)<=300000&&Math.abs(dt(q.commenceTime)-official)<=1800000;
}
function candidateRows(sport,frames){
 const rows=[];
 for(const f of frames||[]){
  const d=f.snapshot,at=dt(f.firstCommittedAt),built=dt(d?.generatedAt);
  if(f.gitHistoryCount!==1||!Number.isFinite(at)||!Number.isFinite(built)||at<Math.floor(built/1000)*1000||at-built>=900000)continue;
  if(sport==="NHL"&&d.source!=="partner-api.prizepicks.com"||sport==="NFL"&&d.kind!=="nfl_independent_scoped_original_probability_research_v1")continue;
  for(const p of sport==="NHL"?d.rankedProps||[]:d.rows||[]){
   const pid=sport==="NHL"?p.playerId:p.historicalPlayerId,side=p.lean||p.side,gameStart=p.gameStartAt||p.eventStartsAt;
   if(pid==null||p.gameId==null||typeof p.player!=="string"||norm(p.player).split(" ").length<2||!club(sport,p.team)||!club(sport,p.opponent)||p.team===p.opponent||!Number.isFinite(p.line)||!Number.isFinite(dt(p.capturedAt))||dt(p.capturedAt)>at||dt(gameStart)-at<900000||!["Higher","Lower"].includes(side)||!["Standard","Goblin","Demon"].includes(p.tier))continue;
   if(p.period&&!["Full game","Full","full_game","game"].includes(p.period))continue;
   rows.push({sport,player:p.player,sourceName:sport==="NHL"?exactSourceName(p):norm(p.player),playerId:pid,gameId:p.gameId,team:p.team,opponent:p.opponent,market:p.market,line:p.line,tier:p.tier,side,gameStart,capturedAt:p.capturedAt,committedAt:f.firstCommittedAt,modelProbability:p.probabilities?.[side.toLowerCase()]??null});
  }
 }
 return rows;
}
function compare(archive,frames){
 const at=archive?.generatedAt,native=study(archive,{now:at}),src=[...candidateRows("NHL",frames.NHL),...candidateRows("NFL",frames.NFL)],matches=[];let ambiguous=0;
 for(const q of native.groups){
  const rows=src.filter(p=>p.sport===q.sport&&p.sourceName===norm(q.player)&&p.market===q.market&&p.line===q.line&&sameEvent(p,q,archive)&&dt(p.committedAt)<=dt(at)&&dt(at)-dt(p.capturedAt)<=8*3600000);
  if(new Set(rows.map(p=>JSON.stringify([p.playerId,p.gameId]))).size>1){ambiguous++;continue;}
  const latest=new Map();for(const p of rows){const k=p.tier+"|"+p.side;if(!latest.has(k)||dt(p.committedAt)>dt(latest.get(k).committedAt))latest.set(k,p);}
  for(const p of latest.values())matches.push({...p,bookCount:q.books,sportsbookHigher:q.higher,sportsbookLower:q.lower,observedAt:at,ageMinutes:(dt(at)-dt(p.capturedAt))/60000,comparisonClass:dt(at)-dt(p.capturedAt)<=1800000?"within_30_minutes":"later_benchmark_not_original_quote",sharedProviderIdVerified:false});
 }
 return {kind:"private_archived_prop_benchmark_v1",archiveAt:at??null,nativeGroups:native.groups.length,matchedRows:matches.length,within30Minutes:matches.filter(x=>x.comparisonClass==="within_30_minutes").length,ambiguous,bySport:Object.fromEntries(["NHL","NFL"].map(s=>[s,matches.filter(x=>x.sport===s).length])),matches,verifiedCrossPlatformIds:false,liveAvailabilityVerified:false,calibrated:false,modelPromoted:false};
}
// A quote captured AND originally committed before prediction; a conditional
// name/team crosswalk remains a diagnostic, never an authenticated shared ID.
function beforeFreeze(p,archives,asOf){
 const t=dt(asOf),sport=p.sport||"NHL",start=p.gameStartAt||p.eventStartsAt;
 if(!["NHL","NFL"].includes(sport)||!Number.isFinite(t)||!p.player||!(sport==="NHL"?Number.isInteger(p.playerId)&&Number.isInteger(p.gameId):typeof p.historicalPlayerId==="string"&&!!p.sourceGameId)||!club(sport,p.team)||!club(sport,p.opponent)||!Number.isFinite(p.line)||!(t<dt(start)))return null;
 const candidates=[];
 for(const a of archives||[]){
  const at=dt(a.archive?.generatedAt),commit=dt(a.firstCommittedAt);
  if(a.gitHistoryCount!==1||!(Math.floor(at/1000)*1000<=commit&&commit<=t&&at<=t&&t-at<=1800000))continue;
  const groups=study(a.archive,{now:asOf}).groups.filter(q=>q.sport===sport&&q.market===p.market&&q.line===p.line&&q.period==="full_game"&&norm(q.player)===(sport==="NHL"?exactSourceName(p):norm(p.player))&&sameEvent(p,q,a.archive));
  if(groups.length===1)candidates.push({q:groups[0],at:a.archive.generatedAt,commit:a.firstCommittedAt});
 }
 candidates.sort((a,b)=>dt(b.at)-dt(a.at));
 if(!candidates.length||candidates.length>1&&candidates[0].at===candidates[1].at)return null;
 const x=candidates[0];
 return {source:x.q.source,higher:x.q.higher,lower:x.q.lower,bookCount:x.q.books,quoteAt:x.at,firstCommittedAt:x.commit,conditionalIdentityOnly:true,sharedProviderIdVerified:false,benchmarkOnly:true};
}
module.exports={candidateRows,compare,beforeFreeze,exactSourceName,sameEvent,club};
