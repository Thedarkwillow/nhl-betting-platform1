"use strict";
// Research-only transfer. 2023 warmup, 2024 online training, 2025 frozen
// evaluation. Same feature contract as adaptive v2. No raw archive retained.
const {features,newFit,update,LINES}=require("./nhl-standard-adaptive-research.cjs");
const {mass}=require("./nhl-recent-rate-forward-v1.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const KIND="nhl_standard_three_season_transfer_v1";
const NAMES=["form","rate","matchup","component","recent","fixed","learned"];
const count=x=>Number.isInteger(x)&&x>=0,sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length,clip=x=>Math.max(1e-8,Math.min(1-1e-8,x));
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function learned(w,x){return 1/(1+Math.exp(-Math.max(-20,Math.min(20,sum(w.map((v,i)=>v*x[i]))))));}
function predictions(f,w){return Object.fromEntries([...f.probs.map((p,i)=>[NAMES[i],p]),["fixed",mean(f.probs)],["learned",learned(w,f.x)]]);}
function validRow(r){return [2023,2024,2025].includes(r.season)&&Number.isInteger(r.gameId)&&Number.isInteger(r.playerId)&&String(r.gameId).startsWith(String(r.season)+"02")&&/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate||"")&&Number.isFinite(dt(r.gameDate))&&[r.season,r.season+1].includes(Number(r.gameDate.slice(0,4)))&&["skater","goalie"].includes(r.type)&&r.gameState==="FINAL"&&canonical(r.team)&&canonical(r.opponent)&&canonical(r.team)!==canonical(r.opponent)&&Number.isFinite(r.timeOnIceSeconds)&&r.timeOnIceSeconds>0&&r.timeOnIceSeconds<=3900;}
// Separate source-rich ablation (not eligible to transfer): attempts and
// on-ice team goal involvement from earlier appearances, no target-game data.
function sourceRich(prior,m,line,f){
 if(!["shotsOnGoal","points","goals","assists","blockedShots"].includes(m))return null;
 const a=prior.filter(r=>r.type==="skater"&&count(r[m])&&r.timeOnIceSeconds>0).slice(-30),b=a.slice(-20);
 if(b.length<8)return null;
 const total=k=>b.every(r=>Number.isFinite(r[k])&&r[k]>=0)?sum(b.map(r=>r[k])):null,ice=total("timeOnIceSeconds");
 if(!(ice>0))return null;
 const expected=k=>{const z=total(k);return z===null?null:z*f.expectedTOI/ice;};
 const conversion=(value,exposure,anchor,weight)=>{const x=total(value),e=total(exposure);return x===null||e===null||e<=0?null:(x+anchor*weight)/(e+weight);};
 let mu=null;
 if(m==="shotsOnGoal"||m==="blockedShots"){
  const k=m==="shotsOnGoal"?"attempts":"againstAttempts",e=expected(k),q=conversion(m,k,m==="shotsOnGoal"?.55:.07,m==="shotsOnGoal"?20:30);
  if(e!==null&&q!==null)mu=e*Math.max(0,Math.min(1,q));
 }else{
  const e=expected("xg"),t=expected("onIceGoals"),g=conversion("goals","xg",1,10),ass=conversion("assists","onIceGoals",.45,15);
  if(e!==null&&g!==null&&t!==null&&ass!==null){const goals=e*g,assists=t*Math.min(1,ass);mu=m==="points"?goals+assists:m==="goals"?goals:assists;}
 }
 return mu===null?null:mass(a.map(r=>r[m]),mu,line)?.higher??null;
}
function fit(rows,{now=new Date().toISOString(),codeCommit=null,minGames=100,minDates=20}={}){
 const seen=new Set(),days=new Map(),players=new Map(),team=new Map(),league={},models=Object.fromEntries(Object.keys(LINES).map(m=>[m,newFit()])),stats={},sourceCounts={};
 for(const r of rows){if(!validRow(r))throw Error("Invalid historical source row");const k=r.gameId+"|"+r.playerId;if(seen.has(k))throw Error("Repeated historical player game");seen.add(k);const a=days.get(r.gameDate)||[];a.push(r);days.set(r.gameDate,a);sourceCounts[r.season+"|"+r.type]=(sourceCounts[r.season+"|"+r.type]||0)+1;}
 for(const [day,batch] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  if(new Set(batch.map(r=>r.season)).size!==1)throw Error("Overlapping source seasons");
  const season=batch[0].season,train=Object.fromEntries(Object.keys(LINES).map(m=>[m,[]])),events=new Map();
  for(const g of batch){
   if(g.type==="skater"){const a=events.get(g.gameId)||[];a.push(g);events.set(g.gameId,a);}
   for(const [m,lines] of Object.entries(LINES)){
    if(!count(g[m])||g.type!==(m==="saves"?"goalie":"skater"))continue;
    for(const line of lines){
     const f=features(players.get(g.playerId)||[],m,line,team.get(canonical(g.opponent))?.[m]||[],league[m]||[],day);
     if(!f||season===2023)continue;
     const y=Number(g[m]>line),model=models[m];
     // Compare all methods on identical rows; warmup for fitted weights
     // uses the first 30 games of training, never the evaluation season.
     if(model.games.size>=30&&model.days.size>=10){
      const k=season+"|"+m,a=stats[k]??={n:0,games:new Set(),days:new Set(),opponent:0,rich:{n:0,base:0,source:0,baseLoss:0,sourceLoss:0},models:Object.fromEntries(NAMES.map(n=>[n,{b:0,l:0}]))};
      a.n++;a.games.add(g.gameId);a.days.add(day);a.opponent+=Number(f.opponentUsed);
      for(const [n,p] of Object.entries(predictions(f,model.w))){a.models[n].b+=(p-y)**2;a.models[n].l-=Math.log(clip(y?p:1-p));}
      const rich=sourceRich(players.get(g.playerId)||[],m,line,f);
      if(Number.isFinite(rich)){const z=a.rich,q=f.probs[0];z.n++;z.base+=(q-y)**2;z.source+=(rich-y)**2;z.baseLoss-=Math.log(clip(y?q:1-q));z.sourceLoss-=Math.log(clip(y?rich:1-rich));}
     }
     if(season===2024)train[m].push({gameId:g.gameId,day,x:f.x,y});
    }
   }
  }
  if(season===2024)for(const m of Object.keys(LINES))update(models[m],train[m]);
  for(const r of batch){const a=players.get(r.playerId)||[];a.push(r);players.set(r.playerId,a.slice(-40));}
  for(const event of events.values()){
   const clubs=[...new Set(event.map(r=>canonical(r.team)))];
   if(clubs.length!==2||clubs.some(t=>!t||event.filter(r=>canonical(r.team)===t).length!==18))continue;
   if(event.some(r=>canonical(r.opponent)!==clubs.find(t=>t!==canonical(r.team))))throw Error("Historical matchup conflict");
   for(const t of clubs){const own=event.filter(r=>canonical(r.team)===t),other=event.filter(r=>canonical(r.team)!==t),a=team.get(t)||{};
    for(const m of Object.keys(LINES)){const source=["saves","blockedShots"].includes(m)?own:other,key=["saves","blockedShots"].includes(m)?"shotsOnGoal":m;
     if(!source.every(r=>count(r[key])))continue;const v=sum(source.map(r=>r[key]));
     (a[m]??=[]).push(v);a[m]=a[m].slice(-20);(league[m]??=[]).push(v);league[m]=league[m].slice(-1200);
    }team.set(t,a);
   }
  }
 }
 const report={};
 const summarize=a=>a?{thresholds:a.n,distinctGames:a.games.size,distinctDates:a.days.size,matchupThresholds:a.opponent,sourceRichAblation:{matched:a.rich.n,formBrier:a.rich.n?a.rich.base/a.rich.n:null,sourceBrier:a.rich.n?a.rich.source/a.rich.n:null,formLogLoss:a.rich.n?a.rich.baseLoss/a.rich.n:null,sourceLogLoss:a.rich.n?a.rich.sourceLoss/a.rich.n:null,portableToLive:false},models:Object.fromEntries(NAMES.map(n=>[n,{brier:a.models[n].b/a.n,logLoss:a.models[n].l/a.n}]))}:null;
 for(const m of Object.keys(LINES)){
  const training=summarize(stats["2024|"+m]),evaluation=summarize(stats["2025|"+m]),z=models[m];
  const selected=training?.distinctGames>=minGames&&training?.distinctDates>=minDates?NAMES.slice().sort((a,b)=>training.models[a].brier-training.models[b].brier||NAMES.indexOf(a)-NAMES.indexOf(b))[0]:null;
  report[m]={training,evaluation,selectedOnTrainingBrierOnly:selected,weights:z.w,trainingGames:z.games.size,trainingDates:z.days.size,eligibleForShadow:!!selected&&evaluation?.distinctGames>=minGames&&evaluation?.distinctDates>=minDates};
 }
 return {kind:KIND,generatedAt:now,codeCommit,featureContract:"adaptive_v2_five_probability_logits",source:"MoneyPuck.com",sourceCounts,warmupSeason:2023,trainingSeason:2024,evaluationSeason:2025,weightsFrozenBeforeEvaluation:true,byMarket:report,syntheticThresholds:true,conditionalOnAppearance:true,historicalAsOfAvailabilityVerified:false,actualLineTraining:false,modelPromoted:false,calibrated:false};
}
function forecast(artifact,p,f,asOf,{retrospective=false}={}){
 if(artifact?.kind!==KIND||artifact.featureContract!=="adaptive_v2_five_probability_logits"||artifact.weightsFrozenBeforeEvaluation!==true||artifact.trainingSeason!==2024||artifact.evaluationSeason!==2025||artifact.modelPromoted!==false||!f||!Number.isFinite(dt(asOf))||!Number.isFinite(dt(artifact.generatedAt))||(!retrospective&&dt(artifact.generatedAt)>dt(asOf))||dt(asOf)<Date.parse("2026-07-01T00:00:00Z"))return null;
 const m=artifact.byMarket?.[p.market];if(m?.eligibleForShadow!==true||!NAMES.includes(m.selectedOnTrainingBrierOnly)||!Array.isArray(m.weights)||m.weights.length!==6||m.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>2)||!Array.isArray(f.probs)||f.probs.length!==5||!Array.isArray(f.x)||f.x.length!==6)return null;
 const values=predictions(f,m.weights),q=values[m.selectedOnTrainingBrierOnly];
 return Number.isFinite(q)&&q>0&&q<1?{higher:q,selectedOnTraining:m.selectedOnTrainingBrierOnly,individual:values,artifactGeneratedAt:artifact.generatedAt,artifactCodeCommit:artifact.codeCommit,calibrated:false}:null;
}
module.exports={KIND,NAMES,fit,forecast,sourceRich};
