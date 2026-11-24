"use strict";
// Prior-only opportunity decomposition: team target volume * player share *
// yards per target. A reconciled team-game denominator is essential.
const num=Number.isFinite,avg=a=>a.reduce((s,v)=>s+v,0)/a.length,key=(...x)=>JSON.stringify(x);
function teamTargets(weekly,teamWeekly,schedule){
 const games=new Map(),stats=new Map(),players=new Map();
 const add=(m,k,v)=>{const a=m.get(k)||[];a.push(v);m.set(k,a);};
 for(const g of schedule.filter(g=>g.game_type==="REG"&&num(g.home_score)&&num(g.away_score)))for(const [t,o] of [[g.home_team,g.away_team],[g.away_team,g.home_team]])add(games,key(Number(g.season),Number(g.week),t),{gameId:g.game_id,opponent:o});
 for(const r of teamWeekly)add(stats,key(Number(r.season),Number(r.week),r.team||r.recent_team),r);
 for(const r of weekly.filter(r=>!r.season_type||r.season_type==="REG"))add(players,key(Number(r.season),Number(r.week),r.recent_team||r.team),r);
 const result=new Map();
 for(const [k,gs] of games){const a=players.get(k)||[],t=stats.get(k)||[];if(gs.length!==1||t.length!==1||t[0].opponent_team!==gs[0].opponent||!num(t[0].targets)||t[0].targets<=0||!a.length||a.some(x=>!Number.isInteger(x.targets)||x.targets<0)||a.reduce((s,r)=>s+r.targets,0)!==t[0].targets)continue;
 const ids=a.filter(x=>x.targets>0);if(ids.some(x=>!x.player_id||x.opponent_team&&x.opponent_team!==gs[0].opponent)||new Set(ids.map(x=>x.player_id)).size!==ids.length)continue;
 result.set(k,{...gs[0],targets:t[0].targets});}
 return result;
}
function project(prior,teamHistory){
 const a=prior.filter(x=>num(x.opportunity)&&x.opportunity>0&&num(x.value)&&num(x.teamTargets)&&x.teamTargets>=x.opportunity).slice(-20),t=teamHistory.filter(x=>num(x)&&x>0).slice(-10);
 if(a.length<8||t.length<5)return null;
 const recent=a.slice(-5),total=x=>x.reduce((s,r)=>s+r.opportunity,0),den=x=>x.reduce((s,r)=>s+r.teamTargets,0);
 const share=.6*total(recent)/den(recent)+.4*total(a)/den(a);
 const targetVolume=.65*avg(t.slice(-5))+.35*avg(t);
 const rate=a.reduce((s,x)=>s+x.value,0)/total(a);
 return {projection:targetVolume*share*rate,targetVolume,share,rate,priorGames:a.length,teamGames:t.length,liveRoutesVerified:false,conditionalOnObservedOpportunity:true};
}
module.exports={teamTargets,project};
