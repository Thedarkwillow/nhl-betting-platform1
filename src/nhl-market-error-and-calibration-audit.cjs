"use strict";
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs"),{audit,summarize,pacificDay}=require("./nhl-standard-forward-diagnostics.cjs"),{scheduleIndex,scheduledOpponent,uniqueRows}=require("./nhl-fixed-ensemble-research.cjs"),{canonical}=require("./nhl-opponent-context.cjs"),{usable}=require("./nhl-tier-calibration-lineup-risk-v2.cjs"),{bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const dt=Date.parse,clip=x=>Math.max(.001,Math.min(.999,x)),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,logit=p=>Math.log(clip(p)/(1-clip(p))),logistic=z=>1/(1+Math.exp(-z));
function diagnostics(ledger,history,schedule){
 const old=audit(ledger);if(old.status!=="descriptive_original_precommitted_only")return {status:old.status};
 const idx=scheduleIndex(schedule),days=new Map(),team=new Map(),by={},prior=new Map(),rows=uniqueRows(history);
 for(const g of rows){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 const offers=new Map();for(const r of ledger.records){if(r.tier!=="Standard"||!rowValid(r)||!["correct","incorrect"].includes(r.selectionStatus))continue;const day=idx.get(r.gameId)?.gameDate;if(!day)continue;const a=offers.get(day)||[];a.push(r);offers.set(day,a);}
 for(const day of [...new Set([...days.keys(),...offers.keys()])].sort()){
  for(const r of offers.get(day)||[]){
   const own=canonical(r.team),opp=canonical(scheduledOpponent({gameId:r.gameId,gameDate:day,team:own},idx)),p=(prior.get(r.playerId)||[]).filter(x=>canonical(x.team)===own).slice(-10);
   const pos=p.at(-1)?.position||"unknown",o=team.get(opp)||[],t=team.get(own)||[];
   const regime=(a,k,threshold)=>a.length>=5?(mean(a.slice(-10).map(x=>x[k]))>=threshold?"higher_volume":"lower_volume"):"unknown";
   const roles=[["market_side",r.market+"|"+r.selectedSide],["market_position_side",[r.market,pos,r.selectedSide].join("|")],["market_opponent_side",[r.market,opp||"unknown",r.selectedSide].join("|")],["market_opposing_shots_allowed",[r.market,regime(o,"allowed",28),r.selectedSide].join("|")],["market_opposing_shots_for",[r.market,regime(o,"for",28),r.selectedSide].join("|")],["market_own_shots_for",[r.market,regime(t,"for",28),r.selectedSide].join("|")]];
   for(const [kind,k] of roles){const b=by[kind]??={};(b[k]??=[]).push(r);}
  }
  const games=new Map();for(const g of days.get(day)||[]){const a=prior.get(g.playerId)||[];a.push(g);prior.set(g.playerId,a.slice(-20));if(g.type==="skater"){const z=games.get(g.gameId)||[];z.push(g);games.set(g.gameId,z);}}
  for(const rs of games.values()){const ts=[...new Set(rs.map(g=>canonical(g.team)))],groups=ts.map(t=>rs.filter(g=>canonical(g.team)===t));if(ts.length!==2||groups.some(g=>g.length!==18||g.some(x=>!Number.isInteger(x.shotsOnGoal)||x.shotsOnGoal<0)))continue;const totals=groups.map(g=>g.reduce((s,x)=>s+x.shotsOnGoal,0));for(let i=0;i<2;i++){const a=team.get(ts[i])||[];a.push({for:totals[i],allowed:totals[1-i]});team.set(ts[i],a.slice(-20));}}
 }
 return {status:"descriptive_only",overall:old.fullStandard,by:Object.fromEntries(Object.entries(by).map(([k,b])=>[k,Object.fromEntries(Object.entries(b).map(([l,rs])=>[l,{...summarize(rs),
   distinctGames:new Set(rs.map(x=>x.gameId)).size,
   distinctPacificSlates:new Set(rs.map(x=>pacificDay(x.gameStartAt))).size,
   smallSample:rs.length<30||new Set(rs.map(x=>x.gameId)).size<15||
    new Set(rs.map(x=>pacificDay(x.gameStartAt))).size<10,
   independentDirectionalEdgeProven:false}]))])),roleAndTeamFeaturesStrictlyBeforeOfficialGameDate:true,volumeThresholdFixedAt28:true,noAutomaticDirectionFlip:true};
}
function fit(rows){
 const games=new Map();for(const r of rows){const a=games.get(r.gameId)||[];a.push(r);games.set(r.gameId,a);}
 const nByGame=[...games.values()].map(x=>x.length);
 const effectiveGames=rows.length**2/nByGame.reduce((n,x)=>n+x*x,0);
 if(rows.length<60||games.size<15||effectiveGames<12)return null;
 let intercept=0,slope=1;
 for(let i=0;i<50;i++){let a=0,b=0;for(const rs of games.values())for(const r of rs){const z=logit(r.p),e=logistic(intercept+slope*z)-r.y;a+=e/rs.length/games.size;b+=e*z/rs.length/games.size;}intercept=Math.max(-1,Math.min(1,intercept-.18*(a+.12*intercept)));slope=Math.max(.15,Math.min(1.5,slope-.18*(b+.12*(slope-1))));}
 return {intercept,slope,trainingRows:rows.length,trainingGames:games.size,effectiveIndependentGames:effectiveGames};
}
const group=r=>JSON.stringify([r.tier,r.market,r.period||"full_game",r.side]);
function calibration(state,ledger,policyAt){
 const exact=new Map((ledger.records||[]).filter(r=>rowValid(r)&&r.line%1===.5&&["correct","incorrect"].includes(r.selectionStatus)).map(r=>[r.id,r]));
 const all=usable(state).filter(r=>{const x=exact.get(r.id);return x&&r.market===x.market&&r.tier===x.tier&&r.side===x.selectedSide&&r.p===x.estimatedProbability&&r.y===Number(x.selectionStatus==="correct")&&dt(r.frozenAt)===dt(x.firstGitCommittedAt)&&dt(r.startAt)===dt(x.gameStartAt);});
 const bins={},fits={};
 for(const r of all){const k=group(r),b=bins[k]??={observed:0,matched:0,postPolicy:0,raw:0,fit:0,rawLoss:0,fitLoss:0,games:new Map(),dates:new Set(),reliability:Array.from({length:10},()=>({n:0,p:0,y:0}))};b.observed++;
  const candidate=fit(all.filter(x=>group(x)===k&&x.gameId!==r.gameId&&dt(x.observedFinalAt)<dt(r.frozenAt)));
  if(!candidate)continue;
  const q=clip(logistic(candidate.intercept+candidate.slope*logit(r.p))),d=(q-r.y)**2-(r.p-r.y)**2,z=b.games.get(r.gameId)||{n:0,diff:0},v=b.reliability[Math.min(9,Math.floor(q*10))];z.n++;z.diff+=d;b.games.set(r.gameId,z);b.matched++;b.postPolicy+=Number(dt(r.frozenAt)>dt(policyAt));b.raw+=(r.p-r.y)**2;b.fit+=(q-r.y)**2;b.rawLoss-=Math.log(r.y?clip(r.p):1-clip(r.p));b.fitLoss-=Math.log(r.y?q:1-q);b.dates.add(pacificDay(r.startAt));v.n++;v.p+=q;v.y+=r.y;
 }
 const asOf=new Date().toISOString();for(const k of new Set(all.map(group))){const f=fit(all.filter(r=>group(r)===k&&dt(r.observedFinalAt)<dt(asOf)));if(f)fits[k]={...f,trainedAt:asOf,researchOnly:true};}
 return {kind:"exact_market_tier_side_calibration_v3",observations:all.length,fittedGroups:Object.keys(fits).length,parameters:fits,byGroup:Object.fromEntries(Object.entries(bins).map(([k,b])=>[k,{observed:b.observed,matched:b.matched,postPolicyClockMatches:b.postPolicy,distinctGames:b.games.size,distinctDates:b.dates.size,rawBrier:b.matched?b.raw/b.matched:null,calibratorBrier:b.matched?b.fit/b.matched:null,rawLogLoss:b.matched?b.rawLoss/b.matched:null,calibratorLogLoss:b.matched?b.fitLoss/b.matched:null,clusterCI:bootstrapGameBrierDifference([...b.games.values()]),bins:b.reliability.map((v,i)=>({lower:i/10,n:v.n,meanProbability:v.n?v.p/v.n:null,observed:v.n?v.y/v.n:null})),approved:false} ])),strictSameGroupOnly:true,halfPointBinaryOnly:true,postPolicyReplayedNotFrozen:true,approval:false};
}
module.exports={diagnostics,calibration,fit,group};
