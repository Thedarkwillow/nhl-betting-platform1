'use strict';
// Count-only audit of actual morning archive bytes and first Git chronology.
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),fs=require('node:fs');
const {pacific}=require('./pacific-morning-capture-gate.cjs');
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const within=(t,day,slot)=>{try{const c=pacific(t);return c.day===day&&String(c.hour).padStart(2,'0')===slot.slice(0,2);}catch{return false;}};
function inspect({raw,normalized,first,day,slot,book,sport}){
 const n=normalized;
 if(!within(first,day,slot)||!within(n.firstObservedAt,day,slot)||!within(n.lastObservedAt,day,slot)||Date.parse(n.lastObservedAt)>Date.parse(first)+999||n.sourceDigest!==hash(raw)||n.localDay!==day||n.slot!==slot||n.book!==book||n.sport!==sport||n.withinSlot!==true)return null;
 const source=JSON.parse(raw);if(source.book!==book||source.sport!==sport||source.localDay!==day||source.slot!==slot)return null;
 const h=n.health||{};return {book,sport,boardState:['empty','disabled','populated','partial'].includes(n.boardState)?n.boardState:'unknown',pages:Number.isSafeInteger(h.pages)?h.pages:0,offers:Number.isSafeInteger(h.distinctOfferKeys)?h.distinctOfferKeys:0,unresolved:Number.isSafeInteger(h.unresolvedRows)?h.unresolvedRows:0,sourceTraversalVerified:n.pageTraversalComplete===true,originalAppVerified:false,modelApproved:false};
}
function run(root,day,slot,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['06:00','09:00'].includes(slot))throw Error('invalid slot');
 const c=pacific(now);if(day>c.day||day===c.day&&c.hour<=Number(slot.slice(0,2)))return {state:'slot_not_finished',day,slot};
 const prefix='research/pickfinder-premium/'+day+'/'+slot.replace(':','');
 const files=git(root,['ls-tree','-r','--name-only','HEAD','--',prefix]).toString().split('\n').filter(p=>/^research\/pickfinder-premium\/\d{4}-\d{2}-\d{2}\/(?:0600|0900)\/(?:prizepicks|underdog)\/[a-z0-9-]+\/[a-z0-9-]+\/source\.json$/.test(p));
 const rows=[],invalid=[];
 for(const f of files){try{
  const n=f.replace(/source\.json$/,'normalized.json'),a=git(root,['log','--format=%H','--',f]).toString().trim().split('\n'),b=git(root,['log','--format=%H','--',n]).toString().trim().split('\n');
  if(a.length!==1||b.length!==1||a[0]!==b[0]||!/^[a-f0-9]{40}$/.test(a[0]))throw Error();
  const first=git(root,['show','-s','--format=%cI',a[0]]).toString().trim(),parts=f.split('/'),raw=git(root,['show',a[0]+':'+f]),normalized=JSON.parse(git(root,['show',a[0]+':'+n]));
  const row=inspect({raw,normalized,first,day,slot,book:parts[4],sport:parts[5]});if(!row)throw Error();rows.push(row);
 }catch{invalid.push(1);}}
 const byPartition={};for(const row of rows){const k=row.sport+'/'+row.book;const x=byPartition[k]??={attempts:0,completeTraversalAttempts:0,emptyOrDisabledAttempts:0,partialAttempts:0};x.attempts++;if(row.sourceTraversalVerified)x.completeTraversalAttempts++;else if(['empty','disabled'].includes(row.boardState))x.emptyOrDisabledAttempts++;else x.partialAttempts++;}
 return {state:rows.length?'actual_hour_archive_observed':'no_verified_actual_hour_archive',day,slot,verifiedPartitions:Object.keys(byPartition).length,verifiedBatches:rows.length,rejectedBatches:invalid.length,byPartition,fullCoverageCertified:false,originalAppVerified:false,rawRowsPublished:0};
}
if(require.main===module){try{console.log(JSON.stringify(run(fs.realpathSync(process.argv[2]),process.argv[3],process.argv[4])));}catch{console.error('Morning archive audit failed closed');process.exitCode=1;}}
module.exports={inspect,run,within};
