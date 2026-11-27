'use strict';
// Computes a separate native period result for archive gaps. Never grades, repairs
// PickFinder rows, writes source archives, or modifies frozen forecasts/caches.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {iterate,archiveRevision}=require('./pickfinder-public-archive.cjs');
const {createLayoutAudit}=require('./pickfinder-nba-layout-recovery.cjs');
const {queue}=require('./pickfinder-public-runner.cjs');
const {history}=require('./pickfinder-public-model-validation.cjs');
const {build,sourceUrl}=require('./nba-official-gamebook-periods.cjs');
const ROUTES=new Map([
 ['1st_quarter_player_points','1st_quarter'],['1st_half_player_points','1st_half'],
 ['1st_half_player_points_+_rebounds_+_assists','1st_half'],['1st_half_player_fantasy_score_all_','1st_half'],
]);
const dateTime=Date.parse;
const key=x=>JSON.stringify(x);
const name=x=>String(x??'').trim().toLowerCase().replace(/ (jr|sr)\.$/,' $1');
function collect(gaps,finals,clock){
 const games=new Map(),targets=new Map();
 const tally={legacyPeriodRows:0,noOfficialGameRows:0,fantasyFormulaNotBoundRows:0,ambiguousOfficialGameRows:0};
 for(const f of finals){
  if(dateTime(f.first)>dateTime(clock)||f.doc?.officialFinalClockVerified!==true||!Array.isArray(f.doc?.rows))continue;
  for(const p of f.doc.rows){
   if(p.appeared!==true||p.identityVerified!==true||p.officialGameFinalVerified!==true||p.gameId!==f.doc.gameId||
      !/^20\d\d-\d\d-\d\d$/.test(p.gameDate)||typeof p.home!=='boolean'||!Number.isSafeInteger(p.playerId)) continue;
   const k=key([name(p.player),p.gameDate.slice(5),p.opponent,p.home]);
   const arr=games.get(k)||[];arr.push({f,p});games.set(k,arr);
  }
 }
 for(const {record:r,field:f} of gaps){
  const period=ROUTES.get(r.market);
  if(r.sport!=='nba'||!period||r.period!==period||f.period!==period||![r.mapRange,r.gameMode,f.mapRange,f.gameMode].every(x=>x==null))continue;
  tally.legacyPeriodRows++;
  if(r.market.includes('fantasy_score')){tally.fantasyFormulaNotBoundRows++;continue;}
  let cells;try{cells=JSON.parse(f.value);}catch{continue;}
  const dm=/^(\d{1,2})\/(\d{1,2})$/.exec(cells?.[0]?.value||'');
  const opp=/^(@)?([A-Z]{3})$/.exec(cells?.[1]?.value||''), badges=cells?.[1]?.labels;
  if(!dm||!opp||!Array.isArray(badges)||new Set(badges).size!==1||badges[0]!==opp[2]||
    !Number.isFinite(dateTime(f.observedAt))||dateTime(f.observedAt)>dateTime(clock))continue;
  const mmdd=dm.slice(1).map(x=>x.padStart(2,'0')).join('-');
  const found=(games.get(key([name(r.player),mmdd,opp[2],!opp[1]]))||[]).filter(({p})=>p.gameDate<f.observedAt.slice(0,10));
  if(!found.length){tally.noOfficialGameRows++;continue;}
  // If any distinct immutable final evidence disagrees, do not use the target.
  const signatures=new Set(found.map(({p})=>key([p.gameId,p.playerId,p.team,p.opponent,p.gameDate,p.points,p.rebounds,p.assists,p.steals,p.blocks,p.turnovers,p.threePointersMade])));
  if(signatures.size!==1){tally.ambiguousOfficialGameRows++;continue;}
  const {p,f:final}=found.sort((a,b)=>dateTime(a.f.first)-dateTime(b.f.first)||a.f.digest.localeCompare(b.f.digest))[0];
  const k=key([p.gameId,p.playerId,r.market]);
  const target=targets.get(k)||{final,playerId:p.playerId,date:p.gameDate,away:p.home?p.opponent:p.team,home:p.home?p.team:p.opponent,market:r.market,observations:0};
  target.observations++;targets.set(k,target);
 }
 return {targets,tally};
}
function run(root,gamebooksDir,clock=new Date().toISOString()){
 if(!Number.isFinite(dateTime(clock))||!fs.statSync(gamebooksDir).isDirectory())throw Error('invalid clock or local gamebook directory');
 const revision=archiveRevision(root),audit=createLayoutAudit(clock);
 queue([],iterate(root,'profiles',revision,{includeDigest:true}),{historyAudit:audit});
 const {targets,tally}=collect(audit.gaps,history(root,'nba-final-history'),clock);
 const evidence=[];let noLocalGamebookRows=0,nativeSourceRejectedRows=0;
 for(const x of targets.values()){
  const url=sourceUrl(x.date,x.away,x.home);
  if(!url){nativeSourceRejectedRows+=x.observations;continue;}
  const pdfPath=path.join(gamebooksDir,x.date.replaceAll('-','')+'_'+x.away+x.home+'.pdf');
  if(!fs.existsSync(pdfPath)){noLocalGamebookRows+=x.observations;continue;}
  let result;try{result=build({...x,pdfPath,url,capturedAt:clock});}catch{}
  if(!result){nativeSourceRejectedRows+=x.observations;continue;}
  evidence.push({...result,legacyRouteObservations:x.observations});
 }
 evidence.sort((a,b)=>a.gameId-b.gameId||a.playerId-b.playerId||a.market.localeCompare(b.market));
 const nativeScopeCounts=evidence.reduce((o,x)=>(o[x.scope]=(o[x.scope]||0)+1,o),{});
 return {kind:'pickfinder_nba_native_period_gap_research_v1',archiveRevision:revision,generatedAt:clock,
   summary:{...tally,noLocalGamebookRows,nativeSourceRejectedRows,nativePeriodScopes:evidence.length,nativeScopeCounts,
   nativeGames:new Set(evidence.map(x=>x.gameId)).size,legacyRowsWithSeparateNativePeriodValue:evidence.reduce((n,x)=>n+x.legacyRouteObservations,0),
   requestedOriginalObservationQualified:false,originalPlatformSettlementVerified:false,qualifiedCacheChanged:false,modelApproved:false},evidence};
}
function verifyReceipt(root,file){
 const bytes=fs.readFileSync(file),digest=createHash('sha256').update(bytes).digest('hex');
 if(path.basename(file)!==digest+'.json')throw Error('period archive bytes do not match receipt name');
 const d=JSON.parse(bytes),summary=d.summary;
 if(d.kind!=='pickfinder_nba_native_period_gap_research_v1'||!summary||
    !Array.isArray(d.evidence)||!Number.isFinite(dateTime(d.generatedAt))||
    !['requestedOriginalObservationQualified','originalPlatformSettlementVerified','qualifiedCacheChanged','modelApproved'].every(k=>summary[k]===false))
  throw Error('period research boundary');
 const originals=new Map(history(root,'nba-final-history').map(r=>[r.digest,r])),scopes=new Set();
 let priorRows=0,q=0,h=0;
 for(const v of d.evidence){
  const f=originals.get(v.nativeFinalDigest),period=ROUTES.get(v.market);
  const row=f?.doc.rows.find(p=>p.playerId===v.playerId&&p.gameId===v.gameId&&p.gameDate===v.gameDate&&p.appeared===true&&p.identityVerified===true&&p.officialGameFinalVerified===true);
  const id=key([v.gameId,v.playerId,v.market]);
  if(v.kind!=='nba_official_gamebook_period_research_v1'||!f||!row||scopes.has(id)||
     !f.doc.officialFinalClockVerified||dateTime(f.first)>dateTime(d.generatedAt)||
     !/^[a-f0-9]{64}$/.test(v.sourcePdfSha256)||
     sourceUrl(v.gameDate,row.home?row.opponent:row.team,row.home?row.team:row.opponent)!==v.sourceUrl||
     v.retrospectiveOnly!==true||!['originalSourceDisplayVerified','originalPlatformSettlementVerified','modelApproved'].every(k=>v[k]===false)||
     !period||v.scope!==period||v.market.includes('fantasy_score')||
     JSON.stringify(v.periods)!==JSON.stringify(period==='1st_half'?['q1','q2']:['q1'])||
     !Number.isSafeInteger(v.legacyRouteObservations)||v.legacyRouteObservations<1||
     !Number.isSafeInteger(v.seconds)||v.seconds<0||v.seconds>(period==='1st_half'?1440:720)||
     !['points','rebounds','assists'].every(k=>Number.isSafeInteger(v.stats?.[k])&&v.stats[k]>=0)||
     v.nativeValue!==v.stats.points+(v.market==='1st_half_player_points_+_rebounds_+_assists'?v.stats.rebounds+v.stats.assists:0))
   throw Error('period fact source or scope mismatch');
  scopes.add(id);priorRows+=v.legacyRouteObservations;
  if(period==='1st_half')h++;else q++;
 }
 if(summary.nativePeriodScopes!==scopes.size||summary.legacyRowsWithSeparateNativePeriodValue!==priorRows||
    summary.nativeGames!==new Set(d.evidence.map(x=>x.gameId)).size||
    (summary.nativeScopeCounts['1st_half']||0)!==h||(summary.nativeScopeCounts['1st_quarter']||0)!==q||
    ['noOfficialGameRows','fantasyFormulaNotBoundRows','ambiguousOfficialGameRows','noLocalGamebookRows','nativeSourceRejectedRows']
     .reduce((n,k)=>n+summary[k],priorRows)!==summary.legacyPeriodRows)
  throw Error('period coverage totals mismatch');
 return {kind:'verified_native_period_research_archive_v1',digest,sourceArchiveRevision:d.archiveRevision,
   validatedNativeFinalLinks:scopes.size,...summary,paidRequests:0};
}
module.exports={collect,run,verifyReceipt};
if(require.main===module){
 const result=process.argv[2]==='--verify'?verifyReceipt(process.cwd(),process.argv[3]):run(process.cwd(),process.argv[2]);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
