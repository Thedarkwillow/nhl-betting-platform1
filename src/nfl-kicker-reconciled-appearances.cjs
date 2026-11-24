"use strict";
// Reconciled historical kicker appearances only. Missing identity/events
// never become zero; no claim of independent source or platform settlement.
const {kickingObservations}=require("../scripts/backtest-nfl-historical-stats.cjs");
const num=x=>x===null||x===undefined||x===""?NaN:Number(x);
const txt=x=>typeof x==="string"&&x.trim()?x.trim():null;
const key=(...x)=>JSON.stringify(x);
function reconcile({schedule,rosters,snaps,kicks,teams}){
 const gameMap=new Map(),cross=new Map(),stats=new Map(),events=new Map(),seen=new Set(),rows=[];
 const reject={},skip=k=>reject[k]=(reject[k]||0)+1;
 for(const g of schedule)if(g.game_type==="REG"&&Number.isFinite(num(g.home_score))&&Number.isFinite(num(g.away_score)))gameMap.set(g.game_id,g);
 for(const r of rosters){
  const p=txt(r.pfr_id)||txt(r.pfr_player_id),id=txt(r.gsis_id)||txt(r.player_id);
  if(r.position!=="K"||!p||!id||!txt(r.team)||!Number.isInteger(num(r.week)))continue;
  const k=key(num(r.season),num(r.week),r.team,p);if(!cross.has(k))cross.set(k,new Set());cross.get(k).add(id);
 }
 for(const r of teams){
  const k=key(num(r.season),num(r.week),r.team||r.recent_team);
  if(r.season_type&&r.season_type!=="REG")continue;(stats.get(k)||stats.set(k,[]).get(k)).push(r);
 }
 const obs=kickingObservations(kicks).observations,byAttempt=new Map(obs.map(r=>[key(r.year,r.week,r.identity.slice(7)),r]));
 for(const r of kicks){
  if(num(r.field_goal_attempt)!==1&&num(r.extra_point_attempt)!==1)continue;
  if(!r.game_id||!r.posteam)continue;
  const k=key(r.game_id,r.posteam),t=events.get(k)||{fg:0,pat:0,bad:false,plays:new Set(),ids:new Set()};
  const fg=num(r.field_goal_attempt)===1,pat=num(r.extra_point_attempt)===1,id=txt(r.kicker_player_id);
  if(!id||!r.play_id||t.plays.has(String(r.play_id))||fg===pat||
    fg&&!["made","missed","blocked"].includes(r.field_goal_result)||pat&&!["good","failed","blocked","missed"].includes(r.extra_point_result))t.bad=true;
  t.plays.add(String(r.play_id));t.fg+=Number(fg);t.pat+=Number(pat);if(id)t.ids.add(id);events.set(k,t);
 }
 for(const r of snaps){
  if(r.position!=="K"||!(num(r.st_snaps)>0))continue;
  const g=gameMap.get(r.game_id),year=num(r.season),week=num(r.week),pfr=txt(r.pfr_player_id)||txt(r.pfr_id);
  const ids=cross.get(key(year,week,r.team,pfr));
  if(!g||num(g.season)!==year||num(g.week)!==week||![g.home_team,g.away_team].includes(r.team)||ids?.size!==1){skip("unmatched_appearance");continue;}
  const id=[...ids][0],k=key(r.game_id,id);if(seen.has(k)){skip("duplicate_appearance");continue;}seen.add(k);
  const a=stats.get(key(year,week,r.team))||[],s=a[0],t=events.get(key(r.game_id,r.team))||{fg:0,pat:0,bad:false,ids:new Set()};
  const match=[...gameMap.values()].filter(x=>num(x.season)===year&&num(x.week)===week&&[x.home_team,x.away_team].includes(r.team));
  if(match.length!==1||match[0].game_id!==r.game_id||a.length!==1||t.bad||num(s?.fg_att)!==t.fg||num(s?.pat_att)!==t.pat){skip("incomplete_team_attempt_reconciliation");continue;}
  const attempt=byAttempt.get(key(year,week,id));
  if(t.ids.has(id)!==!!attempt){skip("attempt_identity_conflict");continue;}
  rows.push({year,week,gameId:r.game_id,playerId:id,team:r.team,zeroAttempt:!attempt,
   measures:attempt?attempt.measures:{fg_made:0,fg_attempts:0,pat_made:0,kicking_points:0}});
 }
 return {rows,reject,independentOfficialSettlementVerified:false,productionEligible:false};
}
function compare(reconciled){
 const counts={};for(const r of reconciled.rows){
  const x=counts[r.year]??={appearances:0,reconciledZeroAttempts:0};x.appearances++;x.reconciledZeroAttempts+=Number(r.zeroAttempt);
 }
 return {kind:"nfl_kicker_reconciled_appearance_research_v1",bySeason:counts,excluded:reconciled.reject,syntheticWalkForward:require("./nfl-reconciled-kicker-lab.cjs").study(reconciled.rows),
  sourceIndependenceVerified:false,productionEligible:false,zeroImputationFromMissingRows:false};
}
module.exports={reconcile,compare};
