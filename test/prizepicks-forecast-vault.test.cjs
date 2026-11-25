'use strict';
const t=require('node:test'),a=require('node:assert/strict'),{makeVault,REPO}=require('../scripts/prizepicks-forecast-vault.cjs'),{capture}=require('../scripts/prizepicks-one-time-nov25.cjs');
const grant='authorized_individual_forecast_retention_v1',revision='a'.repeat(40),now='2026-11-25T18:00:00Z';
function fixture({publicRepo=false,corrupt=false}={}){
 const files=new Map(),calls=[];
 const client=async(url,o)=>{
  a.ok(url.startsWith('https://api.github.com/repos/'+REPO));a.equal(o.redirect,'error');calls.push(o.method);
  const u=new URL(url),p=u.pathname.split('/contents/')[1];
  if(!p)return Response.json({id:1472152822,full_name:REPO,private:!publicRepo,visibility:publicRepo?'public':'private',default_branch:'main',archived:false});
  if(o.method==='PUT'){const d=JSON.parse(o.body);a.equal(d.sha,undefined);a.equal(d.branch,'main');a.ok(!files.has(p));files.set(p,d.content);return Response.json({commit:{sha:revision},content:{path:p}});}
  a.equal(u.searchParams.get('ref'),revision);
  return Response.json({type:'file',path:p,encoding:'base64',content:corrupt?'YQ==':files.get(p)});
 };
 return {files,calls,client};
}
const config=f=>({token:'fixture',grant,checkout:process.cwd(),client:f.client,clock:()=>now});
t('private vault verifies append-only synthetic write and readback',async()=>{const f=fixture();const v=makeVault(config(f));a.deepEqual(await v.preflight(),{privateDestinationVerified:true,writeReadbackVerified:true});a.equal(f.files.size,1);a.ok([...f.files.keys()][0].startsWith('preflight/'));});
t('public destination rejected before write',async()=>{const f=fixture({publicRepo:true});await a.rejects(makeVault(config(f)).preflight(),/vault_privacy_or_branch/);a.equal(f.calls.includes('PUT'),false);});
t('corrupt readback fails closed',async()=>{const f=fixture({corrupt:true});await a.rejects(makeVault(config(f)).preflight(),/vault_readback_failed/);});
t('missing grant rejected',()=>{a.throws(()=>makeVault({...config(fixture()),grant:''}),/vault_not_configured/);});
t('vault preflight failure makes no provider calls',async()=>{let calls=0;const f=fixture({publicRepo:true});await a.rejects(capture('fixture',async()=>{calls++;throw Error('unexpected')},()=>now,{modelContext:{},forecastVault:makeVault(config(f))}),/vault_privacy_or_branch/);a.equal(calls,0);});
t('cannot retain before preflight',async()=>{await a.rejects(makeVault(config(fixture())).save({predictions:[]}),/vault_preflight_required/);});
t('retains allowed individual forecast fields privately and verifies exact readback',async()=>{const f=fixture(),v=makeVault(config(f));await v.preflight();const p={sport:'NBA',restricted:true,modelApproved:false,originalPlatformVerified:false,calibrated:false,nativePlayerId:1,nativeGameId:2,providerOfferId:'fixture-id',player:'Fixture',team:'BOS',opponent:'LAL',market:'points',line:10.5,side:'Higher',tier:'standard',projection:12,rawConditionalEstimate:.6,forecastAt:now,sourceObservedAt:now,gameStartAt:'2026-11-25T22:00:00Z',modelRevision:revision,identityEvidenceSha256:'b'.repeat(64),historyDigests:['c'.repeat(64)],rawResponse:'never retain'};const receipt=await v.save({predictions:[p]});a.equal(receipt.retained,1);a.equal(receipt.remoteArchiveReadbackVerified,true);a.equal(receipt.independentArchiveChronologyVerified,false);const entry=[...f.files.entries()].find(([k])=>k.startsWith('forecasts/'));const d=JSON.parse(Buffer.from(entry[1],'base64'));a.equal(d.rows[0].player,'Fixture');a.equal(d.rows[0].rawResponse,undefined);a.equal(JSON.stringify(receipt).includes('Fixture'),false);});
