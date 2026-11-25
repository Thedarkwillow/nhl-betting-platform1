'use strict';
// Dedicated private repository only. No raw response storage, no public artifact,
// no public stdout individual data. Readback is not independent chronology proof.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {retain}=require('./prizepicks-restricted-forecast-storage.cjs');
const REPO='Thedarkwillow/betting-forecast-vault.',BASE='https://api.github.com/repos/'+REPO;
const GRANT='authorized_individual_forecast_retention_v1';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function makeVault({token,grant,checkout,client=fetch,clock=()=>new Date().toISOString()}={}){
 if(!token||grant!==GRANT||!checkout)throw Error('vault_not_configured');
 let ready=false;
 async function request(method,route,body){
  const response=await client(BASE+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify(body),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}}:{})});
  if(!response.ok)throw Error('vault_http_failure');
  return response.json();
 }
 async function privateRepo(){const d=await request('GET','');if(d.id!==1472152822||d.full_name?.toLowerCase()!==REPO.toLowerCase()||d.private!==true||d.visibility!=='private'||d.default_branch!=='main'||d.archived!==false||d.disabled===true)throw Error('vault_privacy_or_branch');}
 async function append(prefix,bytes){
  if(bytes.length>900000)throw Error('vault_payload_bound');
  const digest=hash(bytes),name=prefix+'/'+digest+'.json';
  await privateRepo();
  const result=await request('PUT','/contents/'+name,{message:'Append research receipt '+digest.slice(0,12),content:bytes.toString('base64'),branch:'main'});
  const revision=result.commit?.sha;
  if(!/^[a-f0-9]{40}$/.test(revision||'')||result.content?.path!==name)throw Error('vault_write_receipt');
  const read=await request('GET','/contents/'+name+'?ref='+revision);
  if(read.type!=='file'||read.path!==name||read.encoding!=='base64'||typeof read.content!=='string'||!Buffer.from(read.content,'base64').equals(bytes))throw Error('vault_readback_failed');
  await privateRepo();
  return {digest,revision,readbackVerified:true};
 }
 async function preflight(){
  await privateRepo();
  const nonce=crypto.randomBytes(16).toString('hex');
  await append('preflight',Buffer.from(JSON.stringify({kind:'forecast_vault_synthetic_probe_v1',nonce,at:clock()})+'\n'));
  ready=true;return {privateDestinationVerified:true,writeReadbackVerified:true};
 }
 async function save(result){
  if(!ready)throw Error('vault_preflight_required');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'forecast-vault-'));
  fs.chmodSync(directory,0o700);
  let retained=0;
  try{
   const rows=result.predictions;
   if(!Array.isArray(rows)||!rows.length)throw Error('no_forecasts');
   for(let i=0;i<rows.length;i+=100){
    const local=retain({predictions:rows.slice(i,i+100)},{directory,checkout,grant,clock:clock()});
    const bytes=fs.readFileSync(path.join(directory,local.digest+'.json'));
    if(hash(bytes)!==local.digest)throw Error('vault_local_integrity');
    await append('forecasts',bytes);retained+=local.retained;
   }
   return {retained,remoteArchiveReadbackVerified:true,independentArchiveChronologyVerified:false,rawRowsPublished:0};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
 return {preflight,save};
}
module.exports={makeVault,REPO};
