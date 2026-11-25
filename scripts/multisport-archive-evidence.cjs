'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {compareCandidates}=require('../src/nhl-temporal-model-comparison.cjs');
const {files,validate}=require('./private-source-history-connections.cjs');
const SEED='aef07d2aecb75388c6757c9cc5844b2113d6a0ac';
const git=(root,args)=>execFileSync('git',['-C',root,...args],{maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
const norm=x=>typeof x==='string'?x.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' '):'';
function read(root,rel){return JSON.parse(git(root,['show','HEAD:'+rel]));}
function nhl(root){
 const a=read(root,'outputs/oddspapi/nhl/outcome-audit-latest.json'),h=read(root,'outputs/oddspapi/nhl/official-historical-player-logs-latest.json');
 if(!Array.isArray(a.lines)||!h.logs||a.matchedLines<1||a.generatedAt!==h.lineOutcomeAuditGeneratedAt)throw Error('NHL archive provenance');
 const q=compareCandidates(a.lines,h.logs);
 return {source:'archived OddsPapi PrizePicks-labelled thresholds; official statistical outcomes',eligibleArchivedLines:q.eligibleArchivedLines,bySeason:q.bySeason,byMarket:q.byMarket,holdout:q.temporalHoldout,archivedModelSelectionBeforeGames:false,platformSettlementVerified:false,modelPromoted:false,rawRowsPublished:0,paidRequests:0};
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
 return [...profiles.values()].map(s=>{const label=[...s][0],m=byName.get(label);return {label,conflict:s.size!==1,candidate:s.size===1&&m?.size===1?[...m.values()][0]:null};});
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
if(require.main===module)(async()=>{try{const root=fs.realpathSync(process.argv[2]);console.log(JSON.stringify(process.argv[3]==='nhl'?nhl(root):await official(root)));}catch{console.error('Multisport archive audit failed closed');process.exitCode=1;}})();
module.exports={nhl,identityCandidates,official};
