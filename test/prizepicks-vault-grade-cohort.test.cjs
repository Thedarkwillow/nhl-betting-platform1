'use strict';
const t=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
const {cohort,reconcileNfl,officialFinal,openVault}=require('../scripts/prizepicks-vault-grade-cohort.cjs');
const clock='2026-11-25T18:20:00Z',observedAt='2026-11-25T17:45:00Z',forecastAt='2026-11-25T18:05:00Z',startAt='2026-11-26T18:00:00Z',first='2026-11-25T17:46:00Z',revision='b'.repeat(40),h='a'.repeat(64);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
t('witness and seven original frames require exact immutable commit and bytes, pregame chronology',async()=>{
 const paths=new Map(),frames=[];
 for(let i=0;i<7;i++){
  const rows=Array.from({length:i===6?67:80},()=>({restricted:true,calibrated:false,modelApproved:false,forecastAt,sourceObservedAt:forecastAt,gameStartAt:startAt}));
  const doc={kind:'restricted_individual_forecast_v1',modelApproved:false,originalPlatformVerified:false,rows,fixture:i},bytes=Buffer.from(JSON.stringify(doc)),digest=hash(bytes),path='forecasts/'+digest+'.json',sha=String(i).repeat(40);
  paths.set(path,{bytes,sha,doc,commit:sha,at:forecastAt});frames.push({path,commit:sha,digest,gitBlobSha:sha,rows:rows.length});
 }
 const wpath='witnesses/2026-11-25-1805-cohort.json',doc={kind:'private_forecast_pregame_connector_witness_v1',repositoryId:1472152822,count:547,originalFramesModified:false,serverPushTimestampVerified:false,observedAt:'2026-11-25T18:17:00Z',frames};
 paths.set(wpath,{doc,bytes:Buffer.from(JSON.stringify(doc)),sha:revision,commit:revision,at:'2026-11-25T18:18:00Z'});
 const vault={privateRepo:async()=>{},first:async p=>({sha:paths.get(p).commit,at:paths.get(p).at}),read:async p=>paths.get(p)};
 const c=await cohort(vault,clock);a.equal(c.frames.length,7);a.equal(c.frames.flatMap(f=>f.rows).length,547);a.equal(c.archivedAt,'2026-11-25T18:18:00.000Z');a.equal(c.serverPushTimestampVerified,false);
 await a.rejects(cohort(vault,'2026-11-25T18:16:00Z'),/witness_invalid/);
 const bad={...vault,read:async(p,ref='main')=>p===frames[0].path&&ref==='main'?{...paths.get(p),bytes:Buffer.from('changed')}:paths.get(p)};
 await a.rejects(cohort(bad,clock),/forecast_integrity/);
});
t('NFL sidecar requires exact original pregame identity and season receipts; never edits input',()=>{
 const wrap=(doc,digest)=>({doc:{observedAt,...doc},digest,first,commit:revision});
 const name='Fixture Player',game={eventId:'123',status:'pre',startAt,teams:[{id:'1',abbr:'AAA'},{id:'2',abbr:'BBB'}]};
 const facts=[wrap({sport:'nfl',source:'espn:nfl',events:[game],roster:[{playerId:'7',teamId:'1',team:'AAA',name,position:'QB'}],proofs:[{url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261126',observedAt,digest:h},{url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/1/roster',observedAt,digest:h,teamId:'1'}]},h)];
 const seasons=[2024,2025,2026].map((season,i)=>wrap({season,games:[...Array.from({length:5},(_,j)=>({gameId:season+'_'+j,week:j+1,startAt:season+'-09-0'+(j+1)+'T00:00:00Z',home:'AAA',away:'BBB',completedScoreObserved:true})),...(season===2026?[{gameId:'2026_12_BBB_AAA',season,week:12,espnEventId:'123',startAt,home:'AAA',away:'BBB',completedScoreObserved:false}]:[])],rosters:[{week:12,espnId:'7',gsisId:'00-1234567',team:'AAA',name}],playerRows:Array.from({length:5},(_,j)=>({gameId:season+'_'+j,playerId:'00-1234567',week:j+1,gameStartAt:season+'-09-0'+(j+1)+'T00:00:00Z',team:'AAA',opponent:'BBB',stats:{attempts:30,passing_yards:250}}))},String(i+1).repeat(64)));
 const row={sport:'NFL',nativePlayerId:'00-1234567',nativeGameId:'2026_12_BBB_AAA',player:name,market:'passing_yards',line:249.5,side:'Higher',tier:'standard',period:'Full game',providerOfferId:'fixture',identityEvidenceSha256:h,historyDigests:[h,...seasons.map(s=>s.digest)],modelRevision:revision,forecastAt,sourceObservedAt:forecastAt,gameStartAt:startAt};
 const before=JSON.stringify(row),out=reconcileNfl([row],facts,seasons);a.equal(out.length,1);a.equal(out[0].team,'AAA');a.equal(out[0].opponent,'BBB');a.equal(JSON.stringify(row),before);
 a.equal(reconcileNfl([{...row,gameStartAt:'2026-11-26T18:01:00Z'}],facts,seasons).length,0);
 a.equal(reconcileNfl([row],facts,seasons.slice(0,2)).length,0);
 a.equal(reconcileNfl([row],facts,seasons.map(s=>({...s,first:'2026-11-25T18:06:00Z'}))).length,0);
});
t('no official final request before game is due; private grant required',async()=>{
 let calls=0;const c=async()=>{calls++;throw Error('no');};a.equal(await officialFinal(123,startAt,clock,c),null);a.equal(calls,0);
 a.throws(()=>openVault({token:'fixture'}),/vault_not_authorized/);
 const v=openVault({token:'fixture',grant:'authorized_individual_forecast_retention_v1',client:c});
 await a.rejects(v.append('forecasts/'+'a'.repeat(64)+'.json',{}),/write_path/);a.equal(calls,0);
});
