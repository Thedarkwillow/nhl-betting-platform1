'use strict';
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {forecast,settings,revision,priorOf}=require('../src/native-workload-matchup-challenger.cjs');
const {estimateCountProbabilities}=require('../src/prop-probabilities.cjs');
const nba=require('../src/nba-research-pipeline-v1.cjs');
const nhl=require('../src/projections.cjs');
const {forecast:nflForecast}=require('./backtest-nfl-historical-stats.cjs');
const dt=Date.parse,finite=Number.isFinite,sum=(a,fn)=>a.reduce((s,r)=>s+fn(r),0);
const group=(a,k)=>{const m=new Map();for(const x of a){const key=k(x);const v=m.get(key)||[];v.push(x);m.set(key,v);}return m;};
const key=(...v)=>JSON.stringify(v),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const dirs={NHL:'research/pickfinder-public-identity-v1/nhl-final-stat-facts',NFL:'research/pickfinder-public-nfl-v1/season',
 NBA:'research/pickfinder-public-validation-v1/nba-final-history'};
const sourceVersion={NFL:'nflverse_public_native_history_v1',NHL:'nhl_official_recent_final_stats_v1',
 NBA:'nba_official_web_final_history_v1'};
const authorizations={NFL:'nflverse contributors (CC BY 4.0 regular-season stats and schedule)',NHL:'NHL official game finals',NBA:'NBA official final box scores'};
const parseNN=x=>typeof x==='string'&&/^\d{1,2}:[0-5]\d$/.test(x)?+x.split(':')[0]+(+x.split(':')[1])/60:null;
function statRows(sport,docs){
 const nflDocs=sport==='NFL'?[...group(docs,r=>r.season).values()].map(a=>a.sort((x,y)=>dt(y.observedAt)-dt(x.observedAt))[0]):[];
 const games=[];
 for(const doc of sport==='NFL'?nflDocs:docs){
  if(doc.kind!==sourceVersion[sport])continue;
  if(sport==='NHL')for(const g of doc.games||[]){
   const t=g.event;
   if(t?.namespace!=='nhl:official'||t.status!=='post'||t.completed!==true||t.teams?.length!==2||
    !hash(g.sourceDigest)||!(dt(g.observedAt)>dt(t.startAt)))continue;
   games.push({event:t.eventId,start:t.startAt,teams:t.teams.map(x=>x.abbr),
    minRows:12,players:(g.rows||[]).filter(p=>p.appeared===true&&Number.isSafeInteger(p.stats?.sog)).map(p=>
     ({id:p.playerId,team:p.team,values:p.stats,exposure:parseNN(p.toi)}))});
  }
  if(sport==='NBA'&&doc.source==='nba.com official game box score'&&doc.officialFinalClockVerified===true&&
   hash(doc.sourceResponseSha256)&&dt(doc.capturedAt)>dt(doc.startAt)){
   const players=(doc.rows||[]).filter(p=>p.gameId===doc.gameId&&p.appeared===true&&p.identityVerified===true&&
    p.officialGameFinalVerified===true);
   games.push({event:doc.gameId,start:doc.startAt,teams:[...new Set(players.map(p=>p.team))],minRows:5,
    players:players.map(p=>({id:p.playerId,team:p.team,opp:p.opponent,values:p,exposure:p.minutes}))});
  }
  if(sport==='NFL'&&doc.attribution?.url==='https://github.com/nflverse/nflverse-data'&&
   doc.attribution?.licenseUrl==='https://creativecommons.org/licenses/by/4.0/'){
   const sides=group(doc.playerRows||[],p=>p.gameId);
   for(const g of doc.games||[]){
    if(g.completedScoreObserved!==true||g.season!==doc.season||!Number.isInteger(g.week)||g.week<1||g.week>18||
     !(dt(doc.observedAt)>dt(g.startAt)))continue;
    games.push({event:g.gameId,start:g.startAt,teams:[g.home,g.away],season:g.season,week:g.week,minRows:8,
     players:(sides.get(g.gameId)||[]).filter(p=>dt(p.gameStartAt)===dt(g.startAt)&&p.week===g.week)
      .map(p=>({id:p.playerId,team:p.team,opp:p.opponent,values:p.stats,exposure:p.stats?.targets}))});
   }
  }
 }
 const byGame=group(games,g=>String(g.event)),rows=[],sides=[];let conflicts=0,invalid=0;
 for(const list of byGame.values()){
  const g=list[0],fields=settings[sport].markets;
  const sig=d=>key(dt(d.start),[...d.teams].sort(),d.players.map(p=>key(String(p.id),p.team,p.opp??null,p.exposure,
   fields.map(m=>p.values?.[m]))).sort());
  if(list.length>1&&new Set(list.map(sig)).size!==1){conflicts++;continue;}
  if(!finite(dt(g.start))||!g.event||g.teams.length!==2||!g.teams.every(t=>typeof t==='string'&&t)||g.teams[0]===g.teams[1]||
   new Set(g.players.map(p=>String(p.id))).size!==g.players.length||g.players.some(p=>!p.id||!g.teams.includes(p.team)||
    p.opp&&!g.teams.includes(p.opp)||p.opp===p.team||!finite(p.exposure)||p.exposure<0||
    sport!=='NFL'&&p.exposure<=0||fields.some(m=>!Number.isSafeInteger(p.values?.[m]))||
    p.exposure===0&&fields.some(m=>p.values[m]!==0))){invalid++;continue;}
  const combined=[];
  for(const team of g.teams){
   const own=g.players.filter(p=>p.team===team),opponent=g.teams.find(x=>x!==team),exposure=sum(own,p=>p.exposure);
   if(own.length<g.minRows||exposure<=0)continue;
   const base={sport,event:String(g.event),team,opponent,start:dt(g.start),season:g.season,week:g.week};
   combined.push({side:{...base,exposure,values:Object.fromEntries(fields.map(m=>[m,sum(own,p=>p.values[m])]))},
    rows:own.map(p=>({...base,id:String(p.id),exposure:p.exposure,values:Object.fromEntries(fields.map(m=>[m,p.values[m]]))}))});
  }
  if(combined.length!==2){invalid++;continue;}
  for(const a of combined){sides.push(a.side);rows.push(...a.rows);}
 }
 return {rows,sides,conflicts,invalid,gameCount:sides.length/2};
}
function incumbent(target,prior,metric){
 if(target.sport==='NHL'){
  const field=metric==='sog'?'shotsOnGoal':metric;
  const games=prior.map((r,i)=>({gameId:i,gameDate:new Date(r.start).toISOString().slice(0,10),[field]:r.values[metric]}));
  const p=nhl.projectPlayer({type:'skater',games}).projections[field];
  return p?.ready?{projection:p.estimate,higher:line=>estimateCountProbabilities(p.estimate,line)?.higher}:null;
 }
 if(target.sport==='NFL'){
  const vals=prior.map(r=>r.values[metric]),p=nflForecast(vals);
  return p&&vals.length>=15?{projection:p.shrunk_last5,higher:line=>(.5+vals.filter(v=>v>line).length)/(1+vals.length)}:null;
 }
 const asOf=new Date(target.start).toISOString().slice(0,10),playerId=Number(target.id);
 const h={players:new Map([[playerId,prior.map(r=>({...r.values,team:r.team,gameDate:new Date(r.start).toISOString().slice(0,10),minutes:r.exposure}))]])};
 const project=line=>nba.project(h,{...target,playerId,market:metric,line},asOf,{opponentContext:false});
 const p=project(.5);
 return p?{projection:p.projection,higher:line=>project(line)?.higher}:null;
}
const methods=['workload','defense','workloadDefense','matchup'];
const metrics=['incumbent','priorEmpirical','neutral','candidate'];
const blank=()=>({n:0,brier:0,logLoss:0});
const clip=p=>Math.max(.0001,Math.min(.9999,p));
function score(a,p,y){a.n++;a.brier+=(p-y)**2;a.logLoss-=Math.log(y?clip(p):clip(1-p));}
function evaluate({rows,sides,conflicts,invalid,gameCount},sport){
 const byPlayer=group(rows,r=>r.id),groups={};
 for(const target of rows){
  if(target.start<dt('2026-07-01'))continue; // 2024/25 are prior seasons, not scored.
  const playerRows=byPlayer.get(target.id),all=priorOf(playerRows,target);
  const prior=sport==='NFL'?all:all.filter(r=>r.team===target.team);
  if(prior.length<settings[sport].minimum)continue;
  for(const metric of settings[sport].markets){
   const existing=incumbent(target,prior,metric);if(!existing||!finite(existing.projection))continue;
   const line=Math.max(0,Math.floor(existing.projection))+.5; // synthetic, never a historical platform line
   const p=forecast({target,playerRows,leagueSides:sides,metric,line,incumbentHigher:existing.higher(line)});
   if(!p)continue;
   const y=Number(target.values[metric]>line),a=groups[metric]??={};
   for(const m of methods)if(p[m]!==null){
    const c=a[m]??={games:new Map(),dates:new Set(),scores:Object.fromEntries(metrics.map(k=>[k,blank()]))};
    const delta=(p.incumbent-y)**2-(p[m]-y)**2,d=c.games.get(target.event)||{n:0,delta:0};
    d.n++;d.delta+=delta;c.games.set(target.event,d);c.dates.add(new Date(target.start).toISOString().slice(0,10));
    for(const k of metrics)score(c.scores[k],k==='candidate'?p[m]:p[k],y);
   }
  }
 }
 const comparison=Object.fromEntries(settings[sport].markets.map(metric=>[metric,Object.fromEntries(methods.map(m=>{
  const a=groups[metric]?.[m];if(!a)return [m,{decisions:0,distinctEvents:0,distinctDates:0,scores:null}];
  const n=a.scores.candidate.n,k=a.games.size,delta=(a.scores.incumbent.brier-a.scores.candidate.brier)/n;
  const margin=k<30||a.dates.size<10?null:1.96*Math.sqrt((k/(k-1))*sum([...a.games.values()],g=>(g.delta-delta*g.n)**2)/(n*n));
  return [m,{decisions:n,distinctEvents:k,distinctDates:a.dates.size,brierImprovement:delta,
   approximateEventClusterInterval:margin===null?null:[delta-margin,delta+margin],
   scores:Object.fromEntries(metrics.map(k=>[k,{brier:a.scores[k].brier/n,logLoss:a.scores[k].logLoss/n}]))}];
 }))]));
 return {source:authorizations[sport],archivedEvents:gameCount,archivedPlayerAppearances:rows.length,
  incompatibleEventCopies:conflicts,incompleteEvents:invalid,comparison};
}
function archive(root,sport){
 const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:35e6,stdio:['ignore','pipe','pipe']});
 const paths=git(['ls-tree','--name-only','-r','HEAD',dirs[sport]]).toString().trim().split('\n').filter(Boolean);
 if(!paths.length)throw Error('missing native final archive: '+sport);
 return paths.map(path=>{
  const digest=path.split('/').at(-1).replace(/\.json$/,''),raw=git(['show','HEAD:'+path]);
  if(!hash(digest)||createHash('sha256').update(raw).digest('hex')!==digest)throw Error('native archive digest mismatch: '+sport);
  return JSON.parse(raw);
 });
}
function report(root){
 return {kind:'native_workload_matchup_research_v1',revision,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  retrospective:true,thresholds:'synthetic_incumbent_projection_floor_plus_half',scoredFrom:'2026-07-01',
  chronoRule:'earlier final-game chronologies only, at least 24h/48h start separation and previous weeks for NFL; archives were reconstructed later',
  population:'current appearance conditional; no official pregame availability or depth chart asserted',
  originalOffersVerified:0,appSettlementVerified:false,prospective:false,untouchedHoldout:false,modelPromoted:false,
  rawRowsPublished:0,paidRequests:0,bySport:Object.fromEntries(Object.keys(dirs).map(sport=>[sport,evaluate(statRows(sport,archive(root,sport)),sport)]))};
}
module.exports={statRows,incumbent,evaluate,report};
if(require.main===module){
 try{const r=JSON.stringify(report(process.cwd()),null,2)+'\n';if(process.argv[2])fs.writeFileSync(process.argv[2],r);else process.stdout.write(r);}
 catch(e){console.error(e.message);process.exitCode=1;}
}
