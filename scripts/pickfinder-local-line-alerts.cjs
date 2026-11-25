'use strict';
// Local research-only line comparisons. No notifications, wagers, or external account writes.
const crypto=require('node:crypto');
const scopeKeys=['book','sport','player','market','eventId','detailId','tier','side'];
function exactScope(a,b){return scopeKeys.every(k=>a[k]===b[k]);}
function validScope(x){return x&&['prizepicks','underdog'].includes(x.book)&&['Higher','Lower'].includes(x.side)&&['standard','goblin','demon'].includes(x.tier)&&scopeKeys.every(k=>typeof x[k]==='string'&&x[k].length>0);}
function evaluateRules(rules,observations,{now=Date.now(),maxAgeMs=3600000}={}){
 if(!Array.isArray(rules)||!Array.isArray(observations)||!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<=0)throw Error('invalid alert input');
 const output=[];const ids=new Set();
 for(const r of rules){
  if(!validScope(r)||typeof r.id!=='string'||!r.id||ids.has(r.id)||!['at_or_above','at_or_below','cross_up','cross_down'].includes(r.condition)||!Number.isFinite(r.target))throw Error('invalid alert rule');
  ids.add(r.id);
  if(r.enabled!==true){output.push({id:r.id,state:'disabled'});continue;}
  const rows=observations.filter(o=>exactScope(r,o)&&o.explicitPrice===true&&Number.isFinite(o.line)&&Number.isFinite(Date.parse(o.observedAt))&&Date.parse(o.observedAt)<=now).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
  const a=rows[0];if(!a||now-Date.parse(a.observedAt)>maxAgeMs){output.push({id:r.id,state:'no_fresh_evidence'});continue;}
  if(rows.some(o=>o.observedAt===a.observedAt&&o.line!==a.line)){output.push({id:r.id,state:'ambiguous_latest'});continue;}
  const b=rows.find(o=>Date.parse(o.observedAt)<Date.parse(a.observedAt));
  if(r.condition.startsWith('cross')&&(!b||now-Date.parse(b.observedAt)>maxAgeMs||rows.some(o=>o.observedAt===b.observedAt&&o.line!==b.line))){output.push({id:r.id,state:'no_unambiguous_prior_evidence'});continue;}
  const hit=r.condition==='at_or_above'?a.line>=r.target:r.condition==='at_or_below'?a.line<=r.target:r.condition==='cross_up'?b.line<r.target&&a.line>=r.target:b.line>r.target&&a.line<=r.target;
  output.push({id:r.id,state:hit?'condition_met':'condition_not_met',observedAt:a.observedAt,receipt:crypto.createHash('sha256').update(JSON.stringify([r.id,r.condition,r.target,...scopeKeys.map(k=>r[k]),a.observedAt,a.line])).digest('hex'),notificationSent:false});
 }
 return output;
}
function observationsFromBatches(batches){
 const rows=[];for(const b of batches)for(const p of b.pages||[])for(const row of p.rows||[])for(const a of row.apps||[]){
  const o={book:a.book,sport:row.sport,player:row.player,market:row.market,eventId:row.eventId,detailId:row.detailId,tier:a.tier||'standard',side:a.side,line:a.line,observedAt:row.observedAt,explicitPrice:/^[+-]\d{2,4}$/.test(a.displayedPrice||'')};
  if(o.book===b.book&&o.sport===b.sport&&validScope(o)&&o.explicitPrice)rows.push(o);
 }return rows;
}
module.exports={evaluateRules,observationsFromBatches};
if(require.main===module){
 try{const fs=require('node:fs');const [root,rulesFile]=process.argv.slice(2);const rules=JSON.parse(fs.readFileSync(rulesFile,'utf8'));const results=evaluateRules(rules,observationsFromBatches(require('./pickfinder-deep-research.cjs').allBatches(root)));const states={};for(const r of results)states[r.state]=(states[r.state]||0)+1;console.log(JSON.stringify({state:'local_line_alert_dry_run',rules:results.length,states,notificationsSent:0,rawRowsPublished:0}));}
 catch{console.error(JSON.stringify({state:'local_line_alert_dry_run_failed',rawRowsPublished:0}));process.exitCode=1;}
}
