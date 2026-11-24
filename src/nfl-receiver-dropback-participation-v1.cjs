"use strict";
const num=Number.isFinite,avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
function project(weekly,participation,playerId,team,season,week){
 const idx=new Map(),bad=new Set();
 for(const p of participation){const k=p.gameId+"|"+p.team+"|"+p.playerId;if(idx.has(k))bad.add(k);idx.set(k,p);}
 const a=[];for(const r of weekly){
  if(r.playerId!==playerId||r.team!==team||!(r.y<season||r.y===season&&r.w<week)||!num(r.opportunity)||r.opportunity<0||!num(r.value))continue;
  const k=r.gameId+"|"+team+"|"+playerId,p=idx.get(k);
  if(!p||bad.has(k)||!Number.isInteger(p.onFieldDropbacks)||!Number.isInteger(p.teamDropbacks)||p.teamDropbacks<=0||p.onFieldDropbacks<r.opportunity||p.onFieldDropbacks>p.teamDropbacks)continue;
  a.push({...r,...p});
 }
 a.sort((x,y)=>x.y-y.y||x.w-y.w);const h=a.slice(-15);
 if(h.length<8||new Set(h.map(x=>x.gameId)).size!==h.length)return null;
 const sum=k=>h.reduce((s,x)=>s+x[k],0),on=sum("onFieldDropbacks"),targets=sum("opportunity");
 if(on<100||targets<20)return null;
 const onFieldShare=on/sum("teamDropbacks"),targetsPerOnFieldDropback=targets/on;
 const expectedTeamDropbacks=avg(h.slice(-8).map(x=>x.teamDropbacks));
 return {projection:expectedTeamDropbacks*onFieldShare*targetsPerOnFieldDropback*sum("value")/targets,onFieldShare,targetsPerOnFieldDropback,expectedTeamDropbacks,priorGames:h.length,actualRoutesVerified:false,liveRoleVerified:false,researchOnly:true};
}
module.exports={project};