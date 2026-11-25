'use strict';
// Independent, conditional paper pilot. Never certify original app availability or production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const PIN='f063be9e64f19028c59efbdcaf5b28f35210ea3d',DIR='outputs/nba/parallel-paper-pilot',dt=Date.parse;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:128*1024*1024}).trim();
function latest(root,dir,at){
 const base=path.join(root,dir);if(!fs.existsSync(base))return null;
 for(const n of fs.readdirSync(base).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort().reverse()){
  const rel=dir+'/'+n;
  try{const p=path.join(root,rel),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>32e6||git(root,['status','--porcelain','--',rel]))continue;
   const commits=git(root,['log','--format=%H','--',rel]).split('\n').filter(Boolean);if(commits.length!==1)continue;
   const first=git(root,['show','-s','--format=%cI',commits[0]]),raw=execFileSync('git',['show',commits[0]+':'+rel],{cwd:root,maxBuffer:40e6,stdio:['ignore','pipe','pipe']});
   if(!raw.equals(fs.readFileSync(p))||!Number.isFinite(dt(first))||dt(first)>dt(at))continue;
   const doc=JSON.parse(raw);if(!Number.isFinite(dt(doc.capturedAt))||dt(doc.capturedAt)>dt(first)+999||dt(doc.capturedAt)>dt(at))continue;
   return {doc,proof:{rel,first,sha256:sha(raw),commit:commits[0]}};
  }catch{}
 }
 return null;
}
const fresh=(x,at,age)=>x&&dt(x.doc.capturedAt)<=dt(at)&&dt(at)-dt(x.doc.capturedAt)<=age&&dt(x.proof.first)<=dt(at);
function build({core,board,schedule,histories,now,revision,tree}){
 const report={kind:'nba_parallel_conditional_pilot_v1',generatedAt:now,modelRevision:revision,modelTree:tree,boardCapturedAt:board?.doc.capturedAt??null,rows:[],sourceProofs:[],researchOnly:true,originalAppAvailabilityVerified:false,authoritativePlayerIdentityVerified:false,prospectiveValidationApproved:false,highConfidenceApproved:0,actualWagersPlaced:0,formalUntouchedCohort:false};
 if(revision!==PIN||!/^[a-f0-9]{40}$/.test(tree)||!Number.isFinite(dt(now)))throw Error('pin');
 if(!fresh(board,now,1800000)||board.doc.kind!=='nba_private_partner_board_v1'||board.doc.completePagination!==true)return {...report,state:'no_fresh_partner_board'};
 if(!fresh(schedule,now,3600000)||schedule.doc.kind!=='nba_official_schedule_v1')return {...report,state:'no_fresh_official_schedule'};
 if(histories.length!==4||histories.some(x=>!x||dt(x.proof.first)>dt(board.doc.capturedAt)||dt(x.doc.capturedAt)>dt(board.doc.capturedAt)||!Array.isArray(x.doc.rows)))return {...report,state:'prior_history_not_verified'};
 const h=core.indexHistory(histories.map(x=>x.doc)),offers=core.board(board.doc,h,schedule.doc,now);
 const rows=core.rankings(offers,h,schedule.doc,[],[],now).filter(p=>p.researchOnly===true&&p.sourceObservedAt===board.doc.capturedAt&&dt(p.gameStartAt)>dt(now)+900000&&Number.isFinite(p.rawSelectedEstimate)&&p.rawSelectedEstimate>.5&&p.rawSelectedEstimate<1);
 return {...report,state:rows.length?'conditional_candidates':'no_eligible_candidates',sourceProofs:[board.proof,schedule.proof,...histories.map(x=>x.proof)],rows};
}
function run(root,candidate,now){
 if(git(candidate,['rev-parse','HEAD'])!==PIN||git(candidate,['status','--porcelain','--untracked-files=all']))throw Error('candidate changed');
 const core=require(path.join(candidate,'src/nba-research-pipeline-v1.cjs')),tree=git(candidate,['rev-parse','HEAD^{tree}']);
 const board=latest(root,'outputs/nba/boards',now),schedule=latest(root,'outputs/nba/schedule',now);
 const histories=['2023-24','2024-25','2025-26','2026-27'].map(s=>latest(root,'outputs/nba/history/'+s,board?.doc.capturedAt??now));
 const result=build({core,board,schedule,histories,now,revision:PIN,tree});
 // One pilot per immutable source board; never overwrite or regenerate.
 let saved=0;if(result.rows.length){
  const dir=path.join(root,DIR);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,board.proof.sha256+'.json');if(!fs.existsSync(file)){fs.writeFileSync(file,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});saved=result.rows.length;}
 }
 return {state:result.state,candidateRows:result.rows.length,newConditionalRows:saved,modelRevision:PIN,formalUntouchedCohort:false,originalAppAvailabilityVerified:false,productionApproved:false,paidRequests:0,rawRowsPublished:0};
}
if(require.main===module){try{console.log(JSON.stringify(run(fs.realpathSync(process.argv[2]),fs.realpathSync(process.argv[3]),new Date().toISOString())));}catch{console.error('Conditional NBA pilot failed closed');process.exitCode=1;}}
module.exports={build,run,latest,PIN,DIR};
