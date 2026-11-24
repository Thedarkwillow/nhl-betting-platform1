"use strict";
// NHL.com editorial projections; never treat as confirmed club lineup or PP units.
const {canonicalTeam,parseNhlRosters,identifyPlayer}=require("./nhl-pregame-intel.cjs");
const URL="https://www.nhl.com/news/";
const NAMES={ANA:"ducks",BOS:"bruins",BUF:"sabres",CGY:"flames",CAR:"hurricanes",CHI:"blackhawks",COL:"avalanche",CBJ:"blue jackets",DAL:"stars",DET:"red wings",EDM:"oilers",FLA:"panthers",LAK:"kings",MIN:"wild",MTL:"canadiens",NSH:"predators",NJD:"devils",NYI:"islanders",NYR:"rangers",OTT:"senators",PHI:"flyers",PIT:"penguins",SJS:"sharks",SEA:"kraken",STL:"blues",TBL:"lightning",TOR:"maple leafs",UTA:"mammoth",VAN:"canucks",VGK:"golden knights",WSH:"capitals",WPG:"jets"};
const MONTHS=["january","february","march","april","may","june","july","august","september","october","november","december"];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function slugDate(d){const [y,m,dd]=String(d).split("-");return MONTHS[Number(m)-1]+"-"+Number(dd)+"-"+y;}
function decode(s){return s.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|quot|apos|rsquo|lsquo|ndash|mdash);/gi,(_,k)=>{
 const a={nbsp:" ",amp:"&",quot:'"',apos:"'",rsquo:"’",lsquo:"‘",ndash:"–",mdash:"—"};
 if(k[0]==="#"){const n=k[1].toLowerCase()==="x"?parseInt(k.slice(2),16):Number(k.slice(1));return n>=0&&n<=0x10ffff?String.fromCodePoint(n):"";}
 return a[k.toLowerCase()]||"";
 });}
const clean=s=>decode(s.replace(/<[^>]*>/g,"")).replace(/\s+/g," ").trim();
function paragraphs(html){
 if(typeof html!=="string"||html.length>8000000)throw Error("Invalid article size");
 const stripped=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
 return [...stripped.matchAll(/<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].flatMap(m=>m[2].split(/<br\s*\/?>/gi).map(clean)).filter(Boolean);
}
function articleLinks(html,game){
 const date=slugDate(game.gameDate),names=[NAMES[canonicalTeam(game.away)],NAMES[canonicalTeam(game.home)]].map(x=>x?.replace(/ /g,"-"));
 if(names.some(x=>!x))return [];
 const found=new Set();
 for(const m of html.matchAll(/href=["']([^"']+)["']/gi)){
  let u;try{u=new globalThis.URL(decode(m[1]),URL);}catch{continue;}
  if(u.origin!=="https://www.nhl.com"||!u.pathname.startsWith("/news/")||!u.pathname.endsWith("-"+date)||!u.pathname.includes("game-preview"))continue;
  // Team identities are validated again from article blocks, so an index typo
  // cannot attach a game to another pair. No arbitrary external links fetched.
  if(names.every(n=>u.pathname.includes(n)))found.add(u.origin+u.pathname);
 }
 return [...found].sort();
}
function parseGame(html,game,rosters,at,url){
 const start=Date.parse(game.startTimeUTC),now=Date.parse(at);
 if(!Number.isFinite(now)||!Number.isFinite(start)||now>=start||!url.startsWith(URL)||!url.endsWith("-"+slugDate(game.gameDate)))throw Error("Invalid pregame article identity");
 const blocks=paragraphs(html),roster=parseNhlRosters(rosters),teams=[canonicalTeam(game.away),canonicalTeam(game.home)],out=[];
 for(const team of teams){
  const heading=NAMES[team]+" projected lineup";
  const indexes=blocks.flatMap((line,i)=>line.toLowerCase()===heading?[i]:[]);
  if(indexes.length!==1)throw Error("Missing unique team projection heading");
  const body=[];
  for(let i=indexes[0]+1;i<blocks.length;i++){
   if(/projected lineup$|^status report/i.test(blocks[i]))break;
   body.push(blocks[i]);if(body.length>=50)break;
  }
  const players=[],goalies=[],availability=[],seen=new Set();let f=0,d=0,unmatched=0,extra=0,section="";
  const resolve=name=>identifyPlayer(team,name,roster);
  for(const line of body){
   if(/^(scratched|injured):/i.test(line)){
    section=line.match(/^(scratched|injured)/i)[1].toLowerCase();
    for(const label of line.replace(/^[^:]+:/,"").split(/,(?![^()]*\))/)){
     const name=label.replace(/\s*\([^)]*\)\s*/g," ").trim();
     const p=resolve(name);if(p)availability.push({playerId:p.playerId,team,status:section==="injured"?"listed_injured":"listed_scratched",projectedOnly:true});
    }continue;
   }
   if(section)continue;
   const names=line.split(/\s*(?:--+|[–—])\s*/).map(x=>x.trim());
   if(names.length!==2&&names.length!==3&&names.length!==1)continue;
   if(names.length===1){
    const p=resolve(names[0]);
    if(p?.type==="goalie"&&!goalies.some(x=>x.playerId===p.playerId))goalies.push({playerId:p.playerId,team,listingOrder:goalies.length+1,status:"listed_projected_goalie",starterConfirmed:false});
    else if(p?.type==="skater")extra++;
    continue;
   }
   const category=names.length===3?"f":"d",group=category+(category==="f"?++f:++d);
   if(f>4||d>3)throw Error("Unexpected line group count");
   const matches=names.map(resolve);
   if(matches.some(p=>!p||p.type!=="skater")){unmatched+=names.length;continue;}
   if(matches.some(p=>seen.has(p.playerId)))throw Error("Duplicate projected player");
   for(const p of matches){seen.add(p.playerId);players.push({playerId:p.playerId,team,evenStrengthGroup:group,powerPlayGroup:null,projectedOnly:true});}
  }
  if(f!==4||d!==3||players.length<12)throw Error("Incomplete roster-matched forward and defense projection");
  const flagged=new Set(availability.map(x=>x.playerId));
  out.push({team,players:players.filter(p=>!flagged.has(p.playerId)),goalies:goalies.filter(p=>!flagged.has(p.playerId)),availability,unmatched,extra,conflictingAvailability:players.filter(p=>flagged.has(p.playerId)).length,confirmed:false});
 }
 return {gameId:game.id,eventStartsAt:game.startTimeUTC,home:teams[1],away:teams[0],source:"NHL.com editorial game preview",sourceURL:url,sourceCapturedAt:at,sourcePublicationTimeVerified:false,teams:out,officialClubLineupConfirmed:false};
}
function sourceHealth(future,gameData,lineups,official,errors){
 return {expectedFutureGames:future.length,dfoGoalieGames:gameData.length,dfoLineTeams:Object.keys(lineups).length,
  nhlEditorialGames:official.length,dfoStatus:errors.some(e=>e.provider.startsWith("Daily Faceoff")&&/HTTP 403/.test(e.reason))?"access_denied_partial_or_unavailable":gameData.length||Object.keys(lineups).length?"observed_partial_or_complete":"unavailable",
  combinedCoverageComplete:false,modelPromoted:false};
}
module.exports={articleLinks,parseGame,paragraphs,sourceHealth,slugDate};
