"use strict";
// Prior-only team opportunity components, not actual offensive snaps. A team
// game is admitted only if player attempts AND carries reconcile exactly.
const num=Number.isFinite,count=x=>Number.isInteger(x)&&x>=0,key=(...x)=>JSON.stringify(x),avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const cap=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),before=(x,y,w)=>x.y<y||x.y===y&&x.w<w;
function teamVolume(weekly,teamWeekly,schedule){
 const games=new Map(),stats=new Map(),players=new Map(),add=(m,k,v)=>{const a=m.get(k)||[];a.push(v);m.set(k,a);};
 const ids=new Map();for(const g of schedule)if(g.game_type==="REG"&&num(g.home_score)&&num(g.away_score)&&g.game_id)ids.set(g.game_id,(ids.get(g.game_id)||0)+1);
 for(const g of schedule.filter(g=>ids.get(g.game_id)===1&&g.game_type==="REG"&&num(g.home_score)&&num(g.away_score)))for(const [t,o] of [[g.home_team,g.away_team],[g.away_team,g.home_team]])add(games,key(Number(g.season),Number(g.week),t),{gameId:g.game_id,opponent:o,y:Number(g.season),w:Number(g.week),team:t});
 for(const r of teamWeekly)add(stats,key(Number(r.season),Number(r.week),r.team||r.recent_team),r);
 for(const r of weekly.filter(r=>!r.season_type||r.season_type==="REG"))add(players,key(Number(r.season),Number(r.week),r.recent_team||r.team),r);
 const rows=[];
 for(const [k,gs] of games){
  const a=players.get(k)||[],t=stats.get(k)||[];if(gs.length!==1||t.length!==1||t[0].opponent_team!==gs[0].opponent||!a.length)continue;
  if(!["attempts","carries"].every(f=>count(t[0][f])&&a.every(x=>count(x[f]))&&a.reduce((s,x)=>s+x[f],0)===t[0][f]))continue;
  const contributing=a.filter(x=>x.attempts+x.carries>0);
  if(contributing.some(x=>!x.player_id||x.opponent_team&&x.opponent_team!==gs[0].opponent)||new Set(contributing.map(x=>x.player_id)).size!==contributing.length)continue;
  const attempts=t[0].attempts,plays=attempts+t[0].carries;if(!attempts||!plays)continue;
  rows.push({...gs[0],attempts,plays,passShare:attempts/plays,targets:count(t[0].targets)?t[0].targets:null});
 }
 return rows.sort((a,b)=>a.y-b.y||a.w-b.w);
}
const recent=a=>.65*avg(a.slice(-5))+.35*avg(a.slice(-10));
function passingAttempts(own,volume,team,opp,y,w){
 const previous=volume.filter(x=>before(x,y,w)),off=previous.filter(x=>x.team===team).slice(-10),def=previous.filter(x=>x.opponent===opp).slice(-10);
 if(off.length<5||def.length<5)return null;
 const byGame=new Map(off.map(x=>[x.gameId,x])),a=own.filter(x=>before(x,y,w)&&byGame.has(x.gameId)&&count(x.value)&&x.value<=byGame.get(x.gameId).attempts).slice(-10);
 if(a.length<5)return null;
 const share=a.reduce((s,x)=>s+x.value,0)/a.reduce((s,x)=>s+byGame.get(x.gameId).attempts,0);
 const expectedPlays=.65*recent(off.map(x=>x.plays))+.35*recent(def.map(x=>x.plays));
 const ownShare=recent(off.map(x=>x.passShare)),allowedShare=recent(def.map(x=>x.passShare));
 const passShare=cap(ownShare+.35*(allowedShare-ownShare)*def.length/(def.length+10),0,1);
 return {projection:expectedPlays*passShare*share,expectedAttemptPlusCarryVolume:expectedPlays,passShare,qbShare:share,priorQBGames:a.length,teamGames:off.length,opponentGames:def.length,liveStartingQBVerified:false,actualSnapPace:false};
}
function receiving(own,targetIndex,history,team,opp,y,w){
 const base=require("./nfl-target-share-workload-v1.cjs").project(own.filter(x=>before(x,y,w)).map(x=>({...x,teamTargets:targetIndex.get(key(x.y,x.w,x.team))?.targets})),[...targetIndex.entries()].filter(([k])=>{const [s,v,t]=JSON.parse(k);return t===team&&(s<y||s===y&&v<w)}).sort(([a],[b])=>{const x=JSON.parse(a),z=JSON.parse(b);return x[0]-z[0]||x[1]-z[1]}).map(([,v])=>v.targets));
 if(!base)return null;
 // Exact position sample is conditional on positive targets, so do not
 // mistake per-appearance average for full-team defense rank.
 const prior=history.filter(x=>before(x,y,w)&&x.y===y&&num(x.opportunity)&&x.opportunity>0&&num(x.value));
 const d=prior.filter(x=>x.opponent===opp),games=new Set(d.map(x=>x.gameId)).size,lgGames=new Set(prior.map(x=>x.gameId)).size;
 if(games<5||lgGames<30)return null;
 const efficiency=a=>a.reduce((s,x)=>s+x.value,0)/a.reduce((s,x)=>s+x.opportunity,0),lg=efficiency(prior);
 if(!(lg>0))return null;
 const factor=cap(1+.4*(efficiency(d)/lg-1)*games/(games+15),.85,1.15);
 return {projection:base.projection*factor,targetShareProjection:base.projection,expectedTargets:base.targetVolume*base.share,positionEfficiencyFactor:factor,opponentGames:games,conditionalPositiveTargetSample:true,liveRoutesVerified:false};
}
module.exports={teamVolume,passingAttempts,receiving};
