"use strict";
// Replay at archived partner thresholds, NOT a frozen forecast or independent official settlement.
const fs=require("node:fs");
const {readPinned,audit:crosswalk}=require("./nba-archived-three-source-crosswalk.cjs");
const core=require("../src/nba-research-pipeline-v1.cjs");
const dt=Date.parse,day=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const key=p=>JSON.stringify([p.gameId,p.playerId,p.market,p.line]);
function audit(sc,bdl,board,hist,grades,injury){
 const check=crosswalk(sc,bdl,board);
 if(check.counts.uniqueScheduleMatches!==sc.games.length||hist?.kind!=="nba_historical_mirror_research_v1"||!(dt(hist.capturedAt)<=dt(board.capturedAt))||grades?.kind!=="nba_archived_individual_line_stat_reconciliation_v1"||grades.boardCapturedAt!==board.capturedAt||grades.retrospectiveOnly!==true||!Array.isArray(grades.rows))throw Error("archive contract");
 const h=core.indexHistory([hist]),offers=core.board(board,h,sc,board.capturedAt);
 if(offers.length!==grades.summary.registeredSides)throw Error("registered side count mismatch");
 const map=new Map(offers.map(p=>[JSON.stringify([p.sourceOfferId,p.offeredSide]),p])),actuals=new Map(),bad=new Set(),matched=new Set();
 for(const r of grades.rows){
  const id=JSON.stringify([r.sourceOfferId,r.offeredSide]),p=map.get(id);
  if(!p||matched.has(id)||r.playerIdCandidate!==p.playerId||r.gameId!==p.gameId||r.market!==p.market||r.line!==p.line||r.tier!==p.tier||r.sourceObservedAt!==p.sourceObservedAt||!Number.isFinite(r.actual)||r.actual<0||r.statSource!=="ESPN_conditional"||r.officialPlayerIdMatched!==false)throw Error("grade binding mismatch");
  matched.add(id);const k=key(p),old=actuals.get(k);
  if(old&&old.actual!==r.actual)bad.add(k);else if(!old)actuals.set(k,{p,actual:r.actual});
 }
 if(matched.size!==grades.summary.matchedStatSides)throw Error("matched side count mismatch");
 const injuryValid=injury?.kind==="nba_official_injury_report_observed_v1"&&Array.isArray(injury.rows)&&dt(injury.reportPublishedAt)<=dt(board.capturedAt)&&dt(injury.capturedAt)<Math.min(...sc.games.map(g=>dt(g.startAt)))&&/^https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_/.test(injury.sourceDocumentUrl||"");
 const excluded={unmatchedSides:0,distinctUnmatchedPlayers:0,uniquePregameInjuryMatches:0,reportedOut:0,reportedOther:0,noUniqueInjuryRow:0},players=new Set();
 for(const [id,p] of map){
  if(matched.has(id))continue;excluded.unmatchedSides++;players.add(p.gameId+"|"+p.playerId);
  const g=sc.games.find(x=>x.gameId===p.gameId);
  const rr=injuryValid?injury.rows.filter(x=>x.date===day(p.gameStartAt)&&x.match===g.away+"@"+g.home&&core.teams(x.team)===p.team&&core.norm(x.player)===core.norm(p.player)):[];
  if(rr.length===1){excluded.uniquePregameInjuryMatches++;excluded[rr[0].status==="out"?"reportedOut":"reportedOther"]++;}
  else excluded.noUniqueInjuryRow++;
 }
 excluded.distinctUnmatchedPlayers=players.size;
 const markets={},tot={n:0,wins:0,higher:0,lower:0,brier:0,baseBrier:0,logLoss:0,baseLogLoss:0},skip={conflict:0,push:0,history:0};
 const init=()=>({...tot,games:new Set(),players:new Set()});
 const add=(a,p,y,q,b)=>{a.n++;a.wins+=Number((q>.5&&y===1)||(q<.5&&y===0));a.higher+=y;a.lower+=1-y;a.brier+=(q-y)**2;a.baseBrier+=(b-y)**2;a.logLoss-=y*Math.log(q)+(1-y)*Math.log1p(-q);a.baseLogLoss-=y*Math.log(b)+(1-y)*Math.log1p(-b);a.games?.add(p.gameId);a.players?.add(p.playerId);};
 const total=init(),lowCount={};
 const {forecast}=require('./nba-low-count-accuracy-research.cjs');
 for(const [k,{p,actual}] of actuals){
  if(bad.has(k)){skip.conflict++;continue;}if(actual===p.line){skip.push++;continue;}
  const a=core.project(h,p,day(p.gameStartAt),{opponentContext:false});
  if(!a||a.higher===.5){skip.history++;continue;}
  const y=Number(actual>p.line),m=markets[p.market]??=init();
  add(m,p,y,a.higher,a.baselineHigher);add(total,p,y,a.higher,a.baselineHigher);
  if(['threePointersMade','blocks'].includes(p.market)){
   const prior=(h.players.get(p.playerId)||[]).filter(r=>r.team===p.team&&r.gameDate<day(p.gameStartAt)).map(r=>({values:r,exposure:r.minutes}));
   const f=forecast(prior,p.market,p.line);
   if(f){const z=lowCount[p.market]??={n:0,baseline:0,workloadPoisson:0,hurdle:0,blend:0};z.n++;for(const k of ['baseline','workloadPoisson','hurdle','blend'])z[k]+=(f[k]-y)**2;}
  }
 }
 const summarize=a=>({decisions:a.n,games:a.games.size,players:a.players.size,wins:a.wins,hitRate:a.n?a.wins/a.n:null,alwaysHigher:a.n?a.higher/a.n:null,alwaysLower:a.n?a.lower/a.n:null,brier:a.n?a.brier/a.n:null,prior30Brier:a.n?a.baseBrier/a.n:null,logLoss:a.n?a.logLoss/a.n:null,prior30LogLoss:a.n?a.baseLogLoss/a.n:null});
 return {kind:"nba_real_partner_line_conditional_replay_v1",registeredSides:offers.length,matchedSides:matched.size,distinctPlayerGameMarketThresholds:actuals.size,unmatchedDiagnostic:excluded,injurySourceObservedBeforeTip:injuryValid,excluded:skip,aggregate:summarize(total),markets:Object.fromEntries(Object.entries(markets).map(([m,a])=>[m,summarize(a)])),lowCountChallenger:Object.fromEntries(Object.entries(lowCount).map(([m,z])=>[m,{n:z.n,brier:Object.fromEntries(Object.entries(z).filter(([k])=>k!=='n').map(([k,v])=>[k,v/z.n]))}])),retrospectiveOnly:true,conditionalESPNActuals:true,sourceOperatorSettlementVerified:false,authoritativeIdentityVerified:false,prospectiveModelAccuracy:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length!==12)throw Error();const docs=[];for(let i=0;i<args.length;i+=2)docs.push(readPinned(args[i],args[i+1]));console.log(JSON.stringify(audit(...docs)));}catch{console.error("Conditional real-line replay failed closed");process.exitCode=1;}}
module.exports={audit,key};
