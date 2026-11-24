"use strict";
const norm=s=>String(s??"").toUpperCase().trim().replace(/\bSJ\b/g,"SJS").replace(/\bTB\b/g,"TBL").replace(/\bNJ\b/g,"NJD").replace(/\bLA\b/g,"LAK");
function identifyGame(prop,games){
 if(!prop||!prop.team||!prop.matchup||!prop.capturedAt)return null;
 const captured=Date.parse(prop.capturedAt);
 if(!Number.isFinite(captured))return null;
 const team=norm(prop.team);
 const matches=games.filter(g=>{
  const start=Date.parse(g.startTimeUTC);
  if(!Number.isInteger(g.id)||!Number.isFinite(start)||captured>=start||start-captured>48*3600000)return false;
  if(team!==norm(g.away)&&team!==norm(g.home))return false;
  const opponent=team===norm(g.away)?norm(g.home):norm(g.away);
  const matchup=norm(prop.matchup);
  return new RegExp("(^|[^A-Z])"+opponent+"([^A-Z]|$)").test(matchup);
 });
 if(matches.length!==1)return null;
 return {gameId:matches[0].id,gameStartAt:matches[0].startTimeUTC};
}
module.exports={identifyGame};
