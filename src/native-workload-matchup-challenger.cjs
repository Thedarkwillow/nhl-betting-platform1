'use strict';

// Fixed research arms. This module receives verified, exact native game rows.
// It neither chooses a player from a post-game roster nor asserts availability.
const settings={
 NHL:{markets:['sog','points'],minimum:8,minWorkload:8,role:0,lookback:45,embargo:24},
 NFL:{markets:['receiving_yards','receptions'],minimum:15,minWorkload:10,role:2,lookback:460,embargo:48},
 NBA:{markets:['points','rebounds','assists','threePointersMade'],minimum:12,minWorkload:8,role:8,lookback:45,embargo:24},
};
const revision='native-workload-matchup-shadow-v1';
const finite=Number.isFinite, mean=a=>a.reduce((s,n)=>s+n,0)/a.length;
const clamp=(x,l,u)=>Math.max(l,Math.min(u,x));
const isEarlier=(r,t,c)=>r.event!==t.event&&r.start+c.embargo*3600000<=t.start&&
 (t.sport!=='NFL'||r.season<t.season||r.season===t.season&&r.week<t.week);
const priorOf=(rows,target)=>rows.filter(r=>r.sport===target.sport&&isEarlier(r,target,settings[target.sport]))
 .sort((a,b)=>a.start-b.start);
const total=(rows,key)=>rows.reduce((a,r)=>a+r[key],0);
const stat=(r,m)=>r.values?.[m];
const valid=(r,m)=>Number.isSafeInteger(stat(r,m))&&finite(r.exposure)&&r.exposure>=0&&
 (r.exposure>0||stat(r,m)===0);
const estimated=(values,line,shift=0)=>(.5+values.filter(v=>v+shift>line).length)/(1+values.length);
const sideKey=(t,r)=>JSON.stringify([t.sport,r.event,r.team]);

function forecast({target,playerRows,leagueSides,metric,line,incumbentHigher}){
 const c=settings[target?.sport];
 if(!c?.markets.includes(metric)||!finite(target.start)||!target.opponent||target.team===target.opponent||
  !finite(line)||line<0||line%1!==.5||!finite(incumbentHigher)||incumbentHigher<0||incumbentHigher>1)return null;
 const p=priorOf(playerRows,target).filter(r=>r.id===target.id&&r.team===target.team&&valid(r,metric)).slice(-30);
 if(new Set(p.map(r=>r.event)).size!==p.length||p.length<c.minimum||mean(p.slice(-5).map(r=>r.exposure))<c.role)return null;
 const values=p.map(r=>stat(r,metric)), base=mean(values);
 const recent=p.slice(-5),longExposure=total(p,'exposure'),shortExposure=mean(recent.map(r=>r.exposure));
 const enoughWorkload=longExposure>0&&p.filter(r=>r.exposure>0).length>=c.minWorkload&&shortExposure>0;
 const workloadMean=enoughWorkload?total(p.map(r=>({value:stat(r,metric)})),'value')/longExposure*shortExposure:null;
 const maxDelta=Math.max(1,Math.abs(base)*.25);
 const workloadDelta=workloadMean===null?null:clamp(workloadMean-base,-maxDelta,maxDelta);
 const match=p.filter(r=>r.opponent===target.opponent);
 const matchup=match.length>=3?(20*incumbentHigher+match.filter(r=>stat(r,metric)>line).length)/(20+match.length):null;

 const league=priorOf(leagueSides,target).filter(r=>valid(r,metric)&&r.start>=target.start-c.lookback*86400000);
 const opponents=league.filter(r=>r.opponent===target.opponent);
 const peers=league.filter(r=>r.opponent!==target.opponent);
 const totalValues=a=>a.reduce((s,r)=>s+stat(r,metric),0);
 const enoughDef=opponents.length>=5&&peers.length>=40&&total(opponents,'exposure')>0&&total(peers,'exposure')>0&&
  new Set(league.map(r=>sideKey(target,r))).size===league.length;
 const leagueRate=enoughDef?totalValues(peers)/total(peers,'exposure'):null;
 const ratio=leagueRate>0?totalValues(opponents)/total(opponents,'exposure')/leagueRate:null;
 const adjustment=ratio===null?null:.30*clamp(ratio-1,-.25,.25);
 const arm=shift=>shift===null?null:clamp(incumbentHigher+estimated(values,line,shift)-estimated(values,line),0,1);
 return {revision,incumbent:incumbentHigher,neutral:.5,priorEmpirical:estimated(values,line),matchup,
  workload:arm(workloadDelta),defense:arm(adjustment===null?null:base*adjustment),
  workloadDefense:arm(workloadDelta===null||adjustment===null?null:workloadDelta+(base+workloadDelta)*adjustment),
  priorGames:p.length,matchupGames:match.length,defensiveGames:opponents.length,modelApproved:false};
}
module.exports={forecast,settings,revision,priorOf,estimated};
