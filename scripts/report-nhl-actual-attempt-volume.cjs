"use strict";
// Actual recorded shot attempts only; no SOG+opponent-block proxy.
const fs=require("node:fs"),path=require("node:path"),{poisson}=require("../src/nhl-shot-block-tail-v2.cjs");
const {scheduleIndex,scheduledOpponent}=require("../src/nhl-fixed-ensemble-research.cjs");
const count=x=>Number.isInteger(x)&&x>=0,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),cap=(x,a,b)=>Math.max(a,Math.min(b,x));
// Bootstrap full official games or entire slates, not three synthetic lines
// as independent forecasts. Descriptive paired Brier loss vs matched base.
function pairedInterval(clusters,{minimum=20,replicates=1200}={}){
 if(!Array.isArray(clusters)||clusters.length<minimum||
  clusters.some(x=>!Number.isFinite(x.sum)||!Number.isInteger(x.n)||x.n<1))return null;
 let seed=0x19d325a7;const means=clusters.map(x=>x.sum/x.n),n=means.length,draw=[];
 for(let i=0;i<replicates;i++){
  let total=0;
  for(let j=0;j<n;j++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   total+=means[Math.floor(seed/4294967296*n)];
  }
  draw.push(total/n);
 }
 draw.sort((a,b)=>a-b);
 return {lower:draw[Math.floor(.025*(replicates-1))],
  upper:draw[Math.ceil(.975*(replicates-1))],replicates,
  syntheticThresholdsOnly:true,originalPlatformLineVerified:false};
}
const seasonForDay=day=>{
 const y=Number(day.slice(0,4)),m=Number(day.slice(5,7)),start=m>=7?y:y-1;
 return start+"-"+String((start+1)%100).padStart(2,"0");
};

