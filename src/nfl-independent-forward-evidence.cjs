"use strict";
// Independent source cohort. Freeze only on new actual-time captures.
// Later scoring cannot turn the old preview into a prospective prediction.
const {SPECS,marketValue}=require("../scripts/backtest-nfl-historical-stats.cjs");
const {officialKickoffMatches}=require("./nfl-independent-source-preview.cjs");
const {historicalFeatureSet}=require("./nfl-pregame-matchup-challenger.cjs");
const {candidate}=require("./nfl-empirical-threshold-shadow.cjs");
const {scenario}=require("./nhl-lineup-format-scenario.cjs");
const specs=new Map(SPECS.map(x=>[x.id,x])),OUT=["higher","lower","push"];
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=p=>JSON.stringify([p.gameId,p.historicalPlayerId,p.market,p.line,p.tier]);
const vector=v=>OUT.every(k=>Number.isFinite(v?.[k])&&v[k]>=0&&v[k]<=1)&&Math.abs(OUT.reduce((a,k)=>a+v[k],0)-1)<1e-6;
const shrink=v=>({higher:.5*v.higher+.25*(1-v.push),lower:.5*v.lower+.25*(1-v.push),push:v.push});
const KIND="nfl_independent_scoped_original_probability_research_v1";
const allowed=(p)=>Number.isFinite(p.probability)&&p.probability>0&&p.probability<1&&(p.tier==="Standard"?p.probability>.5:["Goblin","Demon"].includes(p.tier)&&p.side==="Higher");
function freeze(report,{weeklyRows,teamWeekly=[],snapCounts=[],schedule}={}){
 const t=dt(report?.generatedAt);
 const tier=report?.requestedTier??"standard",tierName=String(tier)[0]?.toUpperCase()+String(tier).slice(1);
 if(!["standard","goblin","demon"].includes(tier)||report?.kind!==(tier==="standard"?"nfl_independent_standard_research_preview_v1":"nfl_independent_alternate_research_preview_v1")||report.publicReleaseApproved!==false||
  report.completeScopedPagination!==true||!Number.isFinite(t)||!Number.isFinite(dt(report.boardAt))||
  t<dt(report.boardAt)||t-dt(report.boardAt)>1800000||!Array.isArray(report.rows)||!Array.isArray(schedule)||!Array.isArray(weeklyRows))throw Error("Original independent preview required");
 const common=require("./priority-common-ml-shadow-v1.cjs"),commonArtifact=common.readCommitted(report.generatedAt);
 const mapped=new Map(),ambiguous=new Set();
 const matchup=require("./nfl-partner-board-research.cjs"),ablation=require("./matchup-factor-ablation-v1.cjs"),cache=new Map();
 const priority=require("./nfl-priority-volume-v1.cjs"),volume=priority.teamVolume(weeklyRows,teamWeekly,schedule),targetIndex=require("./nfl-target-share-workload-v1.cjs").teamTargets(weeklyRows,teamWeekly,schedule);
 for(const p of report.rows){
  const side=p.side?.toLowerCase(),g=officialKickoffMatches({eventStartsAt:p.eventStartsAt,team:p.team,matchup:p.opponent},schedule);
  if(!g||g.gameId!==p.gameId||!vector(p.probabilities)||!["higher","lower"].includes(side)||
    Math.abs(p.probabilities[side]-p.probability)>1e-6||!allowed(p)||p.tier!==tierName||p.autoPickEligible!==false||
    dt(p.capturedAt)!==dt(report.boardAt)||dt(p.eventStartsAt)-t<900000||!specs.has(p.market)||specs.get(p.market).family==="kicking")continue;
  const k=key(p);if(mapped.has(k)){mapped.delete(k);ambiguous.add(k);}if(ambiguous.has(k))continue;
  let context=null;
  const raw={...p,season:g.season,week:g.week,historicalProjection:p.projection,selectedSide:p.side,sourceGameId:p.gameId};
  const f=historicalFeatureSet(raw,{teamWeekly,playerWeekly:weeklyRows,snapCounts});
  if(f.status==="partial_past_week_context"){
   const delta=.2*(f.opponentDefenseFactor-1)+.12*(f.teamOffenseFactor-1)+.12*((f.paceFactor??1)-1)+.1*((f.playerUsageFactor??1)-1);
   const adjusted=p.projection*Math.max(.85,Math.min(1.15,1+delta));
   const v=candidate({...raw,historicalProjection:adjusted},weeklyRows,report.generatedAt);
   if(v&&vector(v.probabilities))context={projection:adjusted,probabilities:v.probabilities,features:f,injuryEvidenceVerified:false};
  }
  let workloadShadow=null,priorityVolumeShadow=null,commonML=null;
  const position=weeklyRows.filter(x=>String(x.player_id)===String(p.historicalPlayerId)&&(x.recent_team||x.team)===p.team&&(Number(x.season)<g.season||Number(x.season)===g.season&&Number(x.week)<g.week)).sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week)).at(-1)?.position;
  if(position&&Number.isFinite(p.projection)){
   const ck=JSON.stringify([g.season,g.week,p.market,position]);
   if(!cache.has(ck))cache.set(ck,matchup.matchupSample(weeklyRows,schedule,g.season,g.week,specs.get(p.market),position));
   const samples=cache.get(ck),own=samples.filter(x=>x.playerId===String(p.historicalPlayerId)&&x.team===p.team);
   commonML=common.nfl(p,own,commonArtifact,report.generatedAt);
   const z=p.market==="passing_attempts"?priority.passingAttempts(own,volume,p.team,p.opponent,g.season,g.week):p.market==="receiving_yards"?priority.receiving(own,targetIndex,samples,p.team,p.opponent,g.season,g.week):null;
   if(z&&Number.isFinite(z.projection))priorityVolumeShadow={...z,position,side:z.projection>p.line?"Higher":z.projection<p.line?"Lower":null,originalLine:p.line,researchOnly:true,calibrated:false};
   const w=ablation.nflOpportunity(own,p.projection);
   if(w)workloadShadow={projection:w.projection,expectedOpportunities:w.expectedOpportunities,side:w.projection>p.line?"Higher":w.projection<p.line?"Lower":null,originalLine:p.line,researchOnly:true,calibrated:false};
  }
  mapped.set(k,{...p,season:g.season,week:g.week,fixedShrink:shrink(p.probabilities),context,workloadShadow,priorityVolumeShadow,commonML});
 }
 const selected=[...mapped.values()].sort((a,b)=>b.probability-a.probability||key(a).localeCompare(key(b)));
 // Conditional scenario only, no same game or player; same candidates may
 // maximize both reference objectives. No production probabilities or EV.
 const representatives=[],games=new Set(),players=new Set();
 for(const r of selected){if(r.tier!=="Standard"||r.probabilities.push!==0||games.has(r.gameId)||players.has(r.historicalPlayerId))continue;
  games.add(r.gameId);players.add(r.historicalPlayerId);representatives.push(r);}
 const formats={power:{},flex:{}};
 for(const format of ["power","flex"])for(let n=format==="power"?2:3;n<=6;n++)if(representatives.length>=n){
  const picks=representatives.slice(0,n);formats[format][n]={keys:picks.map(key),scenario:scenario(picks.map(x=>x.probability),format)};
 }
 return {kind:KIND,requestedTier:tier,generatedAt:report.generatedAt,boardAt:report.boardAt,rows:selected,formats,
  conditionalOnPlaying:true,researchOnly:true,calibrated:false,autoPickEligible:false,publicReleaseApproved:false};
}
function score(frames,{weeklyRows,schedule,policyAt}={}){
 if(!Number.isFinite(dt(policyAt))||!Array.isArray(frames)||!Array.isArray(weeklyRows)||!Array.isArray(schedule))throw Error("First policy and final stats required");
 const marketReliability={},firstObservationInputs=[],workloadByMarket={},priorityVolumeByMarket={},priorityVolumeByPosition={},commonMLByMarket={};
 const out={registered:0,pending:0,resolved:0,pushes:0,correct:0,rawBrier:0,shrinkBrier:0,rawLogLoss:0,shrinkLogLoss:0,contextPaired:0,contextBrier:0,contextRawBrier:0},seen=new Set(),gameIds=new Set(),formats={},seenSlips=new Set(),resolvedScenarioObservations=[],byTier={Standard:{registered:0,resolved:0,correct:0,rawBrierSum:0,shrinkBrierSum:0,rawLossSum:0,shrinkLossSum:0,alwaysHigher:0,alwaysLower:0,pushes:0,contextPaired:0,contextBrierSum:0,contextRawBrierSum:0},Goblin:{registered:0,resolved:0,correct:0,rawBrierSum:0,shrinkBrierSum:0,rawLossSum:0,shrinkLossSum:0,alwaysHigher:0,alwaysLower:0,pushes:0,contextPaired:0,contextBrierSum:0,contextRawBrierSum:0},Demon:{registered:0,resolved:0,correct:0,rawBrierSum:0,shrinkBrierSum:0,rawLossSum:0,shrinkLossSum:0,alwaysHigher:0,alwaysLower:0,pushes:0,contextPaired:0,contextBrierSum:0,contextRawBrierSum:0}};
 const brier=(v,y)=>OUT.reduce((s,k)=>s+(v[k]-Number(y===k))**2,0);
 const loss=(v,y)=>-Math.log(Math.max(1e-8,v[y]));
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,t=dt(s?.generatedAt),a=dt(f.firstCommittedAt);
  if(s?.kind!==KIND||s.researchOnly!==true||s.calibrated!==false||s.autoPickEligible!==false||
    !Number.isFinite(t)||!Number.isFinite(a)||t<=dt(policyAt)||a<t||a-t>=900000||f.gitHistoryCount!==1||!Array.isArray(s.rows))continue;
  const results=new Map(),valid=new Map(),keyCounts=new Map();
  for(const p of s.rows){const k=key(p);keyCounts.set(k,(keyCounts.get(k)||0)+1);}
  for(const p of s.rows){
   const k=key(p),side=p.side?.toLowerCase(),g=officialKickoffMatches({eventStartsAt:p.eventStartsAt,team:p.team,matchup:p.opponent},schedule);
   if(keyCounts.get(k)!==1||!Number.isFinite(p.line)||!g||g.gameId!==p.gameId||g.season!==p.season||g.week!==p.week||!allowed(p)||p.tier!==(String(s.requestedTier??"standard")[0].toUpperCase()+String(s.requestedTier??"standard").slice(1))||
    dt(p.capturedAt)!==dt(s.boardAt)||dt(p.capturedAt)>t||dt(p.eventStartsAt)-a<900000||
    !vector(p.probabilities)||!vector(p.fixedShrink)||!["higher","lower"].includes(side)||
    !allowed(p)||Math.abs(p.probabilities[side]-p.probability)>1e-6||
    OUT.some(x=>Math.abs(p.fixedShrink[x]-shrink(p.probabilities)[x])>1e-6))continue;
   const game=schedule.filter(x=>x.game_id===p.gameId&&Number.isFinite(x.home_score)&&Number.isFinite(x.away_score)&&x.game_type==="REG");
   const spec=specs.get(p.market),rows=weeklyRows.filter(x=>x.player_id===p.historicalPlayerId&&Number(x.season)===p.season&&Number(x.week)===p.week&&(x.recent_team||x.team)===p.team);
   // No participation inference from absent stats. Conservative positive
   // offensive opportunity evidence; zero-opportunity appearances stay pending.
   const actual=game.length===1&&rows.length===1&&spec&&["attempts","carries","targets","receptions"].some(x=>Number(rows[0][x])>0)?marketValue(spec,rows[0]):null;
   const y=Number.isFinite(actual)?actual>p.line?"higher":actual<p.line?"lower":"push":null;
   valid.set(k,p);results.set(k,y);
   if(seen.has(k))continue;seen.add(k);out.registered++;byTier[p.tier].registered++;
   const mk=p.market+"|"+p.tier+"|"+p.side,m=marketReliability[mk]??={registered:0,resolved:0,pushes:0,hits:0,brier:0,loss:0,confidence:0,games:new Set(),bins:Array.from({length:10},()=>({n:0,p:0,y:0}))};m.registered++;
   if(!y){out.pending++;continue;}
   firstObservationInputs.push({id:k,gameId:p.gameId,playerId:p.historicalPlayerId,team:p.team,market:p.market,period:"full_game",tier:p.tier,side:p.side,p:p.probabilities[side],y:Number(y===side),frozenAt:f.firstCommittedAt,startAt:p.eventStartsAt});
   const h=Number(y===side),prob=p.probabilities[side],bin=m.bins[Math.min(9,Math.floor(prob*10))];
   m.resolved++;m.pushes+=Number(y==="push");m.hits+=h;m.brier+=(prob-h)**2;m.loss-=Math.log(Math.max(1e-8,h?prob:1-prob));m.confidence+=prob;m.games.add(p.gameId);bin.n++;bin.p+=prob;bin.y+=h;
   const b=byTier[p.tier];b.resolved++;b.correct+=Number(y===side);b.rawBrierSum+=brier(p.probabilities,y);b.shrinkBrierSum+=brier(p.fixedShrink,y);
   b.rawLossSum+=loss(p.probabilities,y);b.shrinkLossSum+=loss(p.fixedShrink,y);b.alwaysHigher+=Number(y==="higher");b.alwaysLower+=Number(y==="lower");b.pushes+=Number(y==="push");
   const ml=p.commonML;
   if(p.tier==="Standard"&&ml?.kind==="priority_common_features_logistic_shadow_v1"&&ml.researchOnly===true&&ml.calibrated===false&&ml.modelPromoted===false&&ml.market==="nfl_"+p.market&&ml.line===p.line&&Number.isFinite(ml.higher)&&ml.higher>=0&&ml.higher<=1&&dt(ml.artifactFirstGitAt)<=t&&y!=="push"&&p.line%1===.5){
    const a=commonMLByMarket[p.market+"|"+p.line]??={decided:0,originalWins:0,mlWins:0,originalBrierSum:0,mlBrierSum:0,alwaysHigher:0,alwaysLower:0};
    const actual=Number(y==="higher");a.decided++;a.originalWins+=Number(y===side);a.mlWins+=Number((ml.higher>=.5)===!!actual);a.originalBrierSum+=(p.probabilities.higher-actual)**2;a.mlBrierSum+=(ml.higher-actual)**2;a.alwaysHigher+=actual;a.alwaysLower+=1-actual;
   }
   const z=p.priorityVolumeShadow;
   if(p.tier==="Standard"&&["passing_attempts","receiving_yards"].includes(p.market)&&z?.researchOnly===true&&z.calibrated===false&&z.originalLine===p.line&&Number.isFinite(z.projection)&&["Higher","Lower"].includes(z.side)&&z.side===(z.projection>p.line?"Higher":z.projection<p.line?"Lower":null)&&y!=="push"){
    const targets=[priorityVolumeByMarket[p.market]??={decided:0,originalWins:0,challengerWins:0,alwaysHigher:0,alwaysLower:0}];
    if(["QB","WR","TE","RB","FB"].includes(z.position))targets.push(priorityVolumeByPosition[p.market+"|"+z.position]??={decided:0,originalWins:0,challengerWins:0,alwaysHigher:0,alwaysLower:0});
    for(const m of targets){m.decided++;m.originalWins+=Number(y===side);m.challengerWins+=Number(y===z.side.toLowerCase());m.alwaysHigher+=Number(y==="higher");m.alwaysLower+=Number(y==="lower");}
   }
   const w=p.workloadShadow;
   if(p.tier==="Standard"&&w?.researchOnly===true&&w.calibrated===false&&w.originalLine===p.line&&Number.isFinite(w.projection)&&["Higher","Lower"].includes(w.side)&&w.side===(w.projection>p.line?"Higher":w.projection<p.line?"Lower":null)&&y!=="push"){
    const m=workloadByMarket[p.market]??={decided:0,originalWins:0,workloadWins:0,alwaysHigher:0,alwaysLower:0};
    m.decided++;m.originalWins+=Number(y===side);m.workloadWins+=Number(y===w.side.toLowerCase());m.alwaysHigher+=Number(y==="higher");m.alwaysLower+=Number(y==="lower");
   }
   out.resolved++;out.pushes+=Number(y==="push");out.correct+=Number(y===side);gameIds.add(p.gameId);
   out.rawBrier+=brier(p.probabilities,y);out.shrinkBrier+=brier(p.fixedShrink,y);
   out.rawLogLoss+=loss(p.probabilities,y);out.shrinkLogLoss+=loss(p.fixedShrink,y);
   if(vector(p.context?.probabilities)){out.contextPaired++;out.contextBrier+=brier(p.context.probabilities,y);out.contextRawBrier+=brier(p.probabilities,y);b.contextPaired++;b.contextBrierSum+=brier(p.context.probabilities,y);b.contextRawBrierSum+=brier(p.probabilities,y);}
  }
  for(const format of ["power","flex"])for(let n=format==="power"?2:3;n<=6;n++){
   const slip=s.formats?.[format]?.[n],keys=slip?.keys;
   if(!Array.isArray(keys)||keys.length!==n||new Set(keys).size!==n||!keys.every(k=>valid.has(k)))continue;
   const picks=keys.map(k=>valid.get(k));
   if(new Set(picks.map(x=>x.gameId)).size!==n||new Set(picks.map(x=>x.historicalPlayerId)).size!==n||picks.some(x=>x.tier!=="Standard"||x.probabilities.push!==0))continue;
   const expected=scenario(picks.map(x=>x.probability),format);
   if(!expected||JSON.stringify(expected)!==JSON.stringify(slip.scenario))continue;
   const id=JSON.stringify([format,n,[...keys].sort()]);if(seenSlips.has(id))continue;seenSlips.add(id);
   const b=formats[format+"_"+n]??={registered:0,pending:0,pushExcluded:0,decided:0,allCorrect:0,countMassBrierSum:0};
   b.registered++;
   const ys=keys.map(k=>results.get(k));if(ys.some(x=>!x)){b.pending++;continue;}if(ys.includes("push")){b.pushExcluded++;continue;}
   const hits=ys.filter((y,i)=>y===picks[i].side.toLowerCase()).length;
   resolvedScenarioObservations.push({id,formatSize:format+"_"+n,slate:new Date(Math.min(...picks.map(p=>dt(p.eventStartsAt)))).toISOString().slice(0,10),frozenAt:f.firstCommittedAt,mass:expected.modeledCountMass,hits});
   b.decided++;b.allCorrect+=Number(hits===n);b.countMassBrierSum+=expected.modeledCountMass.reduce((a,v,k)=>a+(v-Number(k===hits))**2,0);
  }
 }
 for(const k of ["rawBrier","shrinkBrier","rawLogLoss","shrinkLogLoss"])out[k]=out.resolved?out[k]/out.resolved:null;
 for(const k of ["contextBrier","contextRawBrier"])out[k]=out.contextPaired?out[k]/out.contextPaired:null;
 return {kind:"nfl_independent_original_forward_audit_v1",firstObservationInputs,workloadByMarket,priorityVolumeByMarket,priorityVolumeByPosition,commonMLByMarket,...out,distinctFinalGames:gameIds.size,byTier:Object.fromEntries(Object.entries(byTier).map(([tier,b])=>[tier,{registered:b.registered,resolved:b.resolved,correct:b.correct,rawBrier:b.resolved?b.rawBrierSum/b.resolved:null,shrinkBrier:b.resolved?b.shrinkBrierSum/b.resolved:null,
   rawLogLoss:b.resolved?b.rawLossSum/b.resolved:null,shrinkLogLoss:b.resolved?b.shrinkLossSum/b.resolved:null,
   pending:b.registered-b.resolved,pushes:b.pushes,decided:b.resolved-b.pushes,
   strictHitRate:b.resolved?b.correct/b.resolved:null,decidedHitRate:b.resolved>b.pushes?b.correct/(b.resolved-b.pushes):null,
   hypotheticalAlwaysHigherWins:b.alwaysHigher,hypotheticalAlwaysLowerWins:tier==="Standard"?b.alwaysLower:null,
   contextPaired:b.contextPaired,contextBrier:b.contextPaired?b.contextBrierSum/b.contextPaired:null,
   contextRawBrier:b.contextPaired?b.contextRawBrierSum/b.contextPaired:null}])),formats,resolvedScenarioObservations,marketTierSideReliability:Object.fromEntries(Object.entries(marketReliability).map(([k,m])=>[k,{registered:m.registered,resolved:m.resolved,pending:m.registered-m.resolved,pushes:m.pushes,distinctGames:m.games.size,strictHitRate:m.resolved?m.hits/m.resolved:null,decidedHitRate:m.resolved>m.pushes?m.hits/(m.resolved-m.pushes):null,brier:m.resolved?m.brier/m.resolved:null,logLoss:m.resolved?m.loss/m.resolved:null,meanEstimatedProbability:m.resolved?m.confidence/m.resolved:null,reliability:m.bins.map((b,i)=>({min:i/10,n:b.n,meanProbability:b.n?b.p/b.n:null,observedStrictHitRate:b.n?b.y/b.n:null})),calibrated:false}])),overlappingSlipsNotIndependent:true,
  modelPromoted:false,calibrated:false,officialStatsNotPlatformSettlement:true,verifiedROI:null};
}
module.exports={KIND,freeze,score,shrink};
