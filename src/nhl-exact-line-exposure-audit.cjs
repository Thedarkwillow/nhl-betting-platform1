"use strict";
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs"),{canonical}=require("./nhl-opponent-context.cjs"),{rowValid}=require("./nhl-frozen-baseline-challenge.cjs"),{variants,distribution}=require("./nhl-market-distribution-availability.cjs"),{bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const sum=a=>a.reduce((s,x)=>s+x,0),avg=a=>sum(a)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x)),num=Number.isFinite,count=v=>Number.isInteger(v)&&v>=0;
const PP=g=>count(g.powerPlayTimeOnIceSeconds)&&g.powerPlayTimeOnIceSeconds<=g.timeOnIceSeconds;
const valid=g=>g.type==="skater"&&g.timeOnIceSeconds>0&&g.timeOnIceSeconds<=3900;
function exposure(prior,m,line){
 const a=prior.filter(g=>valid(g)&&count(g[m])).slice(-20);if(a.length<10)return null;
 const ten=a.slice(-10),five=a.slice(-5),baseTOI=.65*avg(ten.map(g=>g.timeOnIceSeconds))+.35*avg(five.map(g=>g.timeOnIceSeconds)),stableTOI=.55*baseTOI+.45*avg(a.map(g=>g.timeOnIceSeconds));
 const values=a.map(g=>g[m]),rate=sum(values)/sum(a.map(g=>g.timeOnIceSeconds)),p=a.filter(PP),p5=five.filter(PP),p10=ten.filter(PP),mu=rate*stableTOI;
 let ppTOI=null,ppMu=null,ppMode=null;
 if(p.length>=8&&p5.length>=3&&p10.length>=6){
  const share=g=>g.powerPlayTimeOnIceSeconds/g.timeOnIceSeconds,expectedShare=cap(.5*avg(p.map(share))+.3*avg(p10.map(share))+.2*avg(p5.map(share)),0,.5);ppTOI=expectedShare*stableTOI;
  if(m==="points"){const z=p.filter(g=>count(g.powerPlayPoints)&&g.powerPlayPoints<=g.points&&(g.powerPlayTimeOnIceSeconds>0||g.powerPlayPoints===0)),ppSec=sum(z.map(g=>g.powerPlayTimeOnIceSeconds)),non=sum(z.map(g=>g.timeOnIceSeconds-g.powerPlayTimeOnIceSeconds));if(z.length>=8&&ppSec>=300&&non>=1800){
   const ppRate=(sum(z.map(g=>g.powerPlayPoints))+rate*300)/(ppSec+300),nonRate=(sum(z.map(g=>g.points-g.powerPlayPoints))+rate*600)/(non+600);ppMu=.65*(ppRate*ppTOI+nonRate*(stableTOI-ppTOI))+.35*mu;ppMode="exact_historical_PP_and_non_PP_point_counts";
  }}else if(m==="shotsOnGoal"){
   // PP share association (not observed shot strength split). Fit centered
   // rate slope with strong ridge shrinkage on historical rows only.
   const x=p.map(share),y=p.map(g=>g.shotsOnGoal/g.timeOnIceSeconds),cx=avg(x),cy=avg(y),slope=sum(x.map((v,i)=>(v-cx)*(y[i]-cy)))/(sum(x.map(v=>(v-cx)**2))+.3);
   ppMu=cap(mu+stableTOI*slope*(expectedShare-cx),.8*mu,1.2*mu);ppMode="ridge_association_not_shot_strength_split";
  }
 }
 const b=distribution(values,mu,line,"count"),f=ppMu===null?null:distribution(values,ppMu,line,"count");
 return {baseTOI,stableTOI,ppTOI,base:b?.negativeBinomial??null,withPP:f?.negativeBinomial??null,ppMode,priorRows:a.length,ppRows:p.length};
}
function originalLinePairedCI(groups){
 const ci=bootstrapGameBrierDifference(groups);
 return ci?{...ci,metric:"retrospective_candidate_minus_frozen_model_Brier_at_original_lines",
  interpretation:"Paired actual original Standard thresholds, clustered by NHL game. Negative favors the reconstructed candidate, positive favors the original model. NOT a future-frozen challenger, calibrated edge or platform payout."}:null;
}
function summary(a){const n=a.n;return {n,games:a.g.size,dates:a.d.size,baselineBrier:n?a.b/n:null,candidateBrier:n?a.c/n:null,baselineHitRate:n?a.bh/n:null,candidateHitRate:n?a.ch/n:null,alwaysHigher:n?a.h/n:null,alwaysLower:n?1-a.h/n:null,pairedCI:originalLinePairedCI([...a.g.values()]),approved:false};}
function score(map,k,p,q,y,g,day){if(![p,q].every(x=>num(x)&&x>=0&&x<=1))return;const a=map[k]??={n:0,b:0,c:0,bh:0,ch:0,h:0,g:new Map(),d:new Set()};a.n++;a.b+=(p-y)**2;a.c+=(q-y)**2;a.bh+=Number((p>=.5)===Boolean(y));a.ch+=Number((q>=.5)===Boolean(y));a.h+=y;a.d.add(day);const z=a.g.get(g)||{n:0,diff:0};z.n++;z.diff+=(q-y)**2-(p-y)**2;a.g.set(g,z);}
function ledgerProof(ledger){
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger?.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!ledger.counts)return false;
 const totals={registered:0,correct:0,incorrect:0,push:0,pending:0},ids=new Set();
 for(const r of ledger.records){
  if(!rowValid(r)||ids.has(r.id))return false;
  ids.add(r.id);totals.registered++;
  totals[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 }
 return Object.keys(totals).every(k=>ledger.counts[k]===totals[k]);
}
const unsafe=reason=>({kind:"original_actual_line_retrospective_distribution_and_exposure_ablation_v1",
 evidenceValid:false,reason,byMarket:{},matchedPP:{},iceTime:null,rejected:{},
 originalOffersAndOriginalForecastOnly:false,newVariantsRetrospectivelyReconstructed:true,
 asOfHistoricalPublicationUnverified:true,prospectiveEvidence:false,promotionApproved:false});
