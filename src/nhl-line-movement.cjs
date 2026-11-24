"use strict";
const norm=x=>String(x??"").trim().toLowerCase();
const key=r=>[r.player,r.team,r.market,r.tier,r.period,r.matchup].map(norm).join("|");
function diffBoards(previous,current){
 const old=new Map(),fresh=new Map();
 for(const r of previous.rows||[])if(!r.isLive)old.set(key(r),r);
 for(const r of current.rows||[])if(!r.isLive)fresh.set(key(r),r);
 const changes=[];
 for(const [k,r] of fresh){
  const prior=old.get(k);
  if(!prior){changes.push({type:"added",player:r.player,team:r.team,market:r.market,tier:r.tier,previousLine:null,line:r.line,capturedAt:r.capturedAt});continue;}
  if(Number(prior.line)!==Number(r.line))changes.push({type:Number(r.line)>Number(prior.line)?"increased":"decreased",player:r.player,team:r.team,market:r.market,tier:r.tier,previousLine:Number(prior.line),line:Number(r.line),capturedAt:r.capturedAt});
 }
 // A missing row is only a confirmed removal if both snapshots cover every category.
 if(previous.coverageComplete===true&&current.coverageComplete===true&&previous.allCategoriesFresh===true&&current.allCategoriesFresh===true){
  for(const [k,r] of old)if(!fresh.has(k))changes.push({type:"removed",player:r.player,team:r.team,market:r.market,tier:r.tier,previousLine:r.line,line:null,capturedAt:current.generatedAt});
 }
 return {previousAt:previous.generatedAt,currentAt:current.generatedAt,removalsVerified:previous.coverageComplete===true&&current.coverageComplete===true&&previous.allCategoriesFresh===true&&current.allCategoriesFresh===true,changes};
}
module.exports={diffBoards};
