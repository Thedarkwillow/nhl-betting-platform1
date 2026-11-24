"use strict";
// Current official-boxscore analogue of the three-season opponent-rate research.
// Frozen numeric and probability forecasts only, on the original selected side.
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {challengerProbabilities}=require("./nhl-count-distribution-shadow.cjs");
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const KIND="nhl_original_forward_expanded_market_analogue_v2";
const MARKETS=["shotsOnGoal","goals","saves","assists","points","hits","blockedShots","faceoffsWon"];
const TIERS=["Standard","Goblin","Demon"];
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const day=x=>{const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(x)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sum=a=>a.reduce((s,x)=>s+x,0);
const count=x=>Number.isInteger(x)&&x>=0;
const validToi=x=>Number.isFinite(x)&&x>0&&x<=3900;
const round=x=>Number(x.toFixed(6));
function priorContext(history,cutoff){
 const events=new Map(),byPlayer=new Map(),seen=new Set();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(g.gameDate||"")||g.gameDate>=cutoff||
     !["OFF","FINAL"].includes(g.gameState)||!Number.isInteger(g.gameId)||!Number.isInteger(g.playerId))continue;
  const id=g.gameId+"|"+g.playerId;if(seen.has(id))throw Error("Repeated official player game");seen.add(id);
  if(!byPlayer.has(g.playerId))byPlayer.set(g.playerId,[]);
  byPlayer.get(g.playerId).push(g);
  if(g.type==="skater"&&validToi(g.timeOnIceSeconds)){
   if(!events.has(g.gameId))events.set(g.gameId,[]);
   events.get(g.gameId).push(g);
  }
 }
 const emptyMarkets=()=>Object.fromEntries(MARKETS.map(m=>[m,[]]));
 const team={},league=emptyMarkets();
 for(const rows of [...events.values()].sort((a,b)=>a[0].gameDate.localeCompare(b[0].gameDate)||a[0].gameId-b[0].gameId)){
  const ts=[...new Set(rows.map(g=>canonical(g.team)))];
  if(ts.length!==2||ts.some(t=>!t||rows.filter(g=>canonical(g.team)===t).length!==18))continue;
  for(const t of ts){
   const own=rows.filter(g=>canonical(g.team)===t),opp=rows.filter(g=>canonical(g.team)!==t);
   team[t]??=emptyMarkets();
   for(const m of MARKETS){
    const src=["saves","blockedShots"].includes(m)?own:opp,f=["saves","blockedShots"].includes(m)?"shotsOnGoal":m;
    if(!src.every(g=>count(g[f])))continue;
    const v=sum(src.map(g=>g[f]));team[t][m].push(v);league[m].push(v);
   }
  }
 }
 return {team,league,byPlayer};
}
function candidate(p,context){
 const m=p.market,prior=(context.byPlayer.get(p.playerId)||[]).filter(g=>(m==="saves"?g.type==="goalie":g.type==="skater")&&validToi(g.timeOnIceSeconds)&&count(g[m]))
  .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 const opp=(context.team[canonical(p.opponent)]?.[m]||[]).slice(-20),lg=(context.league[m]||[]).slice(-1200);
 if(prior.length<5||opp.length<5||lg.length<20||mean(lg)<=0)return null;
 const five=prior.slice(-5),ten=prior.slice(-10),twenty=prior.slice(-20);
 const minutes=.65*mean(ten.map(g=>g.timeOnIceSeconds))+.35*mean(five.map(g=>g.timeOnIceSeconds));
 const rate=sum(twenty.map(g=>g[m]))/sum(twenty.map(g=>g.timeOnIceSeconds));
 const factor=Math.max(.8,Math.min(1.2,1+(mean(opp)/mean(lg)-1)*opp.length/(opp.length+20)));
 const form=.5*mean(five.map(g=>g[m]))+.3*mean(ten.map(g=>g[m]))+.2*mean(twenty.map(g=>g[m]));
 // Selected on 2024 MoneyPuck data; 2025 retrospective performance only.
 const projection=m==="faceoffsWon"?form:m==="hits"?.5*form+.5*rate*minutes*factor:rate*minutes*factor;
 const poisson=estimateCountProbabilities(projection,p.line),alt=challengerProbabilities(projection,p.line,prior.map(g=>g[m]));
 if(!poisson||!alt)return null;
 return {estimate:round(projection),poisson,distributionShadow:alt.challenger,priorGames:prior.length,opponentGames:opp.length,
  forecastConditionalOnPlaying:true,starterConfirmed:false,modelPromoted:false};
}
function freeze(s,history){
 if(s?.individualPropSelectionPolicy!==POLICY||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps)||!Number.isFinite(at(s.generatedAt)))throw Error("Require original snapshot");
 const cutoff=day(s.generatedAt),context=priorContext(history,cutoff),rows=[];
 for(const o of s.individualPropSelections){
  if(!MARKETS.includes(o.market)||!TIERS.includes(o.tier))continue;
  const raw=s.rankedProps.filter(p=>key(p)===key(o)&&p.lean===o.lean&&p.capturedAt===o.capturedAt);
  if(raw.length!==1||!Number.isFinite(at(o.capturedAt))||!Number.isFinite(at(o.gameStartAt))||at(o.capturedAt)>at(s.generatedAt)||at(o.gameStartAt)-at(s.generatedAt)<900000||
     !Number.isFinite(raw[0].projection)||!raw[0].probabilities)continue;
  const c=candidate(o,context);
  if(!c)continue;
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,tier:o.tier,line:o.line,gameStartAt:o.gameStartAt,capturedAt:o.capturedAt,
   originalSide:o.lean,championMean:raw[0].projection,championProbabilities:raw[0].probabilities,candidate:c});
 }
 return {kind:KIND,generatedAt:s.generatedAt,cutoffPacificDate:cutoff,rows,modelPromoted:false,researchOnly:true,
  scope:"Official current-season analogue of historical market-specific model choices; not exact MoneyPuck features or independently validated betting probabilities."};
}
function score(frames,history,policyAt){
 const seen=new Set(),buckets={};let rejected=0;
 if(!Number.isFinite(at(policyAt)))return {kind:KIND,status:"missing_first_policy_commit",byTierAndMarket:{},researchOnly:true,modelPromoted:false};
 for(const f of [...frames].sort((a,b)=>at(a.firstCommittedAt)-at(b.firstCommittedAt))){
  const s=f.snapshot,v=s?.forwardExpandedMarketShadow;
  if(v?.kind!==KIND||v.generatedAt!==s.generatedAt||at(s.generatedAt)<=at(policyAt)||!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||!Array.isArray(v.rows))continue;
  if(s.individualPropSelectionPolicy!==POLICY||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps))continue;
  const orig=new Map(s.individualPropSelections.map(o=>[key(o),o]));
  if(orig.size!==s.individualPropSelections.length)continue;
  for(const x of v.rows){
   const o=orig.get(key(x)),id=key(x);
   if(!o||o.lean!==x.originalSide||o.capturedAt!==x.capturedAt||o.gameStartAt!==x.gameStartAt||
      at(f.firstCommittedAt)>=at(x.gameStartAt)-900000||!MARKETS.includes(x.market)||!TIERS.includes(x.tier)||seen.has(id)){rejected++;continue;}
   const raw=s.rankedProps.filter(p=>key(p)===id&&p.lean===o.lean&&p.capturedAt===o.capturedAt);
   if(raw.length!==1||!Number.isFinite(at(x.capturedAt))||at(x.capturedAt)>at(s.generatedAt)||!Number.isFinite(at(x.gameStartAt))||raw[0].projection!==x.championMean||JSON.stringify(raw[0].probabilities)!==JSON.stringify(x.championProbabilities)){rejected++;continue;}
   const vectors=[x.championProbabilities,x.candidate?.poisson,x.candidate?.distributionShadow];
   if(!vectors.every(p=>[p?.higher,p?.lower,p?.push].every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&Math.abs(p.higher+p.lower+p.push-1)<.0001)){rejected++;continue;}
   if(!Number.isFinite(x.championMean)||!Number.isFinite(x.candidate?.estimate)){rejected++;continue;}
   seen.add(id);
   const k=x.tier+"|"+x.market,a=buckets[k]??={registered:0,resolved:0,decided:0,pushes:0,pending:0,originalSideCorrect:0,championMAE:0,challengerMAE:0,championBrier:0,poissonBrier:0,distributionBrier:0};
   a.registered++;
   const games=(history?.players?.[String(x.playerId)]?.games||[]).filter(g=>g.gameId===x.gameId&&["OFF","FINAL"].includes(g.gameState)&&g.type===(x.market==="saves"?"goalie":"skater")&&validToi(g.timeOnIceSeconds));
   if(games.length!==1||!count(games[0][x.market])){a.pending++;continue;}
   const actual=games[0][x.market],out=actual>x.line?"higher":actual<x.line?"lower":"push";
   a.resolved++;if(out==="push")a.pushes++;else{a.decided++;if(out===x.originalSide.toLowerCase())a.originalSideCorrect++;}
   a.championMAE+=Math.abs(x.championMean-actual);a.challengerMAE+=Math.abs(x.candidate.estimate-actual);
   const brier=p=>["higher","lower","push"].reduce((sum,k)=>sum+(p[k]-Number(k===out))**2,0);
   a.championBrier+=brier(vectors[0]);a.poissonBrier+=brier(vectors[1]);a.distributionBrier+=brier(vectors[2]);
  }
 }
 for(const a of Object.values(buckets))for(const k of ["championMAE","challengerMAE","championBrier","poissonBrier","distributionBrier"])a[k]=a.resolved?round(a[k]/a.resolved):null;
 return {kind:KIND,status:"research_only",byTierAndMarket:buckets,rejected,modelPromoted:false,researchOnly:true,
  originalPlatformSettlementVerified:false,warning:"Three-outcome Brier score includes push mass. Matched original selected thresholds, repeated players/games not independent. No new selection or profitability claim."};
}
module.exports={KIND,priorContext,candidate,freeze,score};
