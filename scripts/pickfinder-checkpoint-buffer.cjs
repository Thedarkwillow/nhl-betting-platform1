'use strict';
// Bounded batches retain exact individual records, verified remotely before progress is counted.
function checkpointBuffer({write,onVerified=()=>{},maxRecords=10,maxBytes=7000000,maxMs=30000,clock=Date.now}){
 if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>20||maxBytes<1000||maxBytes>7500000)throw Error('batch policy');
 let pending=[],bytes=0,since=null,failed=false;
 async function flush(){
  if(failed)throw Error('checkpoint buffer failed');
  if(!pending.length)return;
  const rows=pending.slice();
  try{await write(rows);}catch(e){failed=true;throw e;}
  pending=[];bytes=0;since=null;
  for(const row of rows)onVerified(row);
 }
 async function add(row){
  if(failed)throw Error('checkpoint buffer failed');
  const size=Buffer.byteLength(JSON.stringify(row))+1;
  if(size>maxBytes) {await flush();await write([row]);onVerified(row);return;}
  if(pending.length&&(bytes+size>maxBytes||clock()-since>=maxMs))await flush();
  if(!pending.length)since=clock();
  pending.push(row);bytes+=size;
  if(pending.length>=maxRecords||bytes>=maxBytes||clock()-since>=maxMs)await flush();
 }
 return {add,flush,size:()=>pending.length,failed:()=>failed};
}
module.exports={checkpointBuffer};
