'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {compareCandidates}=require('../src/nhl-temporal-model-comparison.cjs');
const {files,validate}=require('./private-source-history-connections.cjs');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const git=(root,args)=>execFileSync('git',['-C',root,...args],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
const norm=x=>typeof x==='string'?x.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' '):'';
function read(root,rel){return JSON.parse(git(root,['show','HEAD:'+rel]));}
function workloadReplay(lines,logs){
 const seen=new Set(),out={};
 const minutes=x=>{
  const raw=x.timeOnIce??x.toi;
  if(typeof raw==='string'&&/^\\d{1,2}:[0-5]\\d$/.test(raw)){const [m,s]=raw.split(':').map(Number);return m+s/60;}
  if(Number.isFinite(x.timeOnIceSeconds)&&x.timeOnIceSeconds>0)return x.timeOnIceSeconds/60;
  return null;
 };
 for(const line of lines){
  const market=line.market;if(!['shotsOnGoal','assists','points','blockedShots','goals'].includes(market)||!Number.isFinite(line.line)||line.line%1!==.5)continue;
  const hist=logs[String(line.playerId)]||[],game=hist.find(x=>String(x.gameId)===String(line.gameId));
  if(!game||game[market]!==line.actual||!Number.isFinite(game[market]))continue;
  const at=line.sourceObservedAt??line.observedAt??line.capturedAt, start=line.eventStartsAt??line.gameStartAt;
  if(at!=null&&(!Number.isFinite(Date.parse(at))||start!=null&&(!Number.isFinite(Date.parse(start))||Date.parse(at)>=Date.parse(start))))continue;
  const id=JSON.stringify([line.gameId,line.playerId,market,line.line]);if(seen.has(id))continue;seen.add(id);
  const prior=hist.filter(x=>x.gameDate<game.gameDate&&Number.isFinite(x[market])&&minutes(x)>0).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)).slice(-30);
  if(prior.length<12)continue;
  const mean=prior.reduce((a,x)=>a+x[market],0)/prior.length;
  const expectedMinutes=prior.slice(-10).reduce((a,x)=>a+minutes(x),0)/10;
  const workload=prior.reduce((a,x)=>a+x[market],0)/prior.reduce((a,x)=>a+minutes(x),0)*expectedMinutes;
  const {estimateCountProbabilities}=require('../src/prop-probabilities.cjs');
  const p=estimateCountProbabilities(mean,line.line)?.higher,q=estimateCountProbabilities(workload,line.line)?.higher;
  if(!Number.isFinite(p)||!Number.isFinite(q))continue;
  const y=Number(game[market]>line.line),z=out[market]??={n:0,baseline:0,workload:0,baseMAE:0,workloadMAE:0,games:new Set()};
  z.n++;z.games.add(line.gameId);z.baseline+=(p-y)**2;z.workload+=(q-y)**2;z.baseMAE+=Math.abs(mean-game[market]);z.workloadMAE+=Math.abs(workload-game[market]);
 }
 return Object.fromEntries(Object.entries(out).map(([k,z])=>[k,{n:z.n,distinctGames:z.games.size,baselineBrier:z.baseline/z.n,workloadBrier:z.workload/z.n,baselineMAE:z.baseMAE/z.n,workloadMAE:z.workloadMAE/z.n}]));
}
function nhl(root){
 const a=read(root,'outputs/oddspapi/nhl/outcome-audit-latest.json'),h=read(root,'outputs/oddspapi/nhl/official-historical-player-logs-latest.json');
 if(!Array.isArray(a.lines)||!h.logs||a.matchedLines<1||a.generatedAt!==h.lineOutcomeAuditGeneratedAt)throw Error('NHL archive provenance');
 const q=compareCandidates(a.lines,h.logs);
 return {source:'archived OddsPapi PrizePicks-labelled thresholds; official statistical outcomes',eligibleArchivedLines:q.eligibleArchivedLines,bySeason:q.bySeason,byMarket:q.byMarket,holdout:q.temporalHoldout,priorTimeOnIceChallenger:workloadReplay(a.lines,h.logs),archivedModelSelectionBeforeGames:false,platformSettlementVerified:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
}
function identityCandidates(root){
 const rawRows=files.flatMap(([season,file,sha])=>{const raw=git(root,['show','HEAD:outputs/nba/history/'+season+'/'+file]);validate(raw,season,sha);return JSON.parse(raw).rows;});
 const profiles=new Map();
 const paths=git(root,['diff-tree','--no-commit-id','--name-only','-r',SEED]).toString().trim().split('\n').filter(p=>/\/nba\/[^/]+\/source\.json$/.test(p));
 if(paths.length!==2)throw Error('NBA seed paths');
 for(const p of paths){const raw=git(root,['show',SEED+':'+p]),n=JSON.parse(git(root,['show',SEED+':'+p.replace(/source\.json$/,'normalized.json')]));if(crypto.createHash('sha256').update(raw).digest('hex')!==n.sourceDigest)throw Error('seed digest');
  for(const page of JSON.parse(raw).pages)for(const row of page.rows){if(row.sport!=='nba'||!row.detailId||!norm(row.player))continue;const k=new URL(row.detailId,'https://www.pickfinder.app').pathname;const s=profiles.get(k)||new Set();s.add(norm(row.player));profiles.set(k,s);}
 }
 const byName=new Map();
 for(const r of rawRows){const n=norm(r.player),m=byName.get(n)||new Map();const old=m.get(r.playerId);if(!old||r.gameDate>old.gameDate)m.set(r.playerId,r);byName.set(n,m);}
 return [...profiles.entries()].map(([profile,s])=>{const label=[...s][0],m=byName.get(label);return {profile,label,conflict:s.size!==1,candidate:s.size===1&&m?.size===1?[...m.values()][0]:null};});
}
async function official(root,client=fetch){
 const candidates=identityCandidates(root),groups=new Map();
 for(const c of candidates){if(!c.candidate)continue;const r=c.candidate,g=String(r.gameId).padStart(10,'0');const list=groups.get(g)||[];list.push(c);groups.set(g,list);}
 let requests=0,matched=0,conflict=0,unavailable=0,unmatched=0;
 // Latest prior appearances from mirror, independently compare official NBA boxscore identity and team.
 for(const [id,list] of [...groups].sort((a,b)=>b[1].length-a[1].length).slice(0,30)){
  try{
   requests++;const res=await client('https://cdn.nba.com/static/json/liveData/boxscore/boxscore_'+id+'.json',{signal:AbortSignal.timeout(12000),redirect:'error'});
   if(res.status===403||res.status===429){unavailable+=list.length;break;}
   if(!res.ok){unavailable+=list.length;continue;}
   const raw=await res.text();if(raw.length>2_000_000)throw Error('bound');
   const g=JSON.parse(raw).game;if(String(g.gameId)!==id||g.gameStatus!==3)throw Error('game');
   const roster=[g.homeTeam,g.awayTeam].flatMap(t=>(t.players||[]).map(p=>({id:p.personId,label:norm(p.name||[p.firstName,p.familyName].join(' ')),team:t.teamTricode})));
   for(const c of list){const p=roster.filter(x=>x.id===c.candidate.playerId&&x.label===c.label&&x.team===c.candidate.team);if(p.length===1)matched++;else if(roster.some(x=>x.id===c.candidate.playerId||x.label===c.label))conflict++;else unmatched++;}
  }catch{unavailable+=list.length;}
 }
 return {sourceProfiles:candidates.length,uniqueMirrorCandidates:candidates.filter(c=>c.candidate).length,missingOrAmbiguous:candidates.filter(c=>!c.candidate).length,officialHistoricalIdNameTeamCorroborated:matched,conflict,unmatched,unavailable,notChecked:candidates.filter(c=>c.candidate).length-matched-conflict-unmatched-unavailable,freeRequests:requests,authoritativePickFinderIdentityLinks:0,rawRowsPublished:0,paidRequests:0};
}

// ESPN's own event and roster identifiers corroborate the mirror candidate,
// but are a different namespace; do not call this an authoritative NBA ID bridge.
async function independentIdentity(root,client=fetch){
 const candidates=identityCandidates(root),byDate=new Map(),counts={confirmedHistoricalNameTeamStat:0,ambiguousOrMissing:0,sourceUnavailable:0,notChecked:0,statMismatch:0};
 const normTeam=require('../src/nba-research-pipeline-v1.cjs').teams;
 let requests=0,stopped=false;
 async function get(url){
  requests++;
  const res=await client(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(res.status===403||res.status===429){stopped=true;throw Error('source refusal');}
  if(!res.ok)throw Error('source unavailable');
  const raw=await res.text();if(raw.length>6000000)throw Error('bound');
  return JSON.parse(raw);
 }
 for(const c of candidates)if(c.candidate){const date=c.candidate.gameDate;const a=byDate.get(date)||[];a.push(c);byDate.set(date,a);}
 const summaryCache=new Map(),links=[];
 for(const [date,list] of byDate){
  if(stopped){counts.notChecked+=list.length;continue;}
  let events;
  try{const d=await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replace(/-/g,'')+'&limit=100');events=d.events;if(!Array.isArray(events))throw Error('schema');}
  catch{counts.sourceUnavailable+=list.length;continue;}
  for(const c of list){
   if(stopped){counts.notChecked++;continue;}
   const r=c.candidate,tm=normTeam(r.team),opp=normTeam(r.opponent);
   const eligible=events.filter(e=>{const g=e.competitions?.[0],teams=g?.competitors?.map(x=>normTeam(x.team?.abbreviation));return g?.status?.type?.completed===true&&g.status.type.name==='STATUS_FINAL'&&teams?.length===2&&teams.includes(tm)&&teams.includes(opp)&&tm!==opp;});
   if(eligible.length!==1){counts.ambiguousOrMissing++;continue;}
   const event=eligible[0],id=String(event.id);
   if(!/^\d+$/.test(id)){counts.ambiguousOrMissing++;continue;}
   if(!summaryCache.has(id)){try{summaryCache.set(id,await get('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+id));}catch{summaryCache.set(id,null);}}
   const d=summaryCache.get(id);
   if(!d){counts.sourceUnavailable++;continue;}
   const gc=d.header?.competitions?.[0],actualTeams=gc?.competitors?.map(x=>normTeam(x.team?.abbreviation));
   if(String(d.header?.id)!==id||gc?.status?.type?.name!=='STATUS_FINAL'||actualTeams?.length!==2||!actualTeams.includes(tm)||!actualTeams.includes(opp)){counts.ambiguousOrMissing++;continue;}
   const records=[];
   for(const t of d.boxscore?.players||[])if(normTeam(t.team?.abbreviation)===tm)for(const g of t.statistics||[]){
    const fields={PTS:'points',REB:'rebounds',AST:'assists',STL:'steals',BLK:'blocks',TO:'turnovers'};
    if(!Object.keys(fields).every(k=>g.labels?.filter(x=>x===k).length===1))continue;
    for(const a of g.athletes||[])if(a.didNotPlay===false&&norm(a.athlete?.displayName)===c.label&&/^\d+$/.test(String(a.athlete?.id))&&Array.isArray(a.stats)&&a.stats.length===g.labels.length){
     const match=Object.entries(fields).every(([k,v])=>Number.isInteger(r[v])&&/^\d+$/.test(String(a.stats[g.labels.indexOf(k)]))&&Number(a.stats[g.labels.indexOf(k)])===r[v]);
     records.push({id:String(a.athlete.id),match});
    }
   }
   if(records.length!==1){counts.ambiguousOrMissing++;continue;}
   if(!records[0].match){counts.statMismatch++;continue;}
   links.push({profile:c.profile,mirrorPlayerId:r.playerId,espnAthleteId:records[0].id,espnEventId:id,date});
   counts.confirmedHistoricalNameTeamStat++;
  }
 }
 const forward=new Map(),reverse=new Map();
 for(const l of links){const a=forward.get(l.mirrorPlayerId)||new Set(),b=reverse.get(l.espnAthleteId)||new Set();a.add(l.espnAthleteId);b.add(l.mirrorPlayerId);forward.set(l.mirrorPlayerId,a);reverse.set(l.espnAthleteId,b);}
 const unique=links.filter(l=>forward.get(l.mirrorPlayerId).size===1&&reverse.get(l.espnAthleteId).size===1);
 return {kind:'nba_independent_espn_identity_candidate_audit_v1',sourceProfiles:candidates.length,mirrorCandidates:candidates.filter(c=>c.candidate).length,missingMirrorCandidates:candidates.filter(c=>!c.candidate).length,counts,uniqueCorroboratedCandidates:unique.length,crossNamespaceConflicts:links.length-unique.length,authoritativePickFinderIdentityLinks:0,independentOriginalOfferVerification:false,freeRequests:requests,paidRequests:0,rawRowsPublished:0};
}

if(require.main===module)(async()=>{try{const root=fs.realpathSync(process.argv[2]);console.log(JSON.stringify(process.argv[3]==='nhl'?nhl(root):process.argv[3]==='nba-espn'?await independentIdentity(root):await official(root)));}catch{console.error('Multisport archive audit failed closed');process.exitCode=1;}})();
module.exports={nhl,identityCandidates,official,independentIdentity,workloadReplay};
