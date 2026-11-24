"use strict";
// Independent Pinnacle archive + ESPN-derived historical boxes, research only.
// Cross-source match is by name, both teams and scheduled clock, never outcome.
const {features,scores}=require("./nba-context-calibration-v2.cjs");
const markets={"Points":"player_points","Rebounds":"player_rebounds","Assists":"player_assists","Pts & Rebs & Asts":"player_points_rebounds_assists","Threes Made":"player_threes"};
const field={player_points:"points",player_rebounds:"rebounds",player_assists:"assists",player_points_rebounds_assists:"pra",player_threes:"threePointersMade"};
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function parseCSV(raw){
 const lines=raw.trimEnd().split(/\r?\n/);
 const parse=l=>{let a=[],s="",q=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===","&&!q){a.push(s);s="";}else s+=c;}if(q)throw Error("unterminated CSV quote");a.push(s);return a;};
 const h=parse(lines.shift());if(new Set(h).size!==h.length)throw Error("duplicate CSV columns");
 return lines.map(l=>{const a=parse(l);if(a.length!==h.length)throw Error("invalid CSV row width");return Object.fromEntries(h.map((k,i)=>[k,a[i]]));});
}
const count=x=>x!==""&&Number.isInteger(+x)&&+x>=0?+x:null;
function boxes(csv,season){
 const raw=parseCSV(csv),rows=[],seen=new Set(),rejected={dnp:0,invalid:0,otherSeasonType:0};
 for(const p of raw){
  if(+p.season!==season||p.season_type!=="2"){rejected.otherSeasonType++;continue;}
  const id=[p.game_id,p.athlete_id].join("|");
  if(seen.has(id))throw Error("duplicate source player-game");seen.add(id);
  if(p.did_not_play==="true"){rejected.dnp++;continue;}
  const vals=[p.points,p.rebounds,p.assists,p.three_point_field_goals_made,p.field_goals_attempted,p.free_throws_attempted,p.turnovers].map(count);
  if(p.did_not_play!=="false"||!/^\d+$/.test(p.game_id)||!/^\d+$/.test(p.athlete_id)||!/^\d{4}-\d{2}-\d{2}$/.test(p.game_date)||!Number.isFinite(Date.parse(p.game_date_time))||!p.minutes||!(+p.minutes>0&&+p.minutes<=70)||!["true","false"].includes(p.starter)||vals.includes(null)||!p.athlete_display_name||!p.team_display_name||!p.opponent_team_display_name||!["home","away"].includes(p.home_away)){rejected.invalid++;continue;}
  const [points,rebounds,assists,threePointersMade,fga,fta,tov]=vals;
  rows.push({gameId:p.game_id,playerId:p.athlete_id,player:p.athlete_display_name,date:p.game_date,tip:Date.parse(p.game_date_time),team:p.team_display_name,opponent:p.opponent_team_display_name,home:p.home_away==="home",minutes:+p.minutes,points,rebounds,assists,threePointersMade,pra:points+rebounds+assists,usageProxyPerMinute:(fga+.44*fta+tov)/+p.minutes,starter:p.starter==="true",position:p.athlete_position_abbreviation});
 }
 return {rawRows:raw.length,rows,rejected,games:new Set(rows.map(x=>x.gameId)).size};
}
function group(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;}
function evaluate(archive,prior,current){
 const raw=parseCSV(archive);if(raw.length!==2278||raw.some(r=>r.league!=="NBA"))throw Error("unexpected NBA archive coverage");
 const ids=new Set(),dup=group(raw,r=>[r.game_id,norm(r.player),r.stat].join("|"));
 const logs=group([...prior.rows,...current.rows],r=>r.playerId),names=group(current.rows,r=>norm(r.player));
 const rows=[],excluded={duplicateMarket:0,invalidLineOrClock:0,unmatched:0,actualMismatch:0,insufficientHistory:0},matched=[];
 for(const r of raw){
  if(ids.has(r.prop_id))throw Error("duplicate archive prop ID");ids.add(r.prop_id);
  if(dup.get([r.game_id,norm(r.player),r.stat].join("|")).length!==1){excluded.duplicateMarket++;continue;}
  const market=markets[r.stat],k=field[market],start=Date.parse(r.start_time_utc),close=Date.parse(r.closed_at),open=Date.parse(r.opened_at),line=+r.close_line,actual=count(r.actual),o=+r.close_over,u=+r.close_under;
  if(!k||!Number.isFinite(start)||!Number.isFinite(close)||!Number.isFinite(open)||close>=start||open>close||!r.close_line||line<0||line%1!==.5||actual===null||!(o>1&&u>1)||r.result!==(actual>line?"over":"under")){excluded.invalidLineOrClock++;continue;}
  const a=(names.get(norm(r.player))||[]).filter(t=>Math.abs(t.tip-start)<=30*60000&&norm(t.home?t.team:t.opponent)===norm(r.home_team)&&norm(t.home?t.opponent:t.team)===norm(r.away_team));
  if(a.length!==1){excluded.unmatched++;continue;}
  const t=a[0];if(t[k]!==actual){excluded.actualMismatch++;continue;}
  matched.push({market,gameId:t.gameId,date:t.date});
  // Prior regular-season games can span seasons, but never target date or future.
  // Older-season pace/defense and injury features are not inferred.
  const f=features(logs.get(t.playerId)||[],t,line,market,[]);if(!f){excluded.insufficientHistory++;continue;}
  rows.push({id:r.prop_id,gameId:t.gameId,playerId:t.playerId,date:t.date,market,y:Number(actual>line),marketP:(1/o)/(1/o+1/u),...f});
 }
 const out={};for(const market of Object.values(markets)){
  const a=rows.filter(r=>r.market===market),variants={};
  for(const k of ["old","original","minutesP","roleP","usageP"]){const b=a.filter(r=>Number.isFinite(r[k]));const d=b.filter(r=>r[k]!==.5);variants[k]={candidate:scores(b,k),baseline:scores(b,"old"),market:scores(b,"marketP"),directionalRows:d.length,wins:d.filter(r=>Number(r[k]>.5)===r.y).length,higherWins:b.filter(r=>r.y===1).length,lowerWins:b.filter(r=>r.y===0).length};}
  out[market]={matchedRows:matched.filter(r=>r.market===market).length,evaluatedRows:a.length,variants};
 }
 return {kind:"nba_independent_pinnacle_espn_replay_v1",rawRows:raw.length,matchedRows:matched.length,evaluatedRows:rows.length,evaluatedGames:new Set(rows.map(r=>r.gameId)).size,evaluatedDates:new Set(rows.map(r=>r.date)).size,excluded,markets:out,boxSources:{prior:{rawRows:prior.rawRows,playedRows:prior.rows.length,games:prior.games,rejected:prior.rejected},current:{rawRows:current.rawRows,playedRows:current.rows.length,games:current.games,rejected:current.rejected}},retrospectiveOnly:true,sourceRightsReviewed:false,officialSettlementVerified:false,freezeApproved:false,prospectiveApproval:false};
}
module.exports={parseCSV,boxes,evaluate};
