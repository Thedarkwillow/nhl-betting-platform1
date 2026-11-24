"use strict";
// Explicit public allowlist: ONLY official NHL final-stat aggregates for
// already-approved display cards. No provider payload, internal IDs,
// weights, predicted probabilities, injury feed or third-party lineups.
const {adapt,opponentPositionTable}=require("./nhl-player-context-evidence.cjs"),{canonical}=require("./nhl-opponent-context.cjs"),{pacificDay}=require("./nhl-standard-forward-diagnostics.cjs"),{scheduleIndex}=require("./nhl-fixed-ensemble-research.cjs");
const dt=Date.parse,finite=Number.isFinite,markets=new Set(["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","powerPlayPoints"]),k=p=>JSON.stringify([p.player,p.team,p.market,p.eventStartsAt,p.capturedAt,p.line,p.tier,p.lean]);
const round=x=>finite(x)?Math.round(x*1000)/1000:null;
function safeWindow(w){return {games:w.games,appearances:w.appearances,perAppearance:round(w.allowedPerAppearance),per60:round(w.allowedPer60),rank:w.rank,per60Rank:w.per60Rank};}
function historyWindow(rows,line){const values=rows.map(x=>x.value).filter(finite),n=values.length;return {games:n,average:n?round(values.reduce((s,x)=>s+x,0)/n):null,above:values.filter(x=>x>line).length,below:values.filter(x=>x<line).length,push:values.filter(x=>x===line).length};}
function build(d,internal,history,schedule,at,special=null){
 const result={kind:"public_nhl_official_matchup_aggregates_v1",generatedAt:at,rows:[],source:"Official NHL completed-game statistics",historicalOnly:true,forecastApproved:false};
 if(d?.researchFreshAtBuild!==true||schedule?.complete!==true||!Array.isArray(d.props)||!Array.isArray(internal?.props))return result;
 const contexts=new Map(),seen=new Set(),idx=scheduleIndex(schedule);
 for(const p of d.props){const id=k(p);if(seen.has(id)||!finite(p.line)||!["Higher","Lower"].includes(p.lean)||!markets.has(p.market)||!finite(dt(p.capturedAt))||!(dt(p.capturedAt)<=dt(at)&&dt(at)-dt(p.capturedAt)<=1800000&&dt(p.eventStartsAt)>dt(at)))continue;seen.add(id);
  const matches=internal.props.filter(x=>k(x)===id);const ids=new Set(matches.map(x=>x.playerId));if(ids.size!==1||!Number.isInteger(Number(matches[0].playerId)))continue;
  const team=canonical(p.team),g=[...idx.values()].filter(x=>Math.abs(dt(x.startTimeUTC)-dt(p.eventStartsAt))<=300000&&[canonical(x.home),canonical(x.away)].includes(team));if(g.length!==1)continue;
  const opp=canonical(g[0].home)===team?canonical(g[0].away):canonical(g[0].home),cutoff=pacificDay(p.capturedAt);
  if(!contexts.has(cutoff)){const a=adapt(history,schedule,cutoff);contexts.set(cutoff,{...a,tables:new Map()});}const c=contexts.get(cutoff);if(c.leagueTeams.length!==32)continue;
  const allPlayer=c.rows.filter(x=>x.playerId===Number(matches[0].playerId)&&x.team===team&&x.market===p.market).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-200),player=allPlayer.slice(-5),position=player.at(-1)?.position;if(!["C","LW","RW","D"].includes(position)||player.filter(x=>x.position===position).length<4)continue;
  const tk=p.market+"|"+position;
  if(!c.tables.has(tk)){const a=c.rows.filter(x=>x.market===p.market),scope={sport:"NHL",market:p.market,period:"full_game",beforeDate:cutoff,season:schedule.season,position,leagueTeams:c.leagueTeams};c.tables.set(tk,{def:opponentPositionTable(a,scope),off:opponentPositionTable(a.map(r=>({...r,team:r.opponent,opponent:r.team})),scope)});}
  const {def,off}=c.tables.get(tk),defense=def?.teams[opp],offense=off?.teams[team];if(!defense||!offense)continue;
  const windows=["season","last20","last10","last5"];
  const form={season:historyWindow(allPlayer.filter(x=>x.season===schedule.season),p.line),last20:historyWindow(allPlayer.slice(-20),p.line),last10:historyWindow(allPlayer.slice(-10),p.line),last5:historyWindow(player,p.line)};
  const signals=[],defRank=defense.season.rank,offRank=offense.season.rank,form10=form.last10;
  if(Number.isInteger(defRank)&&defRank>=25)signals.push("opponent_high_position_allowance");if(Number.isInteger(defRank)&&defRank<=8)signals.push("opponent_low_position_allowance");if(Number.isInteger(offRank)&&offRank>=25)signals.push("own_high_position_offense");if(Number.isInteger(offRank)&&offRank<=8)signals.push("own_low_position_offense");
  if(form10.games>=8&&(p.lean==="Higher"&&form10.below>form10.above||p.lean==="Lower"&&form10.above>form10.below))signals.push("displayed_side_differs_from_recent_history");
  if(Number.isInteger(defRank)&&Number.isInteger(offRank)&&(p.lean==="Lower"&&defRank>=25&&offRank>=25||p.lean==="Higher"&&defRank<=8&&offRank<=8))signals.push("displayed_side_differs_from_position_context");
  let specialTeams=null;if(special?.kind==="official_nhl_special_teams_snapshot_v1"&&special.fullLeague===true&&dt(special.capturedAt)<=dt(p.capturedAt)&&dt(p.capturedAt)-dt(special.capturedAt)<=86400000){const a=special.teams?.[team]?.powerPlayEfficiency,b=special.teams?.[opp]?.penaltyKillEfficiency;if([a,b].every(x=>finite(x)&&x>=0&&x<=1))specialTeams={ownPowerPlay:a,opponentPenaltyKill:b,capturedAt:special.capturedAt};}
  result.rows.push({player:p.player,team:p.team,market:p.market,line:p.line,tier:p.tier,lean:p.lean,form,signals,specialTeams,eventStartsAt:p.eventStartsAt,capturedAt:p.capturedAt,cutoff,position,opponent:opp,defense:Object.fromEntries(windows.map(w=>[w,safeWindow(defense[w])])),offense:Object.fromEntries(windows.map(w=>[w,safeWindow(offense[w])]))});
 }
 return result;
}
module.exports={build,k,historyWindow};
