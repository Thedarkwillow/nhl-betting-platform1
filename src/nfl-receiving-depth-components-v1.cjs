"use strict";
const num=Number.isFinite,sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function components(prior,defense){
 const a=prior.filter(x=>num(x.airYards)&&num(x.yac)&&Number.isInteger(x.receptions)&&x.receptions>=0&&num(x.opportunity)&&x.opportunity>0&&x.receptions<=x.opportunity&&num(x.value)).slice(-20);
 if(a.length<10)return null;
 const targets=sum(a,"opportunity"),catchCount=sum(a,"receptions");
 if(!catchCount)return null;
 const expectedTargets=.65*mean(a.slice(-5).map(x=>x.opportunity))+.35*mean(a.slice(-10).map(x=>x.opportunity));
 const airPerTarget=sum(a,"airYards")/targets,yacPerReception=sum(a,"yac")/catchCount,catchRate=(catchCount+2)/(targets+4);
 // Air yards on all targets are not completed air yards: use the explicitly
 // estimated catch fraction, rather than pretending the two are equal.
 const raw=expectedTargets*catchRate*(airPerTarget+yacPerReception);
 const d=defense.filter(x=>num(x.airYards)&&num(x.opportunity)&&x.opportunity>0&&Number.isInteger(x.receptions)&&x.receptions>=0&&x.receptions<=x.opportunity);
 const games=new Set(d.map(x=>x.gameId)).size,allowedCatch=games>=5?sum(d,"receptions")/sum(d,"opportunity"):null;
 return {projection:Math.max(0,raw),expectedTargets,airYardsPerTarget:airPerTarget,yacPerReception,catchRate,priorGames:a.length,opponentCatchRate:allowedCatch,opponentGames:games,routeParticipationVerified:false,coverageAssignmentVerified:false,liveRoleVerified:false,modelPromoted:false};
}
module.exports={components};
