'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {compare,research,nbaResearch,message}=require('../scripts/project-discord-line-alerts.cjs');
const {dispatch,gitLedger}=require('../scripts/send-project-discord-alerts.cjs');
const time=Date.parse('2026-11-27T17:20:00Z'),iso=t=>new Date(t).toISOString();
function board(book,minute,entries,overrides={}){
 const t=iso(time-minute*60000), m={book,sport:'nba',lastObservedAt:t,firstObservedAt:t,authenticated:true,
  lastPageReached:true,pageTraversalComplete:true,boardState:'populated',health:{wrongSport:0,priceConflictKeys:0,unresolvedRows:0,repeatOrUnresolvedLinks:0,reasons:[]},...overrides};
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
test('ambiguous exact scopes never become fabricated new, removed or discrepancy alerts',()=>{
 const duplicate=(b)=>{b.entry.offers.push({...b.entry.offers[0],displayedPrice:'-125'});return b;};
 const clean=board('prizepicks',2,[['Alice',2.5],['New',5.5]]),
  baseline=board('prizepicks',100,[['Alice',2.5]]);
 const ambiguousPrior=compare([duplicate(baseline),clean,board('underdog',3,[['Alice',4.5]])],time);
 a.deepEqual(ambiguousPrior.events.map(e=>e.kind),['new_prop']);
 a.match(ambiguousPrior.events[0].text,/New/);
 const old=board('prizepicks',100,[['Alice',2.5],['Bob',5.5]]);
 const ambiguousCurrent=compare([old,duplicate(board('prizepicks',2,[['Alice',2.5]]))],time);
 a.deepEqual(ambiguousCurrent.events.map(e=>e.kind),['removed_prop']);
 a.match(ambiguousCurrent.events[0].text,/Bob/);
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

test('price-only changes preserve the prior deduplication key and retain the observation timestamp',()=>{
 const old=board('prizepicks',80,[['Alice',2.5]]),current=board('prizepicks',2,[['Alice',2.5]]);
 current.entry.offers[0].displayedPrice='-130';
 const x=compare([old,current],time).events[0];
 a.equal(x.kind,'price_change');a.equal(x.observedAt,current.entry.m.lastObservedAt);
 a.match(message([x]).content,/price -110 → -130.*UTC/);
 const absent=board('prizepicks',1,[],{boardState:'empty',explicitEmpty:true,health:{pages:0,wrongSport:0,priceConflictKeys:0,unresolvedRows:0}});
 a.equal(compare([old,absent],time).events[0].observedAt,absent.entry.m.lastObservedAt);
});

test('Discord receipts track actual category counts, not unsent candidates',async()=>{
 let rows={},payloads=[];
 const ledger={read:()=>({head:null,rows}),save:(_h,r)=>{rows=structuredClone(r);return 'commit';}};
 const client=async(_url,opts)=>{
  if(!opts.method)return {ok:true,json:async()=>({guild_id:guild,channel_id:channel})};
  payloads.push(JSON.parse(opts.body));
  return {ok:true,json:async()=>({channel_id:channel,id:'123456789012345680'})};
 };
 const kinds=['line_change','price_change','new_prop','removed_prop','alternate_tier','discrepancy'];
 const fixture=[...kinds,'research_update'].map((kind,i)=>({
  id:String(i).repeat(64),kind,text:'fixture '+i+' '+('x'.repeat(600)),observedAt:iso(time)
 }));
 const result=await dispatch(fixture,{env,mode:'deliver',now:time,ledger,client});
 a.deepEqual(result.deliveredCategories,Object.fromEntries([...kinds,'research_update'].map(k=>[k,1])));
 a.equal(result.delivered,7);
 a.equal(Object.keys(rows).length,7);
 a.ok(payloads.every(x=>x.content.length<1950));
 a.match(payloads[0].content,/NEW PROP/);
 a.doesNotMatch(payloads[0].content,/Price change/);
 a.equal(payloads.flatMap(x=>x.content.split('\n')).filter(line=>line.startsWith('• ')&&line.endsWith(' UTC')).length,7);
 const replay=await dispatch(fixture.slice(0,6),{env,mode:'deliver',now:time,ledger,client});
 a.deepEqual(replay,{status:'already_claimed',delivered:0,deliveredCategories:{}});
});
test('official availability keeps exact fresh reports, reconciles duplicates, and never assumes participation',()=>{
 const {availability}=require('../scripts/project-discord-line-alerts.cjs');
 const d={kind:'nba_public_official_pregame_availability_v1',modelApproved:false,positiveParticipationVerified:false,
  sourceResponseSha256:'b'.repeat(64),sourceDocumentUrl:'https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-27_12_00PM.pdf',
  reportPublishedAt:'2026-11-27T17:00:00Z',capturedAt:'2026-11-27T17:02:00Z',
  scopes:[JSON.stringify(['2026-11-27','NYK@BOS'])],rows:[{date:'2026-11-27',match:'NYK@BOS',team:'BOS',player:'Example',status:'out'}]};
 const r={digest:'a'.repeat(64),first:'2026-11-27T17:03:00Z',doc:d};
 const events=availability([r,r],time);a.equal(events.length,1);a.match(events[0].text,/1 out/);a.doesNotMatch(events[0].text,/Example/);
 a.deepEqual(availability([r],time+4*3600000),[]);
 a.deepEqual(availability([r,{...r,doc:{...d,sourceResponseSha256:'c'.repeat(64)}}],time),[]);
 a.deepEqual(availability([{...r,doc:{...d,reportPublishedAt:'2026-11-27T16:00:00Z'}}],time),[]);
});

test('notification filters and routes are exact and replay remains deduplicated when a route changes',async()=>{
 const {filterConfig,deliveryBatches}=require('../scripts/send-project-discord-alerts.cjs');
 const n={...event,sport:'nba',books:['prizepicks','underdog'],tier:'standard',kind:'discrepancy'},h={...event,id:'c'.repeat(64),sport:'nhl'};
 a.equal(filterConfig('{"books":["prizepicks"]}')(n),false);
 a.equal(filterConfig('{"sports":["nba"],"kinds":["discrepancy"]}')(n),true);
 a.throws(()=>filterConfig('{"sports":["made-up"]}'));
 const alt='123456789012345689',w=webhook.replace('123456789012345678',alt);
 const routing={...env,PROJECT_DISCORD_SPORT_ROUTES:JSON.stringify({nba:{channelId:alt,webhookUrl:w}})};
 a.deepEqual(deliveryBatches([n,h],routing).map(b=>[b.destination.guild,b.destination.channel]),[[guild,alt],[guild,channel]]);
 a.throws(()=>deliveryBatches([n],{...env,PROJECT_DISCORD_SPORT_ROUTES:JSON.stringify({nba:{channelId:channel,webhookUrl:w}})}));
 let state={},posts=0;
 const ledger={read:()=>({head:null,rows:state}),save:(_h,v)=>{state=structuredClone(v);return 'commit';}};
 const client=async(u,o)=>{const c=u.startsWith(w)?alt:channel;if(o.method)posts++;
  return {ok:true,json:async()=>o.method?{id:'123456789012345680',channel_id:c}:{guild_id:guild,channel_id:c}};};
 a.equal((await dispatch([n,h],{env:routing,mode:'deliver',now:time,ledger,client})).delivered,2);
 a.equal((await dispatch([n,h],{env,mode:'deliver',now:time,ledger,client})).status,'already_claimed');a.equal(posts,2);
});

test('new threshold and alternate combine sides, require a clean prior, and retain unknown sides',()=>{
 const prior=board('prizepicks',70,[['Alice',2.5]]);
 const next=board('prizepicks',2,[['Alice',2.5],['Alice',3.5],['Alice',4.5,'demon']]);
 next.entry.offers.push({...next.entry.offers[1],side:'Lower'});
 const unpriced={...next.entry.offers.pop(),tier:'goblin',line:1.5,side:null,displayedPrice:null};
 next.entry.unpricedTierObservations=[unpriced];
 next.entry.offers.push({...next.entry.offers[1],side:'Lower'});
 const result=compare([prior,next],time).events.filter(x=>['new_prop','alternate_tier'].includes(x.kind));
 a.equal(result.length,3);
 const two=result.find(x=>x.kind==='new_prop');
 a.deepEqual(two.availableDirections,['Higher','Lower']);a.match(two.text,/Higher \/ Lower/);
 a.match(result.find(x=>x.tier==='goblin').text,/sides unverified/);
 a.equal(compare([prior,board('prizepicks',30,[],{boardState:'partial'}),next],time).events.filter(x=>x.kind==='new_prop').length,0);
 prior.entry.m.health.unresolvedRows=1;
 a.equal(compare([prior,next],time).events.filter(x=>x.kind==='new_prop').length,0);
});

test('repost needs a clean documented absence, older observation is retained for batching',()=>{
 const old=board('prizepicks',110,[['Alice',2.5]]),
  missing=board('prizepicks',80,[],{boardState:'empty',explicitEmpty:true,health:{pages:0,wrongSport:0,priceConflictKeys:0,unresolvedRows:0}}),
  back=board('prizepicks',40,[['Alice',2.5]]),latest=board('prizepicks',5,[['Alice',2.5]]);
 const found=compare([old,missing,back,latest],time).events.filter(x=>x.kind==='reposted_prop');
 a.equal(found.length,1);a.equal(found[0].observedAt,back.entry.offers[0].observedAt);
 a.equal(compare([old,missing,back,latest],time+60000).events.find(x=>x.kind==='reposted_prop').id,found[0].id);
 a.equal(compare([old,missing,back,latest],time,{windowMs:25*60000}).events.some(x=>x.kind==='reposted_prop'),false);
});

test('limits defer overflow, not mark it delivered, and new props outrank price across channels',async()=>{
 let rows={},sent=[];
 const ledger={read:()=>({head:null,rows}),save:(_h,v)=>{rows=structuredClone(v);return 'commit';}};
 const ch='123456789012345689', w=webhook.replace(channel,ch);
 const config={...env,PROJECT_DISCORD_SPORT_ROUTES:JSON.stringify({cs2:{channelId:ch,webhookUrl:w}}),
  PROJECT_DISCORD_BATCH_CONFIG:'{"itemsPerMessage":2,"messagesPerChannel":2,"messagesPerRun":2}'};
 const client=async(u,o)=>{const c=u.startsWith(w)?ch:channel;if(o.method)sent.push([c,JSON.parse(o.body).content]);return {
  ok:true,json:async()=>o.method?{id:'123456789012345680',channel_id:c}:{guild_id:guild,channel_id:c}};};
 const make=(i,kind,sport)=>({id:String(i).repeat(64),kind,sport,text:'Fixture '+i,observedAt:iso(time)});
 const stream=[make(1,'price_change','nba'),make(2,'new_prop','cs2'),make(3,'new_prop','cs2'),make(4,'reposted_prop','cs2'),make(5,'alternate_tier','nba')];
 const opts={env:config,mode:'deliver',now:time,ledger,client};
 const first=await dispatch(stream,opts); a.equal(first.delivered,3);a.equal(first.remaining,2);a.deepEqual(first.remainingCategories,{price_change:1,reposted_prop:1});
 a.equal(sent.length,2);a.ok(sent.every(([,text])=>!text.includes('Price change')));
 const second=await dispatch(stream,opts);a.equal(second.delivered,2);a.equal(sent.length,4);
 a.equal((await dispatch(stream,opts)).status,'already_claimed');
});

test('delivery window retains recent release with older independent baseline but never across a long capture gap',()=>{
 const old=board('prizepicks',14*60,[]);
 const next=board('prizepicks',3*60,[['Alice',4.5]]);
 a.equal(compare([old,next],time).events.filter(e=>e.kind==='new_prop').length,1);
 a.equal(compare([board('prizepicks',16*60,[]),next],time).events.filter(e=>e.kind==='new_prop').length,0);
 a.equal(compare([old,next],time,{windowMs:120*60000}).events.filter(e=>e.kind==='new_prop').length,0);
 const {batchConfig}=require('../scripts/send-project-discord-alerts.cjs');
 a.deepEqual(batchConfig(),{itemsPerMessage:6,messagesPerChannel:8,messagesPerRun:12,newPropLookbackMinutes:240});
});

test('release diagnostics distinguish unresolved prior evidence from an eligible unchanged board',()=>{
 const fresh=board('prizepicks',3,[['A',14.5]]);
 const blocked=board('prizepicks',120,[['A',14.5]],{health:{wrongSport:0,priceConflictKeys:0,unresolvedRows:7935,repeatOrUnresolvedLinks:0,reasons:[]}});
 const r=compare([fresh,blocked],time);
 a.equal(r.events.length,0);
 a.deepEqual(r.releaseBaselines['nba/prizepicks'],{latest:'prior_unresolved_rows',counts:{prior_unresolved_rows:1,missing_prior_board:1},releaseCandidates:0});
 const prior=board('prizepicks',120,[['A',14.5]]);
 const noChange=compare([fresh,prior],time);
 a.equal(noChange.releaseBaselines['nba/prizepicks'].latest,'eligible');
 a.equal(noChange.releaseBaselines['nba/prizepicks'].releaseCandidates,0);
 a.equal(noChange.events.length,0);
});
function withTileMembership(b,tierDetails=[]){
 const {m,offers}=b.entry;
 const t=m.lastObservedAt;
 b.entry.unpricedTierObservations=tierDetails.map(([player,line,tier='goblin'])=>({
  ...offers[0],player,line,tier,side:null,displayedPrice:null,originalPlatformVerified:false,
  eligibleForLockedModel:false,observedAt:t,detailId:'/players/nba/'+player+'?prop='+encodeURIComponent('id:points:ev:'+line)
 }));
 const distinct=new Set([...offers,...b.entry.unpricedTierObservations].map(o=>o.detailId)).size,n=tierDetails.length;
 Object.assign(m.health,{appearances:distinct,distinctDetailLinks:distinct,repeatOrUnresolvedLinks:0,
  unresolvedRows:n,unpricedTierObservations:n,distinctOfferKeys:offers.length,reasons:[],
  unresolvedEvidence:{legacyNoEvidence:0,bookBadgeMissing:0,tierWithoutExplicitPrice:n,
   bookBadgeWithoutExplicitPrice:0,ambiguousBookGroup:0,lineMissing:0}});
 return b;
}
test('exact unpriced alternate tiles support observed membership only, without inventing a direction or removal',()=>{
 const prior=withTileMembership(board('prizepicks',70,[['Alice',2.5]]),[['SeenGoblin',1.5]]);
 const next=withTileMembership(board('prizepicks',2,[['Alice',2.5],['NewPlayer',3.5]]),[['NewGoblin',1.5]]);
 const result=compare([prior,next],time);
 a.equal(result.releaseBaselines['nba/prizepicks'].latest,'eligible');
 a.deepEqual(result.events.map(x=>x.kind),['new_prop','alternate_tier']);
 a.match(result.events[1].text,/sides unverified/);
 a.deepEqual(result.events[1].availableDirections,[]);
 a.equal(result.events.some(x=>x.kind==='removed_prop'),false);
});
test('a missing, repeated, conflicting or mismatched card cannot establish an absence baseline',()=>{
 for(const mutate of [
  x=>x.m.health.repeatOrUnresolvedLinks++,
  x=>x.m.health.unresolvedEvidence.bookBadgeMissing++,
  x=>x.m.health.distinctDetailLinks++,
  x=>x.m.health.reasons.push('possible_display_cap_requires_partition_reconciliation'),
  x=>x.unpricedTierObservations[0].eventId='wrong',
  x=>x.unpricedTierObservations[0].line=4.5,
  x=>x.unpricedTierObservations[0].side='Higher',
  x=>x.unpricedTierObservations[0].detailId+='&prop=conflicting',
  x=>x.unpricedTierObservations[0].observedAt=iso(time+1),
  x=>x.unpricedTierObservations[0].detailId='https://example.com'+x.unpricedTierObservations[0].detailId,
  x=>x.m.health.unresolvedEvidence={tierWithoutExplicitPrice:1},
  x=>x.unpricedTierObservations.pop()
 ]){
  const p=withTileMembership(board('prizepicks',80,[['Alice',2.5]]),[['SeenGoblin',1.5]]);
  const n=withTileMembership(board('prizepicks',2,[['Alice',2.5],['NewPlayer',3.5]]));
  mutate(p.entry);
  const h=p.entry.m.health;
  const reason=h.repeatOrUnresolvedLinks||h.reasons.length?'unproven_page_membership':'prior_unresolved_rows';
  a.equal(compare([p,n],time).releaseBaselines['nba/prizepicks'].latest,reason);
  a.equal(compare([p,n],time).events.some(x=>x.kind==='new_prop'),false);
 }
});
test('a previously displayed line with a passed game start is not a new release if the current row lacks the clock',()=>{
 const p=board('prizepicks',90,[['Alice',2.5]]),n=board('prizepicks',2,[['Alice',2.5]]);
 p.entry.offers[0].startAt=iso(time-5*60000);n.entry.offers[0].startAt=null;
 a.deepEqual(compare([p,n],time).events,[]);
});


test('repeated links, missing counters and display caps do not establish absence',()=>{
 const old=board('prizepicks',100,[['Alice',2.5],['Bob',5.5]]);
 const current=board('prizepicks',2,[['Alice',3.5],['New',6.5]]);
 const h=current.entry.m.health;
 for(const patch of [{repeatOrUnresolvedLinks:1},{repeatOrUnresolvedLinks:undefined},
  {reasons:['possible_display_cap_requires_partition_reconciliation']}]){
  current.entry.m.health={...h,...patch};
  const result=compare([old,current],time);
  a.deepEqual(result.events.map(e=>e.kind),['line_change']);
  a.equal(result.releaseBaselines['nba/prizepicks'].latest,'unproven_page_membership');
 }
 current.entry.m.health=h;
 old.entry.m.health.repeatOrUnresolvedLinks=1;
 const result=compare([old,current],time);
 a.equal(result.events.some(e=>['new_prop','alternate_tier','reposted_prop'].includes(e.kind)),false);
 a.equal(result.releaseBaselines['nba/prizepicks'].latest,'unproven_page_membership');
});
