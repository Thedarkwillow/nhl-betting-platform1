'use strict';
// Scheduled private inbox, explicit private rules only. No external provider/account writes.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {evaluateRules,observationsFromBatches}=require('./pickfinder-local-line-alerts.cjs');
const {allBatches}=require('./pickfinder-deep-research.cjs');
function loadRules(root){
 const rel='config/pickfinder-private-line-alert-rules.json',p=path.join(root,rel);if(!fs.existsSync(p))return [];
 if(fs.lstatSync(p).isSymbolicLink()||fs.statSync(p).size>256000)throw Error('rules');
 const raw=execFileSync('git',['show','HEAD:'+rel],{cwd:root,stdio:['ignore','pipe','pipe']});
 if(!raw.equals(fs.readFileSync(p)))throw Error('uncommitted rules');
 const rules=JSON.parse(raw);if(!Array.isArray(rules)||rules.length>200)throw Error('rule count');return rules;
}
function persist(root,results){
 const dir=path.join(root,'research/pickfinder-alert-inbox');
 if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('inbox');
 let added=0;
 for(const x of results){
  if(x.state!=='condition_met'||!(/^[a-f0-9]{64}$/).test(x.receipt||''))continue;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const p=path.join(dir,x.receipt+'.json');
  if(fs.existsSync(p))continue;
  fs.writeFileSync(p,JSON.stringify({kind:'pickfinder_private_alert_receipt_v1',...x,notificationSent:false,delivery:'private_archive_inbox',createdAt:new Date().toISOString(),researchOnly:true})+'\n',{flag:'wx',mode:0o600});added++;
 }return added;
}
function run(root,now=Date.now()){
 if(process.env.RESTRICTED_DESTINATION_VERIFIED!=='1'||!fs.existsSync(path.join(root,'.git')))throw Error('private archive');
 const rules=loadRules(root),results=evaluateRules(rules,rules.some(r=>r.enabled===true)?observationsFromBatches(allBatches(root)):[],{now});
 const added=persist(root,results),states={};for(const x of results)states[x.state]=(states[x.state]||0)+1;
 return {state:'private_alert_inbox',configuredRules:rules.length,states,newReceipts:added,externalNotifications:0,rawRowsPublished:0,paidRequests:0};
}
module.exports={loadRules,persist,run};
if(require.main===module){try{console.log(JSON.stringify(run(fs.realpathSync(process.argv[2]))));}catch{console.error('Private line alert audit rejected');process.exitCode=1;}}
