"use strict";
// Rank actual positional totals conceded per completed team game, not averages
// of selected fantasy players. Team totals must reconcile before any zeros or
// rank are admitted. Source is retrospective nflverse, not independent odds.
const {SPECS}=require("../scripts/backtest-nfl-historical-stats.cjs");
const POS=["QB","RB","FB","WR","TE"],num=Number.isFinite,key=(...x)=>JSON.stringify(x);
// Current nflverse uses passing_interceptions; older archives used interceptions.
function stat(r,f){
 const keys=f==="interceptions"?["passing_interceptions","interceptions"]:[f];
 const values=keys.filter(k=>num(r[k])).map(k=>r[k]);
 return values.length&&values.every(v=>v===values[0])?values[0]:null;
}
const total=(a,f)=>a.reduce((s,x)=>s+stat(x,f),0);
const other=new Set(["OL","OT","OG","C","T","G","LS","K","P","DL","DE","DT","NT","LB","ILB","OLB","MLB","DB","CB","S","FS","SS","EDGE","SAF","DEF"]);
function group(rows,fn){const m=new Map();for(const r of rows||[]){const k=fn(r),a=m.get(k)||[];a.push(r);m.set(k,a);}return m;}
const one=a=>a?.length===1?a[0]:null;
function rankings(weekly,schedule,teamWeekly,season,week){
 const games=group(schedule.filter(g=>Number(g.season)===season&&Number(g.week)<week&&g.game_type==="REG"&&g.game_id&&num(g.home_score)&&num(g.away_score)),g=>g.game_id);
 const teams=new Set(),expected=new Map(),byClub=new Map(),rejections={},byWeek={};
 const reject=(reason,m)=>{rejections[reason]=(rejections[reason]||0)+1;if(m){const w=byWeek[m.g.week]??={};w[reason]=(w[reason]||0)+1;}};
 for(const g of schedule.filter(g=>Number(g.season)===season&&g.game_type==="REG")){if(g.home_team)teams.add(g.home_team);if(g.away_team)teams.add(g.away_team);}
 const prior=[...games.values()].map(one).filter(Boolean);
 const matches=group(prior.flatMap(g=>[{g,team:g.home_team,opp:g.away_team},{g,team:g.away_team,opp:g.home_team}]),x=>key(season,Number(x.g.week),x.team));
 const players=group(weekly.filter(x=>Number(x.season)===season&&Number(x.week)<week&&(!x.season_type||x.season_type==="REG")),x=>key(season,Number(x.week),x.recent_team||x.team));
 const teamStats=group(teamWeekly.filter(x=>Number(x.season)===season&&Number(x.week)<week&&(!x.season_type||x.season_type==="REG")),x=>key(season,Number(x.week),x.team||x.recent_team));
 for(const group of matches.values())for(const x of group)expected.set(x.opp,(expected.get(x.opp)||0)+1);
 for(const [k,list] of matches){
  const m=one(list),t=one(teamStats.get(k)),a=players.get(k)||[];
  if(!m){reject("ambiguous_schedule");continue;}
  if(!t){reject("missing_or_duplicate_team_week",m);continue;}
  if(t.opponent_team!==m.opp){reject("team_opponent_mismatch",m);continue;}
  if(!a.length){reject("missing_player_week",m);continue;}
  // A row with an explicitly zero contribution to this specific market
  // cannot alter its positional total. Nonzero ambiguous identity stays blocked.
  // Never reassign a trick-play or defensive player's stats to an offensive role.
  for(const spec of SPECS.filter(s=>s.family!=="kicking")){
   const fields=spec.keys||[spec.key];
   if(!fields.every(f=>num(stat(t,f)))){reject(spec.id+":missing_team_field",m);continue;}
   if(!fields.every(f=>a.every(x=>num(stat(x,f))))){reject(spec.id+":missing_player_field",m);continue;}
   const contributing=a.filter(x=>fields.some(f=>stat(x,f)!==0));
   const identityCounts=group(a.filter(x=>x.player_id),x=>x.player_id);
   if(contributing.some(x=>!x.player_id||identityCounts.get(x.player_id)?.length!==1||x.opponent_team&&x.opponent_team!==m.opp)){reject(spec.id+":nonzero_identity_or_opponent_conflict",m);continue;}
   if(!fields.every(f=>total(a,f)===stat(t,f))){reject(spec.id+":team_total_mismatch",m);continue;}
   if(contributing.some(x=>!POS.includes(x.position)&&!other.has(x.position))){reject(spec.id+":unknown_position_nonzero",m);continue;}
   if(contributing.some(x=>other.has(x.position)))reject(spec.id+":reconciled_other_position_contribution",m);
   reject(spec.id+":reconciled",m);
   for(const position of POS){
    const subset=contributing.filter(x=>x.position===position),value=fields.reduce((s,f)=>s+total(subset,f),0);
    const z=key(spec.id,position,m.opp),v=byClub.get(z)||[];v.push(value);byClub.set(z,v);
   }
  }
 }
 const tables={};
 for(const spec of SPECS.filter(s=>s.family!=="kicking"))for(const position of POS){
  const rows=[...teams].sort().map(team=>{const a=byClub.get(key(spec.id,position,team))||[];return {team,games:a.length,expectedGames:expected.get(team)||0,allowedPerGame:a.length?a.reduce((s,v)=>s+v,0)/a.length:null};});
  const complete=teams.size===32&&[...games.values()].every(x=>x.length===1)&&rows.every(r=>r.games>=5&&r.games===r.expectedGames&&num(r.allowedPerGame));
  tables[spec.id+"|"+position]={complete,qualifiedTeams:rows.filter(r=>r.games>=5&&r.games===r.expectedGames).length,rows:rows.map(r=>({...r,rankMostAllowed:complete?1+rows.filter(x=>x.allowedPerGame>r.allowedPerGame).length:null}))};
 }
 return {kind:"nfl_reconciled_position_rankings_v1",season,week,rankDirection:"1_most_allowed",scope:"position total per opponent game, complete prior-week schedule and player-to-team stat reconciliation",tables,diagnostics:{expectedTeamGames:[...expected.values()].reduce((a,b)=>a+b,0),rejections,byWeek},calibrated:false,modelPromoted:false};
}
module.exports={rankings,POS,stat};
