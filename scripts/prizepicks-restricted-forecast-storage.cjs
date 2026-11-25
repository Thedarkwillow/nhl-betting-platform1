'use strict';
// No Git, network, Actions artifact, or stdout delivery. Explicit storage grant AND a
// configured private local directory are required. File creation is exclusive; local
// files are not proof of remote pregame chronology or independently verified settlement.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dt=Date.parse;
function validateDestination({directory,checkout,grant,clock}={}){
 if(grant!=='authorized_individual_forecast_retention_v1')throw Error('storage_not_authorized');
 if(!directory||!checkout||!Number.isFinite(dt(clock)))throw Error('storage_configuration');
 const root=fs.realpathSync(checkout),dest=fs.realpathSync(directory),s=fs.lstatSync(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||dest===root||dest.startsWith(root+path.sep)||root.startsWith(dest+path.sep)||(s.mode&0o077)!==0||typeof process.getuid==='function'&&s.uid!==process.getuid())throw Error('storage_not_private');
 // Refuse any directory inside a git working tree, including an alternate checkout.
 for(let p=dest;;p=path.dirname(p)){if(fs.existsSync(path.join(p,'.git')))throw Error('storage_git_tree');if(p===path.dirname(p))break;}
 fs.accessSync(dest,fs.constants.W_OK);
 return dest;
}
function retain(result,options={}){
 const dest=validateDestination(options),{clock}=options;
 if(!Array.isArray(result?.predictions)||!result.predictions.length)throw Error('no_forecasts');
 const rows=result.predictions.map(p=>{
  if(p.restricted!==true||p.modelApproved!==false||p.originalPlatformVerified!==false||p.calibrated!==false||!p.nativePlayerId||!p.nativeGameId||!p.providerOfferId||!Number.isFinite(p.projection)||!Number.isFinite(dt(p.forecastAt))||!Number.isFinite(dt(p.sourceObservedAt))||dt(p.sourceObservedAt)>dt(p.forecastAt)||dt(p.forecastAt)>dt(clock)||!Number.isFinite(dt(p.gameStartAt))||dt(p.gameStartAt)<=dt(clock)+900000||!['Higher','Lower'].includes(p.side)||!['standard','goblin','demon'].includes(p.tier)||!Number.isFinite(p.line)||!/^[a-f0-9]{40}$/.test(p.modelRevision||'')||!/^[a-f0-9]{64}$/.test(p.identityEvidenceSha256||'')||!Array.isArray(p.historyDigests)||!p.historyDigests.length||!p.historyDigests.every(x=>/^[a-f0-9]{64}$/.test(x)))throw Error('invalid_forecast');
  if(p.rawConditionalEstimate!==null&&(!Number.isFinite(p.rawConditionalEstimate)||p.rawConditionalEstimate<0||p.rawConditionalEstimate>1))throw Error('invalid_probability');
  // Explicit field allowlist; never retain raw API responses, headers, keys or arbitrary metadata.
  return Object.fromEntries(['sport','nativePlayerId','nativeGameId','player','market','period','line','side','tier','projection','rawConditionalEstimate','pushEstimate','priorObservations','method','forecastAt','sourceObservedAt','gameStartAt','modelRevision','identityEvidenceSha256','historyDigests','providerOfferId','originalPlatformVerified','calibrated','modelApproved','restricted','pickfinderCorroborated','matchedSportsbooks','marketBenchmark'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
 });
 const body=JSON.stringify({kind:'restricted_individual_forecast_v1',rows,modelApproved:false,originalPlatformVerified:false,independentArchiveChronologyVerified:false})+'\n',digest=crypto.createHash('sha256').update(body).digest('hex'),target=path.join(dest,digest+'.json');
 fs.writeFileSync(target,body,{flag:'wx',mode:0o600});
 const readback=fs.readFileSync(target);if(crypto.createHash('sha256').update(readback).digest('hex')!==digest)throw Error('storage_readback');
 return {retained:rows.length,digest,independentArchiveChronologyVerified:false,rawRowsPublished:0};
}
module.exports={retain,validateDestination};
