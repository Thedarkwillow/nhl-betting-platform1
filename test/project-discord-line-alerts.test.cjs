'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {compare,research,nbaResearch,message}=require('../scripts/project-discord-line-alerts.cjs');
const {dispatch,gitLedger}=require('../scripts/send-project-discord-alerts.cjs');
const time=Date.parse('2026-11-27T17:20:00Z'),iso=t=>new Date(t).toISOString();
function board(book,minute,entries,overrides={}){
 const t=iso(time-minute*60000), m={book,sport:'nba',lastObservedAt:t,firstObservedAt:t,authenticated:true,
  lastPageReached:true,pageTraversalComplete:true,boardState:'populated',health:{wrongSport:0,priceConflictKeys:0,unresolvedRows:0},...overrides};
 return {entry:{m,digest:book+minute,first:t,offers:entries.map(([p,line,tier='standard',period=null])=>({sport:'nba',book,player:p,market:'points',eventId:'ev',
  detailId:'/players/nba/'+encodeURIComponent(p)+'?prop='+encodeURIComponent('id:points:ev:'+line),tier,period,line,side:'Higher',displayedPrice:'-110',observedAt:t,startAt:iso(time+3600000)}))}};
}
test('derives exact changed, new, missing, alt and contemporaneous cross-book events',()=>{
 const results=compare([
  board('prizepicks',95,[['Alice',2.5],['Bob',8.5],['Alice',1.5,'goblin']]),
  board('prizepicks',3,[['Alice',3.5],['Césa',9.5],['Alice',1.5,'goblin'],['Alice',5.5,'demon']]),
  board('underdog',3,[['Alice',4.5],['Césa',9.5]])],time);
 a.deepEqual(results.events.map(x=>x.kind).sort(),['alternate_tier','discrepancy','line_change','new_prop','removed_prop']);
 a.ok(results.events.find(x=>x.kind==='line_change').text.includes('2.5 → 3.5'));
 a.ok(results.events.every(x=>/^[a-f0-9]{64}$/.test(x.id)));
 a.deepEqual(message(results.events).allowed_mentions,{parse:[]});
});
test('partial, conflicting, stale or unresolved partitions cannot fabricate changes or removals',()=>{
 const p=board('prizepicks',100,[['Alice',2.5]]),fresh=board('prizepicks',3,[['Alice',3.5]]);
 a.equal(compare([p,fresh,board('prizepicks',2,[],{boardState:'partial'})],time).events.length,0);
 a.equal(compare([p,board('prizepicks',2,[],{health:{wrongSport:0,priceConflictKeys:0,unresolvedRows:1}})],time).events.length,0);
 a.equal(compare([p,board('prizepicks',60,[['Alice',3.5]])],time).events.length,0);
 a.equal(compare([fresh,board('underdog',22,[['Alice',4.5]])],time).events.length,0);
 a.equal(compare([fresh,board('underdog',2,[['Alice',4.5,'standard','1H']])],time).events.length,0);
 a.throws(()=>compare([p,{invalidDigest:'bad'}],time),/integrity/);
});
test('unchanged cross-book discrepancy is not announced again',()=>{
 const data=[board('prizepicks',120,[['A',2.5]]),board('underdog',119,[['A',4.5]]),
  board('prizepicks',2,[['A',2.5]]),board('underdog',3,[['A',4.5]])];
 a.equal(compare(data,time).events.length,0);
});
test('only fresh, counts-safe prospective research updates are rendered',()=>{
 const r={kind:'pickfinder_nhlnfl_reviewed_history_performance_v1',generatedAt:iso(time),retrospective:false,modelApproved:false,pregameCommitted:2,independentCommittedGrades:1,paidRequests:0};
 a.equal(research(r,time).length,1);a.equal(research({...r,retrospective:true},time).length,0);
 a.equal(research({...r,pregameCommitted:0},time).length,0);
 const nba={schema:'pickfinder_public_research_health_v1',generatedAt:iso(time),paidRequests:0,modelApproved:false,privateRepoUsed:false,
  rollingProbabilityPerformance:{kind:'rolling_original_probability_performance_v1',researchOnly:true,modelPromoted:false,registered:2,decided:1,pushes:1}};
 a.equal(nbaResearch(nba,time).length,1);
 a.equal(nbaResearch({...nba,privateRepoUsed:true},time).length,0);
});
const channel='123456789012345678',guild='123456789012345679', webhook='https://discord.com/api/webhooks/123456789012345678/test_token_for_completely_mocked_fixture';
const env={PROJECT_DISCORD_WEBHOOK_URL:webhook,PROJECT_DISCORD_CHANNEL_ID:channel,PROJECT_DISCORD_GUILD_ID:guild,PROJECT_DISCORD_ALERTS_ENABLED:'1'};
const event={id:'a'.repeat(64),kind:'research_update',text:'Counts only'};
test('preview never connects and wrong channel never sends or reserves',async()=>{
 const ledger={read:()=>({head:null,rows:{}}),save:()=>a.fail('write')};
 const stub=()=>a.fail('network');
 a.equal((await dispatch([event],{env,mode:'preview',now:time,ledger,client:stub})).delivered,0);
 await a.rejects(dispatch([event],{env,mode:'deliver',now:time,ledger,client:async()=>({ok:true,json:async()=>({guild_id:guild,channel_id:'wrong'})})}),/identity mismatch/);
});
test('reserve before POST; confirmed Discord receipt prevents resend; lost response is not retried',async()=>{
 let rows={},posts=0,expected=false;
 const ledger={read:()=>({head:null,rows}),save:(_h,r)=>{rows=structuredClone(r);return 'commit';}};
 const client=async(url,opts)=>{
  if(!opts.method)return {ok:true,json:async()=>({guild_id:guild,channel_id:channel})};
  posts++;a.ok(url.endsWith('?wait=true'));a.equal(opts.redirect,'error');
  a.ok(Object.values(rows).some(r=>r.state==='reserved'));
  if(expected)throw Error('lost response');
  return {ok:true,json:async()=>({channel_id:channel,id:'123456789012345680'})};
 };
 const o={env,mode:'deliver',now:time,ledger,client};
 a.equal((await dispatch([event],o)).status,'discord_confirmed');a.equal(rows[event.id].state,'confirmed');
 a.equal((await dispatch([event],o)).status,'already_claimed');
 expected=true;const later={...event,id:'b'.repeat(64)};
 await a.rejects(dispatch([later],o),/lost response/);a.equal(rows[later.id].state,'reserved');
 a.equal((await dispatch([later],o)).status,'already_claimed');a.equal(posts,2);
});
test('Git receipt ledger uses exact lease and never writes source branch',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'discord-research-test-'));
 try{
  const local=path.join(tmp,'client'),remote=path.join(tmp,'remote');
  const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});
  git('init','--bare',remote);git('init',local);git('-C',local,'remote','add','origin',remote);
  const l=gitLedger(local),before=l.read(),rows={[event.id]:{at:time,state:'reserved'}};
  const h=l.save(before.head,rows);a.throws(()=>l.save(null,{}));
  a.deepEqual(l.read(),{head:h,rows});
  a.equal(git('-C',local,'ls-remote','--heads','origin','refs/heads/main').toString(),'');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
