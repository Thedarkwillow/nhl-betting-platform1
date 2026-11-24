"use strict";
const {canonical}=require("./nhl-opponent-context.cjs"),{pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const {poisson}=require("./nhl-shot-block-tail-v2.cjs");
const n=Number.isFinite,sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),cap=(x,a,b)=>Math.max(a,Math.min(b,x)),dt=Date.parse;
function goalie(history,id,team,day){
 const all=Object.values(history?.players||{}).flatMap(p=>p.games||[]).filter(x=>x.type==="goalie"&&x.gameDate<day&&["FINAL","OFF"].includes(x.gameState)&&n(x.shotsAgainst)&&x.shotsAgainst>0&&n(x.saves)&&x.saves>=0&&x.saves<=x.shotsAgainst&&x.timeOnIceSeconds>0);
 const own=all.filter(x=>x.playerId===id&&canonical(x.team)===canonical(team)).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)).slice(-20);
 if(own.length<5||new Set(own.map(x=>x.gameId)).size!==own.length||sum(own,"shotsAgainst")<100||all.length<100)return null;
 const ref=(sum(all,"shotsAgainst")-sum(all,"saves"))/sum(all,"shotsAgainst");if(!(ref>0))return null;
 const allowed=(sum(own,"shotsAgainst")-sum(own,"saves")+150*ref)/(sum(own,"shotsAgainst")+150);
 return {games:own.length,shots:sum(own,"shotsAgainst"),goalAllowedFactor:cap(allowed/ref,.8,1.2),saveFraction:1-allowed,qualityMetric:"shrunk observed goals per shot; not xG adjusted"};
}
function shared(history,archives,p,ids,day,now){
 const own=(history?.players?.[String(p.playerId)]?.games||[]).filter(x=>x.gameDate<day&&canonical(x.team)===canonical(p.team)&&["OFF","FINAL"].includes(x.gameState)&&Number.isInteger(x.points)&&x.timeOnIceSeconds>0);
 const rows=archives.filter(x=>x.shiftsVerified===true&&x.goalCreditsVerified===true&&x.gameDate<day&&dt(x.collectedAt)<=dt(now)&&dt(x.firstGitAt)<=dt(now)&&dt(x.collectedAt)<=dt(x.firstGitAt));
 if(new Set(rows.map(x=>x.gameId)).size!==rows.length)return null;
 const out=[];
 for(const id of [...new Set(ids||[])].filter(x=>x!==p.playerId)){
  const pairs=[];for(const x of rows){const r=own.filter(y=>y.gameId===x.gameId),a=x.players?.find(z=>z.id===p.playerId),b=x.players?.find(z=>z.id===id);if(r.length!==1||!a||!b||a.team!==b.team)continue;
   const matches=(x.shared||[]).filter(z=>z.a===p.playerId&&z.b===id||z.b===p.playerId&&z.a===id);if(matches.length>1)continue;
   const sec=matches[0]?.seconds??0;if(!n(sec)||sec<0||sec>r[0].timeOnIceSeconds)continue;
   pairs.push({seconds:sec,ice:r[0].timeOnIceSeconds,points:r[0].points});
  }
  if(pairs.length<5||sum(pairs,"seconds")<600)continue;
  out.push({playerId:id,games:pairs.length,sharedSeconds:sum(pairs,"seconds"),sharedFraction:sum(pairs,"seconds")/sum(pairs,"ice")});
 }
 return out.length?out:null;
}
function model(p,{history,archives,context,now,base}){
 if(!["points","assists"].includes(p.market)||!n(base)||base<0||!(dt(p.gameStartAt)-dt(now)>=900000))return null;
 const day=pacificDay(now),role=context?.role,g=context?.goalie,quality=g?.officialClubConfirmed===true?goalie(history,g.opponentGoalieId,p.opponent,day):null;
 const mates=role&&dt(role.capturedAt)<=dt(now)&&dt(now)-dt(role.capturedAt)<6*3600000?shared(history,archives,p,role.projectedLinemateIds,day,now):null;
 // Peer prior scoring is a bounded association proxy, not a causal on-ice rate.
 const peer=mates?.flatMap(m=>{const a=(history?.players?.[String(m.playerId)]?.games||[]).filter(x=>x.gameDate<day&&canonical(x.team)===canonical(p.team)&&["FINAL","OFF"].includes(x.gameState)&&Number.isInteger(x.points)&&x.timeOnIceSeconds>0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)).slice(-15);return a.length>=8?[{...m,pointsPer60:3600*sum(a,"points")/sum(a,"timeOnIceSeconds")}]:[];});
 const variants={};if(quality)variants.goalie=base*quality.goalAllowedFactor;
 const mp=context?.moneyPuckQuality; if(quality&&mp?.goalieOfficialConfirmation===true&&n(mp.goalieQualityFactor)&&mp.goalieQualityFactor>=.8&&mp.goalieQualityFactor<=1.2)variants.xgGoalie=base*mp.goalieQualityFactor;
 if(peer?.length){const s=peer.reduce((a,x)=>a+x.sharedFraction,0),rate=peer.reduce((a,x)=>a+x.sharedFraction*x.pointsPer60,0)/s;variants.linemates=base*cap(1+.08*(rate/2-1)*Math.min(1,s),.9,1.1);}
 if(variants.goalie!==undefined&&variants.linemates!==undefined)variants.combined=base===0?0:variants.goalie*variants.linemates/base;
 return {quality,shared:peer??null,base,variants,higher:Object.fromEntries(Object.entries(variants).map(([k,x])=>[k,poisson(x,p.line)])),officialGoalieConfirmed:!!quality,projectedLinesNotConfirmed:true,moneyPuckGoalieEvidence:variants.xgGoalie!==undefined,allStrengthSharedIce:true,causalChemistryVerified:false,modelPromoted:false};
}
module.exports={goalie,shared,model};