function audit(ledger,history,schedule,selected){if(!ledgerProof(ledger))return unsafe("invalid_or_inconsistent_original_git_frozen_ledger");const idx=scheduleIndex(schedule),days=new Map(),offers=new Map(),seen=new Set(),byPlayer=new Map(),out={},ppOut={},toi={n:0,base:0,candidate:0,ppN:0,ppError:0},rejected={};
 for(const g of uniqueRows(history)){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 for(const r of [...(ledger?.records||[])].sort((a,b)=>Date.parse(a.firstGitCommittedAt)-Date.parse(b.firstGitCommittedAt))){if(!rowValid(r)||r.tier!=="Standard"||r.line%1!==.5||!["correct","incorrect"].includes(r.selectionStatus)||!num(r.estimatedProbability)||r.estimatedProbability<=0||r.estimatedProbability>=1)continue;const k=[r.gameId,r.playerId,r.market,r.line].join("|"),g=idx.get(r.gameId);if(seen.has(k)||!g)continue;seen.add(k);const a=offers.get(g.gameDate)||[];a.push(r);offers.set(g.gameDate,a);}
 for(const day of [...days.keys()].sort()){
  const rs=days.get(day),finals=new Map(rs.map(g=>[g.gameId+"|"+g.playerId,g]));
  for(const r of offers.get(day)||[]){const g=finals.get(r.gameId+"|"+r.playerId);if(!g||g[r.market]!==r.officialStat||canonical(g.team)!==canonical(r.team)||!scheduledOpponent(g,idx)){rejected.final_mismatch=(rejected.final_mismatch||0)+1;continue;}
   const h=(byPlayer.get(r.playerId)||[]).filter(x=>canonical(x.team)===canonical(r.team)&&x.gameDate<day),ps=variants(h,r.market,r.line),family=selected[r.market],y=Number(g[r.market]>r.line),p=r.selectedSide==="Higher"?r.estimatedProbability:1-r.estimatedProbability;
   if(ps&&family&&num(ps[family])){score(out,r.market,p,ps[family],y,r.gameId,day);score(out,r.market+"|"+family+"|"+r.selectedSide,p,ps[family],y,r.gameId,day);}
   if(["points","shotsOnGoal"].includes(r.market)){const e=exposure(h,r.market,r.line);if(e&&num(e.withPP)){score(ppOut,r.market,e.base,e.withPP,y,r.gameId,day);}}
  }
  for(const g of rs){const h=(byPlayer.get(g.playerId)||[]).filter(x=>canonical(x.team)===canonical(g.team));if(day>="2026-07-01"&&valid(g)){const e=exposure(h,"shotsOnGoal",2.5);if(e){toi.n++;toi.base+=Math.abs(e.baseTOI-g.timeOnIceSeconds);toi.candidate+=Math.abs(e.stableTOI-g.timeOnIceSeconds);if(num(e.ppTOI)&&PP(g)){toi.ppN++;toi.ppError+=Math.abs(e.ppTOI-g.powerPlayTimeOnIceSeconds);}}}}
  for(const g of rs){const a=byPlayer.get(g.playerId)||[];a.push(g);byPlayer.set(g.playerId,a.slice(-40));}
 }
 return {kind:"original_actual_line_retrospective_distribution_and_exposure_ablation_v1",evidenceValid:true,sourceLedgerCountsValidated:true,trainingDistributionSelectedBeforeHoldout:true,byMarket:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,summary(a)])),matchedPP:Object.fromEntries(Object.entries(ppOut).map(([k,a])=>[k,summary(a)])),iceTime:{rows:toi.n,baselineMAESeconds:toi.n?toi.base/toi.n:null,shrunkMAESeconds:toi.n?toi.candidate/toi.n:null,ppRows:toi.ppN,ppMAESeconds:toi.ppN?toi.ppError/toi.ppN:null},rejected,originalOffersAndOriginalForecastOnly:true,newVariantsRetrospectivelyReconstructed:true,asOfHistoricalPublicationUnverified:true,prospectiveEvidence:false,promotionApproved:false};
}
module.exports={exposure,audit,ledgerProof,originalLinePairedCI};
