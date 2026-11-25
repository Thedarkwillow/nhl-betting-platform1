'use strict';
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {collect,ORIGIN}=require('./pickfinder-browser.cjs');
const {enrich}=require('./pickfinder-player-research.cjs');
const {archive}=require('./pickfinder-premium-archive.cjs');
const {pacific,WINDOWS}=require('./pacific-morning-capture-gate.cjs');
async function main(){
  const [book,code,slot='manual']=process.argv.slice(2);
  if(!['manual','06:00','09:00'].includes(slot))throw Error('invalid slot');
  if(slot!=='manual'&&WINDOWS[pacific(new Date()).hour]!==slot)throw Error('outside slot');
  const profile=fs.realpathSync(process.env.PICKFINDER_PROFILE_DIR);
  const root=fs.realpathSync(process.env.PICKFINDER_PRIVATE_ROOT);
  if(profile===root||profile.startsWith(root+path.sep)||process.env.RESTRICTED_DESTINATION_VERIFIED!=='1')throw Error('private destination and external profile required');
  const origin=execFileSync('git',['-C',root,'remote','get-url','origin'],{encoding:'utf8'}).trim();
  if(!/^(https:\/\/github\.com\/|git@github\.com:)Thedarkwillow\/nhl-betting-platform(?:\.git)?$/i.test(origin))throw Error('unexpected archive repository');
  const visibility=execFileSync('gh',['api','repos/Thedarkwillow/nhl-betting-platform','--jq','.visibility'],{encoding:'utf8'}).trim();
  if(visibility!=='private')throw Error('archive must be private');
  const {chromium}=require('playwright');
  const browser=await chromium.launchPersistentContext(profile,{headless:true});
  try{
    const board=await browser.newPage();
    await board.goto(ORIGIN+'/props');
    await board.getByRole('button',{name:'Open user menu'}).waitFor({timeout:15000});
    const batch=await collect(board,{book,code,slot});
    const detail=await browser.newPage();
    const seen=new Set();
    for(const page of batch.pages)for(const row of page.rows){
      if(!row.apps.length||seen.has(row.detailId))continue;
      seen.add(row.detailId);
      try{await enrich(detail,row,{navigate:url=>detail.goto(url)});}
      catch{row.profileCollection={status:'unavailable'};}
    }
    batch.endedAt=new Date().toISOString();
    const summary=archive(batch,root,crypto.randomUUID());
    console.log(JSON.stringify(summary));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(()=>{console.error('PickFinder collection failed. Check private runner session, configuration and destination.');process.exitCode=1;});
