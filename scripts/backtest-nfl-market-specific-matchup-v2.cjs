"use strict";
// Research only. All team/player inputs are lagged by a full week.
// Fixed grid selected on 2025 numeric MAE, then evaluated on 2026 historical replay.
// Existing 2026 results already existed when designed: NOT blinded or prospective.
const {prepare,buildRaw,MAP:BASE_MAP,MARKETS:BASE_MARKETS,weekClusterInterval}=require("./backtest-nfl-matchup-context.cjs");
const {forecast,isRoleEligible,marketValue,SPECS}=require("./backtest-nfl-historical-stats.cjs");
const fs=require("node:fs"),path=require("node:path");
const num=x=>typeof x==="number"&&Number.isFinite(x),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const PAIRS={pass_rush_yards:["passing_yards","rushing_yards"],rush_receive_yards:["rushing_yards","receiving_yards"]};
const MAP={...BASE_MAP,pass_rush_yards:"pass_rush_yards",rush_receive_yards:"rush_receive_yards"};
const MARKETS=[...BASE_MARKETS,...SPECS.filter(x=>Object.hasOwn(PAIRS,x.id))];
function augment(r){const x={...r};for(const [k,a] of Object.entries(PAIRS))x[k]=a.every(m=>num(r[m]))?a.reduce((v,m)=>v+r[m],0):null;return x;}
function opportunity(r,k){const a=k==="pass_rush_yards"?["attempts","carries"]:k==="rush_receive_yards"?["carries","targets"]:[k];return a.every(m=>num(r[m])&&r[m]>=0)?a.reduce((v,m)=>v+r[m],0):null;}
const FIXED={base:[0,0,0,0],defense:[.35,0,0,0],ratePace:[.35,.15,.20,0],usage:[.2,.1,.15,.3],conservative:[.15,.05,.1,.15],usageOnly:[0,0,0,.5]};
function features(m,own,allowed,oppOwn,league,prior){
 const valid=a=>a.filter(x=>num(x[m])&&x[m]>=0&&num(x.priorOffenseSnaps)&&x.priorOffenseSnaps>0);
 const a=valid(own.slice(-6)),d=valid(allowed.slice(-6)),o=valid(oppOwn.slice(-6)),l=valid(league);
 if(a.length<3||d.length<3||o.length<3||l.length<24)return null;
 const rate=x=>x.reduce((s,r)=>s+r[m],0)/x.reduce((s,r)=>s+r.priorOffenseSnaps,0),ref=rate(l);
 if(ref<=0)return null;
 const shrink=(x,n)=>cap((x-1)*n/(n+8),-.35,.35);
 const pace=shrink((mean(a.map(x=>x.priorOffenseSnaps))+mean(o.map(x=>x.priorOffenseSnaps)))/(2*mean(l.map(x=>x.priorOffenseSnaps))),Math.min(a.length,o.length));
 const h=prior.filter(num);if(h.length<6)return null;
 const earlier=mean(h.slice(-10,-3)),recent=mean(h.slice(-3));
 const usage=earlier>0?shrink(recent/earlier,Math.min(h.length-3,7)):0;
 return [shrink(rate(d)/ref,d.length),shrink(rate(a)/ref,a.length),pace,usage];
}
function candidate(base,f,weights){if(!num(base)||!Array.isArray(f)||f.length!==4||f.some(x=>!num(x)))return null;return base*cap(1+f.reduce((s,x,i)=>s+x*weights[i],0),.75,1.25);}
function weekSensitivity(rows,selected){
 const weeks=new Map();
 for(const r of rows){if(!num(r.actual)||!num(r.base)||!num(r[selected])||!Number.isInteger(r.week))continue;const a=weeks.get(r.week)||[];a.push(Math.abs(r[selected]-r.actual)-Math.abs(r.base-r.actual));weeks.set(r.week,a);}
 const diffs=[...weeks.values()].map(mean),omissions=diffs.length>=2?diffs.map((_,i)=>mean(diffs.filter((_,j)=>i!==j))):[];
 return {distinctWeeks:diffs.length,equalWeekMAEDelta:diffs.length?mean(diffs):null,weeksImproved:diffs.filter(x=>x<0).length,weeksWorsened:diffs.filter(x=>x>0).length,leaveOneWeekOutMin:omissions.length?Math.min(...omissions):null,leaveOneWeekOutMax:omissions.length?Math.max(...omissions):null,stableImprovement:diffs.length>=8&&omissions.every(x=>x<0),prospectiveValidation:false};
}
// A fixed, lagged opponent-position residual challenger. Never selected on 2026 outcomes.
function residualChallenger(rows){
 const history=new Map(),out=[],weeks=new Map();
 for(const r of rows){if(!Number.isInteger(r.year)||!Number.isInteger(r.week)||!["QB","RB","WR","TE","FB"].includes(r.position)||!r.opponent||!num(r.actual)||!num(r.base))continue;const k=r.year+"|"+r.week,a=weeks.get(k)||[];a.push(r);weeks.set(k,a);}
 for(const [,batch] of [...weeks].sort((a,b)=>a[1][0].year-b[1][0].year||a[1][0].week-b[1][0].week)){
  for(const r of batch){const k=r.year+"|"+r.opponent+"|"+r.position,h=history.get(k)||[];if(h.length<12||new Set(h.map(x=>x.week)).size<3)continue;
   const offset=.35*mean(h.map(x=>x.error))*h.length/(h.length+20),bound=.2*Math.max(1,Math.abs(r.base));out.push({...r,residual:r.base+cap(offset,-bound,bound)});
  }
  for(const r of batch){const k=r.year+"|"+r.opponent+"|"+r.position,a=history.get(k)||[];a.push({week:r.week,error:r.actual-r.base});history.set(k,a);}
 }
 const hold=out.filter(r=>r.year===2026);
 return {matchedAppearances:hold.length,baselineMAE:hold.length?mean(hold.map(r=>Math.abs(r.actual-r.base))):null,challengerMAE:hold.length?mean(hold.map(r=>Math.abs(r.actual-r.residual))):null,weekSensitivity:weekSensitivity(hold,"residual"),byPosition:positionAudit(hold,"residual"),priorWeekOnly:true,retrospective:true,promoted:false};
}
function positionAudit(rows,selected){const out={};for(const pos of ["QB","RB","WR","TE","FB"]){const a=rows.filter(r=>r.position===pos&&num(r.actual)&&num(r.base)&&num(r[selected]));if(!a.length)continue;const e=a.map(x=>x[selected]-x.actual),b=a.map(x=>x.base-x.actual);out[pos]={appearances:a.length,weeks:new Set(a.map(x=>x.week)).size,baselineMAE:mean(b.map(Math.abs)),selectedMAE:mean(e.map(Math.abs)),baselineSignedError:mean(b),selectedSignedError:mean(e),pairedWeekCI:weekClusterInterval(a,"base",selected),weekSensitivity:weekSensitivity(a,selected),researchOnly:true};}return out;}
function usageRateForecast(history,expected,base){const a=history.slice(-10);if(a.length<6||!num(expected)||expected<=0||!num(base)||a.some(x=>!num(x.value)||!num(x.volume)||x.volume<0))return null;const volume=a.reduce((s,x)=>s+x.volume,0);if(volume<10)return null;const rate=a.reduce((s,x)=>s+x.value,0)/volume;return .65*base+.35*rate*expected;}
function replay(raw,{chosenModels={}}={}){
 const {weeks,audit}=prepare(raw),players=new Map(),usageHistory=new Map(),effHistory=new Map(),own=new Map(),def=new Map(),league=new Map(),rows=new Map();
 const usageKey=m=>Object.hasOwn(PAIRS,m)?m:m.startsWith("pass")?"attempts":m.startsWith("rush")?"carries":"targets";
 const add=(m,k,v)=>{const a=m.get(k)||[];a.push(v);m.set(k,a);};const key=(s,t)=>s+"|"+t;
 for(const b of weeks){const {year:y,week:w}=b;const seen=new Set();
  for(const r of b.players){if(!r.player_id||!r.team||!r.opponent_team)continue;const ident="player:"+r.player_id;
   for(const m of MARKETS){const k=ident+"|"+m.id,h=players.get(k)||[],p=forecast(h),actual=marketValue(m,r);
    if(y<2025||!p||!num(actual)||!isRoleEligible({identity:ident,position:r.position},m.id,players))continue;
    const base=p[chosenModels[m.id]||"last5_mean"],f=features(MAP[m.id],own.get(key(y,r.team))||[],def.get(key(y,r.opponent_team))||[],own.get(key(y,r.opponent_team))||[],league.get(y)||[],usageHistory.get(ident+"|"+usageKey(m.id))||[]);
    if(!f||!num(base)||seen.has(k))continue;seen.add(k);
    const predictions=Object.fromEntries(Object.entries(FIXED).map(([name,weights])=>[name,candidate(base,f,weights)]));const op=usageHistory.get(ident+"|"+usageKey(m.id))||[],expected=op.length>=6?.6*mean(op.slice(-3))+.4*mean(op.slice(-6)):null;const volumeRate=usageRateForecast(effHistory.get(k+"|"+r.team)||[],expected,base);
    add(rows,m.id,{year:y,week:w,position:r.position,opponent:r.opponent_team,actual,baseline:base,...predictions,volumeRate});
   }
  }
  // No current-week outcome can enter features or player history above.
  const appearanceCounts=new Map();for(const r of b.players)if(r.player_id)appearanceCounts.set(r.player_id,(appearanceCounts.get(r.player_id)||0)+1);
  const unique=new Set();for(const r of b.players){if(!r.player_id||appearanceCounts.get(r.player_id)!==1)continue;for(const k of ["attempts","carries","targets",...Object.keys(PAIRS)]){const u=opportunity(r,k);if(num(u))add(usageHistory,"player:"+r.player_id+"|"+k,u);}for(const m of MARKETS){const k="player:"+r.player_id+"|"+m.id,v=marketValue(m,r);if(num(v)&&!unique.has(k)){unique.add(k);add(players,k,v);const exposure=opportunity(r,usageKey(m.id));if(num(exposure)&&r.team)add(effHistory,k+"|"+r.team,{value:v,volume:exposure});}}}
  const teamSeen=new Map();for(const r of b.teams){const k=r.team;const z=teamSeen.get(k)||[];z.push(r);teamSeen.set(k,z);}
  for(const z of teamSeen.values())if(z.length===1){const r=augment(z[0]);add(own,key(y,r.team),r);add(def,key(y,r.opponent_team),r);add(league,y,r);}
 }
 const score=(a,k)=>a.length?mean(a.map(x=>Math.abs(x.actual-x[k]))):null;
 const markets=Object.fromEntries([...rows].map(([m,a])=>{const dev=a.filter(x=>x.year===2025),hold=a.filter(x=>x.year===2026);const devMAE=Object.fromEntries(Object.keys(FIXED).map(k=>[k,score(dev,k)]));const selected=dev.length>=100&&new Set(dev.map(x=>x.week)).size>=8?Object.keys(FIXED).sort((a,b)=>devMAE[a]-devMAE[b])[0]:"base";return [m,{selected2025:selected,developmentN:dev.length,holdoutN:hold.length,holdoutWeeks:new Set(hold.map(x=>x.week)).size,developmentMAE:devMAE,holdoutMAE:Object.fromEntries(Object.keys(FIXED).map(k=>[k,score(hold,k)])),selectedPairedWeekCI:hold.length?weekClusterInterval(hold,"baseline",selected):null,positionHoldout:positionAudit(hold,selected),weekSensitivity:weekSensitivity(hold,selected),opponentPositionResidualResearch:residualChallenger(a),laggedVolumeRateResearch:(()=>{const z=hold.filter(x=>num(x.volumeRate));return {matchedAppearances:z.length,baselineMAE:score(z,"base"),challengerMAE:score(z,"volumeRate"),weekSensitivity:weekSensitivity(z,"volumeRate"),priorTeamSpecificRate:true,routeMetricsNotAssumed:true,modelPromoted:false};})()}];}));
 return {kind:"nfl_market_specific_matchup_v2_historical_research",generatedAt:new Date().toISOString(),trainingSeason:2025,chronologicalEvaluationSeason:2026,postDesignRetrospective:true,conditionalOnObservedAppearance:true,sourceAudit:audit,marketResults:markets,opponentOffensePaceUsesOpponentOwnRows:true,defenseRatesPerPriorOffensiveSnap:true,usageFromLaggedAttemptsCarriesTargets:true,comboUsesPairedObservedComponents:true,ftnNotAnInputToV2:true,otherFTNResearchPreserved:true,actualLineAccuracy:null,modelPromoted:false,confidenceApproved:false,lineupsApproved:false};
}
function main(){const root=path.resolve(__dirname,".."),selection=JSON.parse(fs.readFileSync(path.join(root,"outputs/nfl/backtests/2025-dev-model-selection-latest.json"),"utf8"));if(selection.kind!=="nfl_2025_development_model_selection_2026_retro_v1")throw Error("Baseline provenance missing");const result=replay(buildRaw(),{chosenModels:Object.fromEntries(selection.selections.map(x=>[x.market,x.selectedModel]))});if(!Object.values(result.marketResults).some(x=>x.holdoutN>0))throw Error("Empty NFL matched cohort");const out=path.join(root,"outputs/nfl/backtests/market-specific-matchup-v2-latest.json");fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({kind:result.kind,markets:Object.fromEntries(Object.entries(result.marketResults).map(([k,x])=>[k,{selected:x.selected2025,n:x.holdoutN,base:x.holdoutMAE.base,selectedMAE:x.holdoutMAE[x.selected2025]}])),modelPromoted:false}));}
if(require.main===module)main();module.exports={FIXED,features,candidate,replay,augment,opportunity,positionAudit,weekSensitivity,residualChallenger,usageRateForecast};
