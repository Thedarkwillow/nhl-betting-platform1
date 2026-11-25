'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const relative='research/pickfinder-premium/2026-11-25/manual/browser-pilot-bb60508f.json.gz.b64';
function audit(data){
 const result=[];
 for(const {source:s,normalized:n} of data.partitions){
  let noApps=0,other=0,identity=0,evidenceRetained=0;
  for(const p of s.pages)for(const row of p.rows){
   if(row.sport!==s.sport)continue;
   if(!row.detailId||!row.player||!row.market||!Array.isArray(row.apps)){identity++;continue;}
   if(row.apps.some(a=>a.book===s.book&&Number.isFinite(a.line)&&['Higher','Lower'].includes(a.side)))continue;
   if(!row.apps.length)noApps++;else other++;
   if(Array.isArray(row.appEvidence)&&row.appEvidence.length)evidenceRetained++;
  }
  result.push({book:s.book,sport:s.sport,noApps,other,identity,evidenceRetained,reportedUnresolved:n.health.unresolvedRows});
 }
 return {partitions:result,unresolved:result.reduce((n,r)=>n+r.noApps+r.other+r.identity,0),rawRowsPublished:0,recoveredOffers:0,modelInputsApproved:false};
}
module.exports={audit};
if(require.main===module){try{const root=fs.realpathSync(process.argv[2]);const file=path.join(root,relative);const data=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(file,'utf8'),'base64')));console.log(JSON.stringify(audit(data)));}catch{console.error('Private pilot audit failed');process.exitCode=1;}}
