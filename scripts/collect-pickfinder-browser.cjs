'use strict';
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {collect,ORIGIN,readBoard}=require('./pickfinder-browser.cjs');
const {enrich}=require('./pickfinder-player-research.cjs');
const {archive}=require('./pickfinder-premium-archive.cjs');
const {pacific,WINDOWS}=require('./pacific-morning-capture-gate.cjs');
async function verifySession(chromium,profile){
  // Close the entire persistent browser context between checks; a new tab is not a restart.
  const checked=[];
  for(let attempt=0;attempt<2;attempt++){
    const browser=await chromium.launchPersistentContext(profile,{headless:true});
    try{
      const board=await browser.newPage();
      await board.goto(ORIGIN+'/props');
      await board.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});
      const state=await board.evaluate(readBoard,{book:'prizepicks',code:'NBA',sport:'nba',observedAt:new Date().toISOString()});
      if(!state.authenticated)throw Error('premium_session_unavailable');
      checked.push(new Date().toISOString());
    }finally{await browser.close();}
  }
  return {kind:'pickfinder_runner_restart_check_v1',authenticatedAfterRestart:true,checkedAt:checked,sourceRequestsMetered:0,rawRowsPublished:0,scheduledCaptureVerified:false};
}
async function main(){
  const [book,code,slot='manual']=process.argv.slice(2);
  const checkOnly=book==='--verify-session';
  if(!checkOnly&&!['manual','06:00','09:00'].includes(slot))throw Error('invalid slot');
  if(!checkOnly&&slot!=='manual'&&WINDOWS[pacific(new Date()).hour]!==slot)throw Error('outside slot');
  const profile=fs.realpathSync(process.env.PICKFINDER_PROFILE_DIR);
  const root=fs.realpathSync(process.env.PICKFINDER_PRIVATE_ROOT);
  if(profile===root||profile.startsWith(root+path.sep)||process.env.RESTRICTED_DESTINATION_VERIFIED!=='1')throw Error('private destination and external profile required');
  const origin=execFileSync('git',['-C',root,'remote','get-url','origin'],{encoding:'utf8'}).trim();
  if(!/^(https:\/\/github\.com\/|git@github\.com:)Thedarkwillow\/nhl-betting-platform(?:\.git)?$/i.test(origin))throw Error('unexpected archive repository');
  const visibility=execFileSync('gh',['api','repos/Thedarkwillow/nhl-betting-platform','--jq','.visibility'],{encoding:'utf8'}).trim();
  if(visibility!=='private')throw Error('archive must be private');
  const {chromium}=require('playwright');
  if(checkOnly){console.log(JSON.stringify(await verifySession(chromium,profile)));return;}
  const browser=await chromium.launchPersistentContext(profile,{headless:true});
  try{
    const board=await browser.newPage();
    await board.goto(ORIGIN+'/props');
    await board.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});
    const batch=await collect(board,{book,code,slot});
    // Persist board immediately; optional profile enrichment is a separate observation.
    const summary=archive(batch,root,crypto.randomUUID());
    console.log(JSON.stringify(summary));
    const budget=Number(process.env.PICKFINDER_PROFILE_LIMIT||0);
    if(!Number.isInteger(budget)||budget<0||budget>50)throw Error('invalid profile limit');
    if(!budget||slot!=='manual'||batch.failure)return;
    const detail=await browser.newPage(),seen=new Set();
    let count=0;
    outer: for(const page of batch.pages)for(const row of page.rows){
      if(!row.apps.length||seen.has(row.detailId))continue;
      seen.add(row.detailId);
      if(count>=budget)break outer;
      count++;
      const profileStartedAt=new Date().toISOString();
      const profileRow={...row,observedAt:profileStartedAt,apps:[],research:[]};
      try{await enrich(detail,profileRow,{navigate:url=>detail.goto(url)});}
      catch{continue;}
      const researchBatch={...batch,slot:'manual',startedAt:profileStartedAt,endedAt:new Date().toISOString(),boardState:'partial',lastPageReached:false,displayedPageCount:1,pages:[{number:1,rows:[profileRow]}]};
      researchBatch.localDay=pacific(new Date(profileStartedAt)).day;
      console.log(JSON.stringify(archive(researchBatch,root,crypto.randomUUID())));
    }
  }finally{await browser.close();}
}
module.exports={verifySession};
if(require.main===module)main().catch(()=>{console.error('PickFinder collection failed. Check private runner session, configuration and destination.');process.exitCode=1;});
