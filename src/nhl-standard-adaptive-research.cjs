"use strict";
// Research only. Fixed feature/learning policy before future outcomes.
// Synthetic-line training and actual frozen-line evaluation are distinct.
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {mass}=require("./nhl-recent-rate-forward-v1.cjs");
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const KIND="nhl_standard_adaptive_research_v2";
const LINES={shotsOnGoal:[1.5,2.5,3.5],points:[.5,1.5,2.5],assists:[.5,1.5],blockedShots:[.5,1.5,2.5],goals:[.5,1.5],saves:[19.5,24.5,29.5,34.5]};
const NAMES=["form","rate","matchup","component","recent"];
const dim=NAMES.length+1,count=x=>Number.isInteger(x)&&x>=0,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,sum=a=>a.reduce((s,x)=>s+x,0),cap=(x,a,b)=>Math.max(a,Math.min(b,x)),dt=x=>typeof x==="string"?Date.parse(x):NaN;
const half=x=>Number.isFinite(x)&&x>=0&&Math.abs(x-Math.floor(x)-.5)<1e-8;
const logit=p=>Math.log(cap(p,.01,.99)/(1-cap(p,.01,.99)));
const sigmoid=x=>1/(1+Math.exp(-cap(x,-20,20)));
const id=r=>JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);
const day=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;};
const role=m=>m==="saves"?"goalie":"skater";
function eligible(prior,m){return prior.filter(g=>g.type===role(m)&&count(g[m])&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&g.timeOnIceSeconds<=3900).slice(-30);}
function factor(a,league){
 if(a.length<5||league.length<20||!(avg(league)>0))return null;
 return cap(1+(avg(a.slice(-15))/avg(league.slice(-800))-1)*Math.min(a.length,15)/(Math.min(a.length,15)+20),.8,1.2);
}
function features(prior,m,line,opponent,league,targetDay){
 if(!LINES[m]||!half(line))return null;
 const a=eligible(prior,m);if(a.length<8)return null;
 const old=a.slice(-20),five=a.slice(-5),ten=a.slice(-10),v=a.map(g=>g[m]);
 if(avg(ten.map(g=>g.timeOnIceSeconds))<(m==="saves"?2400:480))return null;
 const toi=.65*avg(ten.map(g=>g.timeOnIceSeconds))+.35*avg(five.map(g=>g.timeOnIceSeconds));
 const form=.5*avg(five.map(g=>g[m]))+.3*avg(ten.map(g=>g[m]))+.2*avg(v);
 const rate=sum(old.map(g=>g[m]))*toi/sum(old.map(g=>g.timeOnIceSeconds));
 const opp=factor(opponent,league),rest=(Date.parse(targetDay)-Date.parse(a.at(-1).gameDate))/86400000;
 const same=old.slice(1).filter((g,i)=>{const z=(Date.parse(g.gameDate)-Date.parse(old[i].gameDate))/86400000;return rest<=1?z<=1:z>1;});
 const restRate=same.length>=4?sum(same.map(g=>g[m]))*toi/sum(same.map(g=>g.timeOnIceSeconds)):rate;
 let component=rate,componentVerified=false;
 if(m==="points"||m==="assists"||m==="goals"){
  const exact=old.filter(g=>count(g.goals)&&count(g.assists)&&count(g.points)&&g.goals+g.assists===g.points);
  if(exact.length>=8){
   const exposure=sum(exact.map(g=>g.timeOnIceSeconds)),g=sum(exact.map(g=>g.goals))*toi/exposure,ass=sum(exact.map(g=>g.assists))*toi/exposure;
   // Prior component totals and paired empirical point distribution; optional
   // power-play intensity is an observed historical proxy, not today's role.
   component=(m==="points"?g+ass:m==="assists"?ass:g)*(opp??1);componentVerified=true;
  }
 }else if(m==="saves"){
  const exact=old.filter(g=>count(g.shotsAgainst)&&g.shotsAgainst>=g.saves);
  if(exact.length>=8&&sum(exact.map(g=>g.shotsAgainst))>0){
   const faced=sum(exact.map(g=>g.shotsAgainst))*toi/sum(exact.map(g=>g.timeOnIceSeconds)),sv=(sum(exact.map(g=>g.saves))+9)/(sum(exact.map(g=>g.shotsAgainst))+10);
   component=faced*sv*(opp??1);componentVerified=true;
  }
 }
 const estimates=[form,rate,rate*(opp??1),component,.75*avg(five.map(g=>g[m]))+.25*restRate];
 const probs=estimates.map(mu=>mass(v,mu,line)?.higher);
 if(probs.some(p=>!Number.isFinite(p)))return null;
 return {x:[1,...probs.map(logit)],probs,expectedTOI:toi,priorGames:a.length,opponentGames:opponent.length,opponentUsed:opp!==null,componentVerified,restDays:rest};
}
const initial=()=>[0,...NAMES.map(()=>1/NAMES.length)];
const probability=(w,x)=>sigmoid(sum(w.map((v,i)=>v*x[i])));
const newFit=()=>({w:initial(),n:0,games:new Set(),days:new Set()});
function update(f,batch){
 if(!batch.length)return;
 // Equal game weights; all gradients computed using weights before this day.
 const perGame=new Map();
 for(const r of batch){const a=perGame.get(r.gameId)||[];a.push(r);perGame.set(r.gameId,a);}
 const gradients=Array(dim).fill(0);
 for(const rows of perGame.values()){const g=Array(dim).fill(0);
  for(const r of rows){const e=probability(f.w,r.x)-r.y;for(let j=0;j<dim;j++)g[j]+=e*r.x[j]/rows.length;}
  for(let j=0;j<dim;j++)gradients[j]+=g[j]/perGame.size;
 }
 const eta=.08/Math.sqrt(1+f.days.size/20),anchor=initial();
 f.w=f.w.map((w,i)=>cap(w-eta*(gradients[i]+.04*(w-anchor[i])),-2,2));
 f.n+=batch.length;for(const r of batch){f.games.add(r.gameId);f.days.add(r.day);}
}
function prepare(history,schedule,cutoff){
 const rows=uniqueRows(history).filter(g=>g.gameDate<cutoff),days=new Map(),players=new Map(),team=new Map(),league={},fit=Object.fromEntries(Object.keys(LINES).map(m=>[m,newFit()])),out={},idx=scheduleIndex(schedule);
 for(const g of rows){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 const opponentFor=(t,m)=>team.get(canonical(t))?.[m]||[];
 for(const [d,rs] of days){
  const batch=Object.fromEntries(Object.keys(LINES).map(m=>[m,[]])),events=new Map();
  for(const g of rs){
   const opp=scheduledOpponent(g,idx);
   for(const [m,lines] of Object.entries(LINES)){
    if(!count(g[m])||g.type!==role(m))continue;
    for(const l of lines){
     const f=features(players.get(g.playerId)||[],m,l,opponentFor(opp,m),league[m]||[],d);if(!f)continue;
     const y=Number(g[m]>l),z=fit[m];
     // All evaluation is before this day's update. Earlier dates may train.
     if(z.games.size>=30&&z.days.size>=10){
      const q=probability(z.w,f.x),fixed=avg(f.probs),base=f.probs[0],o=out[m]??={n:0,games:new Set(),days:new Set(),base:0,fixed:0,learned:0,baseLoss:0,fixedLoss:0,learnedLoss:0,opponent:0};
      const loss=p=>-Math.log(cap(y?p:1-p,1e-8,1));o.n++;o.games.add(g.gameId);o.days.add(d);o.base+=(base-y)**2;o.fixed+=(fixed-y)**2;o.learned+=(q-y)**2;o.baseLoss+=loss(base);o.fixedLoss+=loss(fixed);o.learnedLoss+=loss(q);o.opponent+=Number(f.opponentUsed);
     }
     batch[m].push({gameId:g.gameId,day:d,x:f.x,y});
    }
   }
   if(g.type==="skater"){const a=events.get(g.gameId)||[];a.push(g);events.set(g.gameId,a);}
  }
  for(const m of Object.keys(LINES))update(fit[m],batch[m]);
  for(const g of rs){const a=players.get(g.playerId)||[];a.push(g);players.set(g.playerId,a.slice(-40));}
  for(const event of events.values()){
   const clubs=[...new Set(event.map(g=>canonical(g.team)))];if(clubs.length!==2||clubs.some(t=>!t||event.filter(g=>canonical(g.team)===t).length!==18))continue;
   for(const t of clubs){const own=event.filter(g=>canonical(g.team)===t),other=event.filter(g=>canonical(g.team)!==t),a=team.get(t)||{};
    for(const m of Object.keys(LINES)){const source=["saves","blockedShots"].includes(m)?own:other,key=["saves","blockedShots"].includes(m)?"shotsOnGoal":m;
     if(!source.every(g=>count(g[key])))continue;
     const v=sum(source.map(g=>g[key]));(a[m]??=[]).push(v);(league[m]??=[]).push(v);
    }team.set(t,a);
   }
  }
 }
 return {fit,players,team,league,cutoff,historical:{kind:"nhl_adaptive_synthetic_walk_forward_v2",cutoff,byMarket:Object.fromEntries(Object.entries(out).map(([m,o])=>[m,{thresholds:o.n,distinctGames:o.games.size,distinctDates:o.days.size,matchupThresholds:o.opponent,formBrier:o.base/o.n,fixedEnsembleBrier:o.fixed/o.n,learnedBrier:o.learned/o.n,formLogLoss:o.baseLoss/o.n,fixedLogLoss:o.fixedLoss/o.n,learnedLogLoss:o.learnedLoss/o.n}])),syntheticThresholds:true,asOfHistoricalAvailabilityVerified:false,conditionalOnAppearance:true,modelPromoted:false}};
}
// Current-season source experiment: expected goals plus prior assist
// involvement, scaled by teammate scoring opportunity and projected PP role.
// Do not reconstruct postgame MoneyPuck or DFO snapshots for historical fits.
function pointSource(p,prior,f,approved,asOf){
 if(!["points","assists","goals"].includes(p.market)||!approved)return null;
 const t=dt(asOf),start=dt(p.gameStartAt),mp=approved.moneyPuck?.skaters,teams=approved.moneyPuck?.teams;
 const fresh=x=>Number.isFinite(dt(x))&&dt(x)<=t&&dt(x)<start&&t-dt(x)<=8*3600000;
 if(!fresh(approved.generatedAt)||!fresh(mp?.sourceCapturedAt)||!fresh(teams?.sourceCapturedAt))return null;
 const x=mp.rows?.[String(p.playerId)],own=teams.rows?.[canonical(p.team)],opp=teams.rows?.[canonical(p.opponent)];
 const good=(r,src,k)=>r?.gamesPlayed>=5&&fresh(r.sourceObservedAt)&&dt(r.sourceObservedAt)<=dt(src.sourceCapturedAt)&&Number.isFinite(r[k])&&r[k]>=0&&r[k]<30;
 if(canonical(x?.team)!==canonical(p.team)||!good(x,mp,"xGoalsPer60")||!good(own,teams,"xGoalsForPer60")||!good(opp,teams,"xGoalsAgainstPer60"))return null;
 const lg=Object.values(teams.rows||{}).filter(z=>good(z,teams,"xGoalsForPer60")&&good(z,teams,"xGoalsAgainstPer60"));
 if(lg.length<20)return null;
 const reference=avg(lg.map(z=>z.xGoalsForPer60));if(!(reference>0))return null;
 const a=eligible(prior,p.market).filter(g=>count(g.goals)&&count(g.assists)&&count(g.points)&&g.points===g.goals+g.assists);
 if(a.length<8)return null;
 const o=a.slice(-20),ice=sum(o.map(g=>g.timeOnIceSeconds)),goal=sum(o.map(g=>g.goals))*f.expectedTOI/ice,ass=sum(o.map(g=>g.assists))*f.expectedTOI/ice;
 const attack=cap(1+.4*(own.xGoalsForPer60/reference-1)+.3*(opp.xGoalsAgainstPer60/reference-1),.8,1.2);
 const teamLine=approved.dailyFaceoff?.lineups?.[canonical(p.team)],line=teamLine?.players?.filter(z=>z.playerId===p.playerId&&canonical(z.team)===canonical(p.team));
 let pp=null,linemateCount=0,linemateFactor=1;
 if(fresh(teamLine?.sourceCapturedAt)&&fresh(teamLine?.sourceUpdatedAt)&&dt(teamLine.sourceUpdatedAt)<=dt(teamLine.sourceCapturedAt)&&line?.length===1&&!line[0].injuryStatus&&!line[0].gameTimeDecision){
  const role=line[0].roles||[],ev=role.filter(z=>z.categoryIdentifier==="ev"),units=role.filter(z=>z.categoryIdentifier==="pp");
  if(units.length===1&&/^pp[12]$/.test(units[0].groupIdentifier))pp=units[0].groupIdentifier;
  if(ev.length===1&&/^[fd][1-4]$/.test(ev[0].groupIdentifier)){
   const roster=teamLine.players.filter(z=>z.playerId!==p.playerId&&!z.injuryStatus&&!z.gameTimeDecision&&canonical(z.team)===canonical(p.team)&&z.roles?.some(y=>y.categoryIdentifier==="ev"&&y.groupIdentifier===ev[0].groupIdentifier));
   const unique=[...new Set(roster.map(z=>z.playerId))].map(id=>mp.rows?.[String(id)]).filter(z=>canonical(z?.team)===canonical(p.team)&&good(z,mp,"xGoalsPer60"));
   linemateCount=unique.length;
   if(unique.length>=1){const refs=Object.values(mp.rows||{}).filter(z=>canonical(z.team)===canonical(p.team)&&good(z,mp,"xGoalsPer60"));if(refs.length>=8&&avg(refs.map(z=>z.xGoalsPer60))>0)linemateFactor=cap(1+.15*(avg(unique.map(z=>z.xGoalsPer60))/avg(refs.map(z=>z.xGoalsPer60))-1),.9,1.1);}
  }
 }
 const ppRows=o.filter(g=>count(g.powerPlayPoints)&&g.powerPlayPoints<=g.points),share=ppRows.length>=8&&sum(ppRows.map(g=>g.points))>0?sum(ppRows.map(g=>g.powerPlayPoints))/sum(ppRows.map(g=>g.points)):0;
 const deployment=1+(pp==="pp1"?.08:pp==="pp2"?.03:0)*share;
 const g=(.65*goal+.35*x.xGoalsPer60*f.expectedTOI/3600)*attack,assists=ass*attack*linemateFactor*deployment;
 const mu=p.market==="points"?g+assists:p.market==="assists"?assists:g;
 const q=mass(a.map(z=>z[p.market]),mu,p.line)?.higher;
 return Number.isFinite(q)?{higher:q,linemateCount,projectedPP:pp,sourceAt:approved.generatedAt,projectedNotConfirmed:true}:null;
}
function freeze(s,h,schedule,observations=null,prepared=null,approved=null,archives=[],transfer=null,retrospectiveTransfer=false){
 if(s?.individualPropSelectionPolicy!==POLICY||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps)||!Number.isFinite(dt(s.generatedAt)))throw Error("original snapshot required");
 const c=prepared||prepare(h,schedule,day(s.generatedAt)),rows=[],seen=new Set(),exclusions={};
 const skip=k=>exclusions[k]=(exclusions[k]||0)+1;
 for(const o of s.individualPropSelections){
  if(o.tier!=="Standard"||!LINES[o.market])continue;
  const k=id(o),raw=s.rankedProps.filter(p=>id(p)===k&&p.capturedAt===o.capturedAt),selected=raw.filter(p=>p.lean===o.lean);
  if(seen.has(k)||selected.length!==1||raw.some(p=>p.gameStartAt!==o.gameStartAt||canonical(p.team)!==canonical(o.team)||canonical(p.opponent)!==canonical(o.opponent))||dt(o.capturedAt)>dt(s.generatedAt)||dt(o.gameStartAt)-dt(s.generatedAt)<900000){skip("identity_or_clock");continue;}
  seen.add(k);
  const p=selected[0],base=p.probabilities,variants=s.standardTripleChallenger?.rows?.filter(x=>id(x)===k);
  if(!half(o.line)||!Number.isFinite(dt(o.capturedAt))||!Number.isFinite(dt(o.gameStartAt))||!base||![base.higher,base.lower,base.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||Math.abs(base.higher+base.lower+base.push-1)>1e-5||base.push!==0){skip("integer_or_invalid_probability");continue;}
  const f=features(c.players.get(o.playerId)||[],o.market,o.line,c.team.get(canonical(o.opponent))?.[o.market]||[],c.league[o.market]||[],c.cutoff);
  if(!f){skip("insufficient_role_history");continue;}
  const fit=c.fit[o.market],fixed=avg(f.probs),learned=fit.games.size>=30&&fit.days.size>=10?probability(fit.w,f.x):null;
  const v=variants?.length===1?variants[0].variants:null;
  const contextNames=o.market==="shotsOnGoal"?["sogAttempts","sogOpportunity","matchup"]:["usage","matchup","distribution"];
  const context=contextNames.map(n=>({n,v:v?.[n]})).filter(x=>x.v?.status==="research_only"&&Number.isFinite(x.v.probabilities?.higher)&&x.v.probabilities.push===0);
  const source=(context.length>=2)?(.65*(learned??fixed)+.35*avg(context.map(x=>x.v.probabilities.higher))):null;
  // Apply only a same-market, same-side residual from earlier observed finals.
  const originalSide=o.lean,prior=(observations?.firstObserved||[]).filter(x=>x.tier==="Standard"&&x.side===originalSide&&x.gameId!==o.gameId&&dt(x.observedFinalAt)<dt(s.generatedAt)&&dt(x.observedFinalAt)>dt(x.startAt)&&!(observations.quarantined||[]).includes(x.id));
  const adjusted=require("./forward-calibration-evidence.cjs").forecast({market:o.market,tier:"Standard",side:originalSide,period:"full_game",p:base[originalSide.toLowerCase()]},prior);
  const calibrated=adjusted?(originalSide==="Higher"?adjusted.probability:1-adjusted.probability):null;
  const sides=[...new Set(raw.filter(x=>["Higher","Lower"].includes(x.lean)&&x.probabilitySafety?.researchLineupEligible!==false&&x.roleEvidence?.eligibleForResearchLineup!==false&&x.researchEligibility!=="watchlist").map(x=>x.lean))];
  const point=pointSource(o,c.players.get(o.playerId)||[],f,approved,s.generatedAt);
  const benchmark=require("./archived-prop-market-benchmark.cjs").beforeFreeze({...o,player:p.player,sourcePlayerName:p.sourcePlayerName,providerPlayerId:p.providerPlayerId,projectionId:p.projectionId},archives,s.generatedAt);
  const historical=require("./nhl-standard-season-transfer.cjs").forecast(transfer,o,f,s.generatedAt,{retrospective:retrospectiveTransfer});
  const predictions={champion:base.higher,fixed,learned,sourceContext:source,pointsSource:point?.higher??null,observedBiasChallenger:calibrated,sportsbookConditionalBenchmark:benchmark?.higher??null,threeSeasonSelected:historical?.higher??null,...Object.fromEntries(Object.entries(historical?.individual||{}).map(([k,v])=>["threeSeason_"+k,v]))};
  const choose=q=>q===null||Math.abs(q-.5)<1e-8?null:q>.5?"Higher":"Lower";
  const preferred=choose(learned??fixed),agree=f.probs.filter(q=>choose(q)===preferred).length,confidence=preferred==="Higher"?(learned??fixed):1-(learned??fixed);
  const allowed=learned!==null&&preferred&&sides.includes(preferred)&&agree>=4&&confidence>=.60&&f.opponentUsed&&o.market!=="saves";
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,line:o.line,tier:o.tier,capturedAt:o.capturedAt,gameStartAt:o.gameStartAt,originalSide,availableSides:sides,predictions,selectiveSide:allowed?preferred:null,priorGames:f.priorGames,opponentGames:f.opponentGames,sourceVariants:context.map(x=>x.n),pointsSourceEvidence:point,sportsbookBenchmark:benchmark,transferEvidence:historical,trainingGames:fit.games.size,trainingDates:fit.days.size,
   expectedIceSeconds:f.expectedTOI,priorComponentVerified:f.componentVerified,
   restDaysFromLastAppearance:f.restDays,opponentHistoryUsed:f.opponentUsed,
   calibrationApproved:false});
 }
 return {kind:KIND,generatedAt:s.generatedAt,rows,exclusions,researchOnly:true,modelPromoted:false,trainedOnSyntheticThresholds:true,conditionalOnAppearance:true};
}
function score(frames,h,policyAt,{retrospective=false,schedule=null,transfer=null}={}){
 const contexts=new Map(),groups={},seen=new Set(),excluded={},skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||s.individualPropSelectionPolicy!==POLICY)continue;
  if(!retrospective&&(!Number.isFinite(dt(policyAt))||dt(s.generatedAt)<=dt(policyAt)))continue;
  let v=s.standardAdaptiveResearchV2;
  if(retrospective){try{const d=day(s.generatedAt);if(!contexts.has(d))contexts.set(d,prepare(h,schedule,d));v=freeze(s,h,schedule,null,contexts.get(d),null,[],transfer,true);}catch{skip("replay_refused");continue;}}
  if(v?.kind!==KIND||v.generatedAt!==s.generatedAt||!Array.isArray(v.rows)||v.modelPromoted!==false)continue;
  for(const x of v.rows){
   const k=id(x),o=(s.individualPropSelections||[]).filter(r=>id(r)===k&&r.lean===x.originalSide&&r.capturedAt===x.capturedAt&&r.gameStartAt===x.gameStartAt),raw=(s.rankedProps||[]).filter(r=>id(r)===k&&r.lean===x.originalSide&&r.capturedAt===x.capturedAt);
   if(seen.has(k)||o.length!==1||raw.length!==1||x.tier!=="Standard"||!half(x.line)||x.predictions?.champion!==raw[0].probabilities?.higher||dt(x.gameStartAt)-dt(f.firstCommittedAt)<900000){skip("invalid_or_duplicate");continue;}seen.add(k);
   const a=groups[x.market]??={registered:0,resolved:0,decided:0,originalHits:0,higher:0,lower:0,selectedRegistered:0,selected:0,selectedHits:0,selectedChampionHits:0,selectedHigher:0,selectedLower:0,games:new Set(),models:{}};
   a.registered++;if(x.selectiveSide)a.selectedRegistered++;
   const games=(h?.players?.[String(x.playerId)]?.games||[]).filter(g=>g.gameId===x.gameId&&["FINAL","OFF"].includes(g.gameState)&&g.type===role(x.market)&&g.timeOnIceSeconds>0&&count(g[x.market]));
   if(games.length!==1)continue;
   const y=Number(games[0][x.market]>x.line),actual=y?"Higher":"Lower";
   a.resolved++;a.decided++;a.games.add(x.gameId);a.originalHits+=Number(x.originalSide===actual);a.higher+=y;a.lower+=1-y;
   const sides=new Set((s.rankedProps||[]).filter(r=>id(r)===k&&r.capturedAt===x.capturedAt&&r.probabilitySafety?.researchLineupEligible!==false&&r.roleEvidence?.eligibleForResearchLineup!==false&&r.researchEligibility!=="watchlist").map(r=>r.lean));
   if(x.selectiveSide&&sides.has(x.selectiveSide)){a.selected++;a.selectedHits+=Number(x.selectiveSide===actual);a.selectedChampionHits+=Number(x.originalSide===actual);a.selectedHigher+=y;a.selectedLower+=1-y;}
   const base=x.predictions.champion,loss=q=>-Math.log(cap(y?q:1-q,1e-8,1));
   for(const [m,q] of Object.entries(x.predictions)){if(!Number.isFinite(q)||q<0||q>1)continue;const z=a.models[m]??={n:0,b:0,base:0,l:0,baseLoss:0,d:0,hits:0,championHits:0,games:new Set(),bins:Array.from({length:10},()=>({n:0,p:0,y:0})),deltas:new Map()};
    z.n++;z.games.add(x.gameId);z.b+=(q-y)**2;z.base+=(base-y)**2;z.l+=loss(q);z.baseLoss+=loss(base);const bin=z.bins[Math.min(9,Math.floor(q*10))];bin.n++;bin.p+=q;bin.y+=y;const delta=z.deltas.get(x.gameId)||{n:0,diff:0};delta.n++;delta.diff+=(q-y)**2-(base-y)**2;z.deltas.set(x.gameId,delta);const side=q>.5?"Higher":q<.5?"Lower":null;if(side&&sides.has(side)){z.d++;z.hits+=Number(side===actual);z.championHits+=Number(x.originalSide===actual);}
   }
  }
 }
 return {kind:KIND,status:retrospective?"retrospective_reconstructed_exact_lines":"original_frozen_prospective_only",byMarket:Object.fromEntries(Object.entries(groups).map(([m,a])=>[m,{registered:a.registered,resolved:a.resolved,distinctGames:a.games.size,originalHits:a.originalHits,alwaysHigherHits:a.higher,alwaysLowerHits:a.lower,selective:{registered:a.selectedRegistered,decided:a.selected,hits:a.selectedHits,registeredCoverage:a.registered?a.selectedRegistered/a.registered:null,coverage:a.decided?a.selected/a.decided:null,matchedChampionHits:a.selectedChampionHits,matchedHigherHits:a.selectedHigher,matchedLowerHits:a.selectedLower},models:Object.fromEntries(Object.entries(a.models).map(([n,z])=>[n,{matched:z.n,distinctGames:z.games.size,brier:z.b/z.n,matchedChampionBrier:z.base/z.n,logLoss:z.l/z.n,matchedChampionLogLoss:z.baseLoss/z.n,availableSideDecisions:z.d,hits:z.hits,matchedChampionHits:z.championHits,reliability:z.bins.map((v,i)=>({bin:i,n:v.n,meanForecast:v.n?v.p/v.n:null,observedHigher:v.n?v.y/v.n:null})),gameClusterDifference95:require('./nhl-period-count-model.cjs').bootstrapGameBrierDifference([...z.deltas.values()])}]))}])),excluded,modelPromoted:false,calibrated:false,actualPlatformSettlementVerified:false,retrospective};
}
module.exports={KIND,LINES,features,update,newFit,prepare,pointSource,freeze,score};
