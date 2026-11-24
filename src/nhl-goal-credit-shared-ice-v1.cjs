"use strict";
// Goal credits from official events. Validate against official skater boxscore,
// including zero-assist players. SO goals never count.
const num=Number.isFinite,ct=x=>Number.isInteger(x)&&x>=0,sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const clock=x=>{const m=String(x||"").match(/^(\d{1,2}):([0-5]\d)$/);return m?60*Number(m[1])+Number(m[2]):null;};
function extract(pbp,box,shifts){
 if(!Number.isInteger(pbp?.id)||!["OFF","FINAL"].includes(pbp.gameState)||box?.id!==pbp.id||!["OFF","FINAL"].includes(box.gameState))return null;
 const clubs=[pbp.awayTeam?.id,pbp.homeTeam?.id];if(clubs.some(x=>!Number.isInteger(x))||clubs[0]===clubs[1])return null;
 const roster=new Map();
 for(const [side,team] of [["awayTeam",clubs[0]],["homeTeam",clubs[1]]])for(const k of ["forwards","defense"]){
  for(const x of box.playerByGameStats?.[side]?.[k]||[]){if(!Number.isInteger(x.playerId)||roster.has(x.playerId)||!ct(x.goals)||!ct(x.assists)||!ct(x.points)||x.goals+x.assists!==x.points)return null;
   roster.set(x.playerId,{id:x.playerId,team,goals:0,a1:0,a2:0,ev:0,pp:0,sh:0,other:0,actualGoals:x.goals,actualAssists:x.assists,actualPoints:x.points});}
 }
 if(roster.size<20||!Array.isArray(pbp.plays)||new Set(pbp.plays.map(x=>x.eventId)).size!==pbp.plays.length)return null;
 for(const g of pbp.plays.filter(x=>x.typeDescKey==="goal"&&x.periodDescriptor?.periodType!=="SO")){
  const d=g.details||{},team=d.eventOwnerTeamId,ids=[d.scoringPlayerId,d.assist1PlayerId,d.assist2PlayerId].filter(x=>x!=null);
  if(!clubs.includes(team)||!Number.isInteger(d.scoringPlayerId)||new Set(ids).size!==ids.length||ids.some(x=>roster.get(x)?.team!==team))return null;
  if(d.assist2PlayerId!=null&&d.assist1PlayerId==null)return null;
  const s=String(g.situationCode||""),away=Number(s[1]),home=Number(s[2]);
  const strength=/^[01][3-6][3-6][01]$/.test(s)&&s[0]==="1"&&s[3]==="1"?(away===home?"ev":(team===clubs[0]?away>home:home>away)?"pp":"sh"):"other";
  for(const [id,k] of [[d.scoringPlayerId,"goals"],[d.assist1PlayerId,"a1"],[d.assist2PlayerId,"a2"]])if(id!=null){const r=roster.get(id);r[k]++;r[strength]++;}
 }
 const players=[...roster.values()];if(players.some(x=>x.goals!==x.actualGoals||x.a1+x.a2!==x.actualAssists||x.ev+x.pp+x.sh+x.other!==x.actualPoints))return null;
 const spans=new Map(),seen=new Set();let shiftsVerified=Array.isArray(shifts)&&shifts.length>0;
 for(const s of shifts||[]){
  if(!roster.has(s.playerId))continue;
  const a=clock(s.startTime),b=clock(s.endTime),p=s.period,r=roster.get(s.playerId);
  if(s.gameId!==pbp.id||s.teamId!==r.team||!ct(p)||p<1||p>4||a===null||b===null||a>b||b>(p===4?300:1200)){shiftsVerified=false;continue;}
  if(a===b)continue;const k=[s.playerId,p,a,b].join("|");if(seen.has(k)){shiftsVerified=false;continue;}seen.add(k);
  const l=spans.get(s.playerId)||[];l.push({p,a,b});spans.set(s.playerId,l);
 }
 const overlap=(a,b)=>a.reduce((n,x)=>n+b.reduce((s,y)=>s+(x.p===y.p?Math.max(0,Math.min(x.b,y.b)-Math.max(x.a,y.a)):0),0),0);
 for(const r of players){
  const a=spans.get(r.id)||[];const own=a.reduce((n,x)=>n+x.b-x.a,0);
  const boxRow=[...["awayTeam","homeTeam"].flatMap(side=>["forwards","defense"].flatMap(k=>box.playerByGameStats?.[side]?.[k]||[]))].find(x=>x.playerId===r.id);
  const toi=clock(boxRow?.toi);if(!a.length||toi===null||Math.abs(own-toi)>5||overlap(a,a)!==own)shiftsVerified=false;
 }
 const shared=[];if(shiftsVerified)for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){const a=players[i],b=players[j];if(a.team!==b.team)continue;const sec=overlap(spans.get(a.id),spans.get(b.id));if(sec>0)shared.push({a:a.id,b:b.id,seconds:sec});}
 return {gameId:pbp.id,gameDate:pbp.gameDate,players,shared,shiftsVerified,goalCreditsVerified:true,sharedIceNotCausal:true};
}
function features(prior,componentRows,id,team,day){
 const a=prior.filter(x=>x.gameDate<day&&x.team===team&&ct(x.goals)&&ct(x.assists)&&ct(x.points)&&ct(x.shotsOnGoal)&&x.goals<=x.shotsOnGoal&&x.points===x.goals+x.assists&&num(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0).slice(-25);
 if(a.length<10)return null;
 const shots=sum(a,"shotsOnGoal"),toi=avg(a.slice(-10).map(x=>x.timeOnIceSeconds)),ice=sum(a,"timeOnIceSeconds");
 const g=componentRows.filter(x=>x.gameDate<day&&x.goalCreditsVerified).flatMap(x=>x.players.filter(p=>p.id===id&&a.some(r=>r.gameId===x.gameId)).map(p=>({...p,gameId:x.gameId})));
 const rate=(sum(a,"goals")+2)/(shots+20),goals=shots/ice*toi*rate;
 const assists=sum(a,"assists")/ice*toi;
 const matched=a.filter(x=>g.some(y=>y.gameId===x.gameId)),cIce=sum(matched,"timeOnIceSeconds");
 const split=g.length>=8&&cIce>0?{primary:sum(g,"a1")/cIce*toi,secondary:sum(g,"a2")/cIce*toi,even:sum(g,"ev")/cIce*toi,powerPlay:sum(g,"pp")/cIce*toi,shortHanded:sum(g,"sh")/cIce*toi,other:sum(g,"other")/cIce*toi}:null;
 return {goals,assists,points:goals+assists,shootingRate:rate,expectedIce:toi,split,verifiedComponentGames:g.length};
}
module.exports={extract,features,clock};