const valid=r=>r.source==="official_final_pbp_sog_reconciled"&&count(r.shotAttempts)&&count(r.shotsOnGoal)&&count(r.missedAttempts)&&count(r.blockedAttempts)&&r.shotAttempts===r.shotsOnGoal+r.missedAttempts+r.blockedAttempts&&count(r.timeOnIceSeconds)&&r.timeOnIceSeconds>0;
function forecast(prior,defense,league){
 const h=prior.filter(valid).slice(-20);if(h.length<8||defense.length<5||league.length<30)return null;
 const toi=.6*avg(h.slice(-5).map(x=>x.timeOnIceSeconds))+.4*avg(h.map(x=>x.timeOnIceSeconds));
 const attempts=sum(h.map(x=>x.shotAttempts)),ice=sum(h.map(x=>x.timeOnIceSeconds));if(!attempts||!ice||avg(league)<=0)return null;
 const conversion=(sum(h.map(x=>x.shotsOnGoal))+3)/(attempts+5),def=cap(1+.4*(avg(defense.slice(-10))/avg(league)-1)*Math.min(10,defense.length)/(Math.min(10,defense.length)+10),.8,1.2);
 const pp=h.filter(x=>count(x.powerPlayTimeOnIceSeconds)&&x.powerPlayTimeOnIceSeconds<=x.timeOnIceSeconds);
 const ppFactor=pp.length>=8&&pp.slice(-5).length===5?cap(1+.5*(avg(pp.slice(-5).map(x=>x.powerPlayTimeOnIceSeconds))/toi-avg(pp.map(x=>x.powerPlayTimeOnIceSeconds))/avg(h.map(x=>x.timeOnIceSeconds))),.9,1.1):null;
 const base=avg(h.slice(-5).map(x=>x.shotsOnGoal)),attempt=attempts/ice*toi*conversion;
 // Frozen, unfitted hypothesis: shrink recent true shot attempts/attempt-to-SOG
 // conversion against 20 historical official games. Never use target game.
 let attemptRecency=null,defenseRecency=null;
 if(h.length>=16){
  const recent=h.slice(-5),recentAttempts=sum(recent.map(x=>x.shotAttempts)),
   recentIce=sum(recent.map(x=>x.timeOnIceSeconds));
  if(recentAttempts>0&&recentIce>0){
   const recentConversion=(sum(recent.map(x=>x.shotsOnGoal))+3)/(recentAttempts+5);
   attemptRecency=toi*(.8*(attempts/ice)*conversion+
    .2*(recentAttempts/recentIce)*recentConversion);
   defenseRecency=attemptRecency*def;
  }
 }
 return {base,attempt,defense:attempt*def,
  attemptRecency,defenseRecency,pp:ppFactor===null?null:attempt*def*ppFactor};
}
function study(rows,schedule){
 const idx=scheduleIndex(schedule),ids=new Map(),days=new Map(),past=new Map(),defense=new Map(),league=[],out={};let unique=0;
 const add=(m,k,x)=>{const a=m.get(k)||[];a.push(x);m.set(k,a);};
 for(const r of rows.filter(valid))add(ids,r.gameId+"|"+r.playerId,r);
 for(const a of ids.values())if(a.length===1){add(days,a[0].gameDate,a[0]);unique++;}
 for(const [day,rs] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  for(const r of rs){const opp=scheduledOpponent(r,idx);if(!opp)continue;const v=forecast(past.get(r.playerId)||[],defense.get(opp)||[],league);if(!v)continue;
   for(const [k,p] of Object.entries(v)){
    if(p===null)continue;
    const a=out[k]??={n:0,brier:0,baseBrier:0,mae:0,baseMae:0,
      games:new Set(),dates:new Set(),paired:new Map(),seasons:new Map()};
    a.n++;a.games.add(r.gameId);a.dates.add(day);
    a.mae+=Math.abs(p-r.shotsOnGoal);
    a.baseMae+=Math.abs(v.base-r.shotsOnGoal);
    let pairedDiff=0;
    for(const line of [1.5,2.5,3.5]){
     const y=Number(r.shotsOnGoal>line),
       modelLoss=(poisson(p,line)-y)**2,
       baseLoss=(poisson(v.base,line)-y)**2;
     a.brier+=modelLoss;a.baseBrier+=baseLoss;
     pairedDiff+=(modelLoss-baseLoss)/3;
    }
    const group=a.paired.get(r.gameId)||{n:0,sum:0,day};
    if(group.day!==day)throw Error("Official game crossed two dates");
    group.n++;group.sum+=pairedDiff;a.paired.set(r.gameId,group);
    const season=seasonForDay(day),segment=a.seasons.get(season)||{n:0,sum:0};
    segment.n++;segment.sum+=pairedDiff;a.seasons.set(season,segment);
   }
  }
  const games=new Map();for(const r of rs){add(past,r.playerId,r);add(games,r.gameId,r);}
  for(const g of games.values()){const teams=[...new Set(g.map(r=>r.team))];if(teams.length!==2||teams.some(t=>g.filter(r=>r.team===t).length!==18))continue;for(const t of teams){const n=sum(g.filter(r=>r.team!==t).map(r=>r.shotAttempts));add(defense,t,n);league.push(n);}}
 }
 return {kind:"nhl_actual_attempt_volume_replay_v2",
  generatedAt:new Date().toISOString(),sourceRows:unique,
  models:Object.fromEntries(Object.entries(out).map(([k,a])=>{
   const perGame=[...a.paired.values()],slates=new Map();
   for(const x of perGame){
    const z=slates.get(x.day)||{n:0,sum:0};
    z.n+=x.n;z.sum+=x.sum;slates.set(x.day,z);
   }
   return [k,{n:a.n,games:a.games.size,dates:a.dates.size,
    mae:a.mae/a.n,matchedBaseMAE:a.baseMae/a.n,
    brier:a.brier/(3*a.n),matchedBaseBrier:a.baseBrier/(3*a.n),
    pairedMeanSyntheticBrierMinusBase:(a.brier-a.baseBrier)/(3*a.n),
    equalGame95:pairedInterval(perGame,{minimum:30}),
    equalSlate95:pairedInterval([...slates.values()],{minimum:20}),
    bySeason:Object.fromEntries([...a.seasons].map(([season,v])=>[
     season,{observations:v.n,pairedMeanSyntheticBrierMinusBase:v.sum/v.n}])),
    independentlyValidatedOriginalLineEdge:false,
    eligibleForAutoModelPromotion:false}];
  })),
  strictlyPriorDays:true,comparisonOnMatchedSyntheticThresholds:true,
  threeThresholdsNotIndependent:true,originalPlatformLinesMatched:false,
  frozenFutureOriginalOfferValidationStillRequired:true,
  syntheticThresholdsOnly:true,ppTimeProxyNotConfirmedLineAssignment:true,
  modelPromoted:false,calibrationApproved:false,bettingEligible:false};
}
function main(){const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/period-stats/dates"),read=p=>JSON.parse(fs.readFileSync(p,"utf8")),rows=fs.readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).flatMap(n=>{const a=read(path.join(dir,n));return a.complete===true?a.shotAttemptRows||[]:[];});const a=read(path.join(root,"outputs/official-nhl/season-schedules/2025-26.json")),b=read(path.join(root,"outputs/official-nhl/season-schedules/2026-27.json"));const result=study(rows,{...b,complete:a.complete&&b.complete,games:[...a.games,...b.games]});fs.writeFileSync(path.join(root,"outputs/backtests/nhl-actual-attempt-volume-latest.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));}
if(require.main===module)main();module.exports={valid,forecast,study,pairedInterval,seasonForDay};