"use strict";
// Historical kickoff context: season/week strictly earlier than each held-out game.
// Actual game weather and realized drive opportunities never enter its forecast.
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length,finite=x=>typeof x==="number"&&Number.isFinite(x),clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const key=(...a)=>JSON.stringify(a);
function study(appearances,schedule,kicks){
 const events=new Map();
 for(const p of kicks||[]){
  if(p.field_goal_attempt!==1||!p.game_id||!p.kicker_player_id||!p.play_id)continue;
  const k=key(p.game_id,p.kicker_player_id),a=events.get(k)||[];a.push(p);events.set(k,a);
 }
 const games=new Map(),ids=new Map(),teamGames=new Map();
 for(const g of schedule||[]){if(g.game_id){const a=games.get(g.game_id)||[];a.push(g);games.set(g.game_id,a);}}
 for(const r of appearances||[]){const k=key(r.playerId,r.year,r.week),a=ids.get(k)||[];a.push(r);ids.set(k,a);}
 const rows=[...ids.values()].filter(a=>a.length===1).map(a=>a[0]).filter(r=>games.get(r.gameId)?.length===1&&finite(r.measures?.fg_made)&&finite(r.measures?.fg_attempts)&&finite(r.measures?.kicking_points)).sort((a,b)=>a.year-b.year||a.week-b.week);
 let n=0,baseline=0,context=0,distN=0,windN=0;const heldout=new Set(),priorByKicker=new Map(),weeks=new Map();
 for(const r of rows){let k=key(r.year,r.week);let w=weeks.get(k)||[];w.push(r);weeks.set(k,w);}
 for(const week of weeks.values()){
  for(const r of week){
   const g=games.get(r.gameId)[0],prior=(priorByKicker.get(r.playerId)||[]).slice(-20),history=(teamGames.get(r.team)||[]).slice(-10);
   if(r.year<2025||prior.length<8||history.length<5)continue;
   const priorTeam=history.filter(x=>finite(x.teamScore)),earlierDistance=prior.flatMap(x=>x.distances);
   if(priorTeam.length<5)continue;
   const base=avg(prior.map(x=>x.points)),teamPoints=avg(priorTeam.map(x=>x.teamScore));
   const typical=avg(prior.map(x=>x.teamScore));if(!Number.isFinite(typical)||typical<=0)continue;
   const factor=clamp(teamPoints/typical,.8,1.2);
   const adjusted=base*(.7+.3*factor);
   n++;baseline+=Math.abs(base-r.measures.kicking_points);context+=Math.abs(adjusted-r.measures.kicking_points);heldout.add(r.gameId);
   distN+=Number(earlierDistance.length>=8);
   windN+=Number(prior.filter(x=>finite(x.wind)).length>=5);
  }
  const seenTeam=new Set();
  for(const r of week){
   const g=games.get(r.gameId)[0],score=r.team===g.home_team?g.home_score:r.team===g.away_team?g.away_score:null;
   if(!finite(score))continue;
   const ev=events.get(key(r.gameId,r.playerId))||[],distances=ev.length===r.measures.fg_attempts&&new Set(ev.map(e=>e.play_id)).size===ev.length&&ev.every(e=>finite(e.kick_distance)&&e.kick_distance>0)?ev.map(e=>e.kick_distance):[];
   const record={points:r.measures.kicking_points,teamScore:score,distances,wind:finite(g.wind)?g.wind:null};
   const a=priorByKicker.get(r.playerId)||[];a.push(record);priorByKicker.set(r.playerId,a);
   const tk=key(r.gameId,r.team);if(!seenTeam.has(tk)){seenTeam.add(tk);const t=teamGames.get(r.team)||[];t.push(record);teamGames.set(r.team,t);}
  }
 }
 return {kind:"nfl_kicker_prior_team_opportunity_research_v1",evaluatedAppearances:n,distinctGames:heldout.size,baselineMae:n?baseline/n:null,opportunityContextMae:n?context/n:null,priorKickDistanceCoverage:distN,priorRecordedWindCoverage:windN,actualGameWeatherUsed:false,distanceAndWeatherEffectsFitted:false,conditionalOnAppearance:true,calibrated:false,modelPromoted:false};
}
module.exports={study};
