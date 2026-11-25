'use strict';
const {forecast}=require('./backtest-nfl-historical-stats.cjs');
const {nflEmpiricalBaseline,nflResidualChallenger}=require('./prizepicks-multisport-model-bridge.cjs');
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const fields=['passing_yards','attempts','completions','passing_tds','passing_interceptions','rushing_yards','carries','receiving_yards','receptions','targets','fg_made','fg_att','pat_made','kicking_points'];
const usage={passing_yards:'attempts',attempts:'attempts',completions:'attempts',passing_tds:'attempts',passing_interceptions:'attempts',rushing_yards:'carries',carries:'carries',receiving_yards:'targets',receptions:'targets',targets:'targets',fg_made:'fg_att',fg_att:'fg_att',pat_made:'pat_att',kicking_points:'kick'};
function replay(rows){
 const weeks=new Map(),seen=new Set(),history=new Map(),out=new Map();
 for(const r of rows){
  if(!Number.isInteger(r.year)||!Number.isInteger(r.week)||r.week<1||r.week>18||!r.playerId||!r.stats)throw Error('invalid row');
  const k=[r.year,r.week,r.playerId].join('|');if(seen.has(k))throw Error('duplicate player week');seen.add(k);
  const w=r.year*100+r.week;if(!weeks.has(w))weeks.set(w,[]);weeks.get(w).push(r);
 }
 for(const w of [...weeks.keys()].sort((a,b)=>a-b)){
  const batch=weeks.get(w);
  for(const r of batch)for(const m of fields){
   const y=r.stats[m];if(!Number.isSafeInteger(y))continue;
   const key=r.playerId+'|'+m,h=history.get(key)||[];
   const u=usage[m],eligible=u==='kick'?((r.stats.fg_att||0)+(r.stats.pat_att||0)>0):r.stats[u]>0;
   if(!eligible||r.year<2025||h.length<15)continue;
   const line=Math.floor(forecast(h).shrunk_last5)+0.5;
   const b=nflEmpiricalBaseline(h,line),c=nflResidualChallenger(h,line,{nonnegative:!m.endsWith('_yards')});
   if(!b||!c)continue;
   const k=r.year+'|'+m;if(!out.has(k))out.set(k,{year:r.year,market:m,n:0,brier:0,logLoss:0,challengerBrier:0,challengerLogLoss:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))});
   const o=out.get(k),a=Number(y>line),p=b.higher,q=Math.max(1e-6,Math.min(1-1e-6,c.higher));
   const loss=x=>-(a*Math.log(x)+(1-a)*Math.log(1-x));o.n++;o.brier+=(p-a)**2;o.logLoss+=loss(p);o.challengerBrier+=(q-a)**2;o.challengerLogLoss+=loss(q);
   const bin=o.bins[Math.min(9,Math.floor(p*10))];bin.n++;bin.p+=p;bin.y+=a;
  }
  for(const r of batch)for(const m of fields){
   const y=r.stats[m],u=usage[m],eligible=u==='kick'?((r.stats.fg_att||0)+(r.stats.pat_att||0)>0):r.stats[u]>0;
   if(!eligible||!Number.isSafeInteger(y))continue;
   const k=r.playerId+'|'+m;if(!history.has(k))history.set(k,[]);history.get(k).push(y);
  }
 }
 return [...out.values()].map(o=>({...o,brier:o.brier/o.n,logLoss:o.logLoss/o.n,challengerBrier:o.challengerBrier/o.n,challengerLogLoss:o.challengerLogLoss/o.n,bins:o.bins.map(b=>({n:b.n,meanProbability:b.n?b.p/b.n:null,observedFrequency:b.n?b.y/b.n:null}))}));
}
function run(root=process.cwd(),clock=new Date().toISOString()){
 const docs=receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock),rows=[];
 for(const year of [2024,2025,2026]){
  const h=docs.filter(x=>x.doc.season===year).sort((a,b)=>Date.parse(b.doc.observedAt)-Date.parse(a.doc.observedAt))[0];
  if(!h)throw Error('missing season '+year);
  const games=new Map(h.doc.games.filter(g=>g.completedScoreObserved&&Date.parse(g.startAt)<Date.parse(h.doc.observedAt)).map(g=>[g.gameId,g]));
  for(const x of h.doc.playerRows){const g=games.get(x.gameId);if(!g||g.week!==x.week||Date.parse(g.startAt)!==Date.parse(x.gameStartAt)||[g.home,g.away].sort().join('|')!==[x.team,x.opponent].sort().join('|'))continue;rows.push({year,week:x.week,playerId:x.playerId,stats:x.stats});}
 }
 const markets=replay(rows);if(!markets.length)throw Error('empty replay');
 return {kind:'nfl_empirical_synthetic_replay_v1',inputRows:rows.length,markets,actualLinesMatched:false,conditionalOnObservedWorkload:true,untouchedHoldout:false,calibrated:false,modelApproved:false,paidRequests:0};
}
if(require.main===module)console.log(JSON.stringify(run(),null,2));
module.exports={replay,run};
