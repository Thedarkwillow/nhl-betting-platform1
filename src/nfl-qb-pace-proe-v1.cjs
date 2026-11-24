"use strict";
// nflfastR xpass/PROE refer to DROPBACKS (includes sacks/scrambles),
// not official passing attempts. Count only explicit valid scrimmage plays.
const num=Number.isFinite,bin=x=>x===0||x===1,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x)),sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);
const key=(...x)=>JSON.stringify(x),before=(x,y,w)=>x.y<y||x.y===y&&x.w<w;
function build(events,volume){
 const groups=new Map(),ids=new Set(),bad=new Set();
 for(const x of events){const k=key(x.game_id,x.play_id);if(ids.has(k))bad.add(x.game_id);ids.add(k);const a=groups.get(x.game_id)||[];a.push(x);groups.set(x.game_id,a);}
 const rows=[];
 for(const v of volume){
  if(bad.has(v.gameId))continue;
  const e=groups.get(v.gameId)||[];
  if(!e.length||e.some(x=>Number(x.season)!==v.y||Number(x.week)!==v.w))continue;
  const a=e.filter(x=>x.posteam===v.team&&x.defteam===v.opponent&&["pass","run","qb_spike","qb_kneel"].includes(x.play_type));
  if(!a.length||a.some(x=>!bin(x.two_point_attempt)))continue;
  const all=a.filter(x=>x.two_point_attempt===0);
  if(all.some(x=>!bin(x.pass_attempt)||!bin(x.sack)||!bin(x.qb_dropback)||!num(x.qtr)))continue;
  // nflfastR pass_attempt can include sacks; crosscheck the official total
  // after excluding sacks. Exclude spikes only from designed dropback rate.
  const attempts=all.filter(x=>x.pass_attempt===1&&x.sack===0).length;
  if(attempts!==v.attempts)continue;
  const reg=all.filter(x=>x.qtr>=1&&x.qtr<=4),designed=reg.filter(x=>["pass","run"].includes(x.play_type));
  if(!reg.length||!designed.length)continue;
  const neutral=designed.filter(x=>num(x.score_differential)&&Math.abs(x.score_differential)<=7&&x.qtr<=3);
  const proe=designed.filter(x=>num(x.xpass)&&x.xpass>=0&&x.xpass<=1&&num(x.pass_oe)&&Math.abs(x.pass_oe-100*(x.qb_dropback-x.xpass))<.05);
  rows.push({...v,regulationScrimmagePlays:reg.length,neutralPlays:neutral.length,neutralDropbacks:sum(neutral,"qb_dropback"),designedPlays:designed.length,dropbacks:sum(designed,"qb_dropback"),proePlays:proe.length,proeSum:sum(proe,"pass_oe"),attemptsPerDropback:sum(all,"qb_dropback")>0?attempts/sum(all,"qb_dropback"):null});
 }
 return rows.sort((a,b)=>a.y-b.y||a.w-b.w);
}
function features(rows,team,opp,y,w,qbShare){
 const past=rows.filter(x=>before(x,y,w)),off=past.filter(x=>x.team===team).slice(-10),def=past.filter(x=>x.opponent===opp).slice(-10);
 if(off.length<5||def.length<5||!num(qbShare)||qbShare<0||qbShare>1)return null;
 const pace=.7*avg(off.map(x=>x.regulationScrimmagePlays))+.3*avg(def.map(x=>x.regulationScrimmagePlays));
 const rate=sum(off,"dropbacks")/sum(off,"designedPlays"),conversion=avg(off.map(x=>x.attemptsPerDropback).filter(x=>num(x)&&x>=0&&x<=1));
 if(!num(conversion))return null;
 const neutral=sum(off,"neutralPlays")>=100?sum(off,"neutralDropbacks")/sum(off,"neutralPlays"):null;
 const eligible=off.filter(x=>x.proePlays>=.8*x.designedPlays);
 const proe=eligible.length>=5?sum(eligible,"proeSum")/sum(eligible,"proePlays"):null;
 const league=past.filter(x=>x.y===y&&x.designedPlays>0),lg=league.length>=30?sum(league,"dropbacks")/sum(league,"designedPlays"):null;
 const defRate=sum(def,"dropbacks")/sum(def,"designedPlays");
 return {pace,neutralDropbackRate:neutral,proePercentagePoints:proe,conversion,priorOffGames:off.length,priorDefGames:def.length,variants:{scrimmagePace:pace*rate*conversion*qbShare,...(num(neutral)?{neutralScript:pace*(.65*rate+.35*neutral)*conversion*qbShare}:{}),...(num(proe)&&num(lg)?{proeAdjustment:pace*cap(.65*rate+.35*(lg+proe/100)+.15*(defRate-lg),.2,.9)*conversion*qbShare}:{})},actualTargetGameDataUsed:false,liveRoleVerified:false};
}
module.exports={build,features};
