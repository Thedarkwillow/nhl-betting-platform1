"use strict";
const fs=require("fs"),path=require("path");
const root=fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT),{originalFrames}=require("./report-nhl-standard-triple-challengers.cjs"),{shadowFrames,provenance}=require("../src/nhl-standard-triple-challenger-grader.cjs"),{freeze,summarize}=require("../src/nhl-all-tier-exact-mass-calibration.cjs");
const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8")),frames=originalFrames();
const shadow=shadowFrames(frames,history,{mode:"original_precommitted_only"});console.log(JSON.stringify(require("../src/nhl-prior-market-direction-research.cjs").assess(shadow.rows)));
const seen=new Set(),rows=[];
for(const f of frames.sort((a,b)=>Date.parse(a.firstCommittedAt)-Date.parse(b.firstCommittedAt))){
 if(!provenance(f.snapshot,f.firstCommittedAt,f.gitHistoryCount))continue;
 let v;try{v=freeze(f.snapshot);}catch{continue;}
 for(const r of v.rows){const k=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);if(seen.has(k)||Date.parse(r.gameStartAt)-Date.parse(f.firstCommittedAt)<900000)continue;seen.add(k);
 const a=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&["FINAL","OFF"].includes(g.gameState)&&g.type===(r.market==="saves"?"goalie":"skater")&&g.timeOnIceSeconds>0);
 const x=a.length===1?a[0][r.market]:null;const outcome=Number.isInteger(x)&&x>=0?(x>r.line?"higher":x<r.line?"lower":"push"):null;
 rows.push({...r,outcome,gameDate:a.length===1?a[0].gameDate:null});}
}
const groups={};for(const r of rows){const k=r.tier+"|"+r.market;(groups[k]??=[]).push(r);}
const compact=Object.fromEntries(Object.entries(groups).map(([k,a])=>{const x=summarize(a);return [k,{registered:x.registered,resolved:x.resolved,pushes:x.pushes,rawBrier:x.rawBrier,candidateBrier:x.candidateBrier,rawLogLoss:x.rawLogLoss,candidateLogLoss:x.candidateLogLoss,distinctGames:x.distinctGames,distinctFinalDates:x.distinctFinalDates,minimumEvidence:x.minimumEvidenceSizeReached}]}));
console.log(JSON.stringify({kind:"nhl_tier_market_original_mass_replay_v1",groups:compact,originalInputsFrozen:true,transformationOriginallyFrozen:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0}));
console.log(JSON.stringify(require("../src/nhl-original-pair-dependence-research.cjs").assess(shadow.rows)));
