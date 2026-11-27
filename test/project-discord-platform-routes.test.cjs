'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {dispatch,configDiagnostic}=require('../scripts/send-project-discord-alerts.cjs');
const {buildSuggestions}=require('../scripts/project-discord-suggestions.cjs');
const {collectionStatus}=require('../scripts/project-discord-line-alerts.cjs');
const now=Date.parse('2026-11-27T16:00:00Z'),iso=(offset=0)=>new Date(now+offset*60000).toISOString();
const hash=x=>createHash('sha256').update(x).digest('hex');
const guild='10000000000000000';
const routes=['general','prizepicks-props','prizepicks-suggestions','underdog-props','underdog-suggestions'];
const config=Object.fromEntries(routes.map((name,i)=>[name,{channelId:String(200+i)+'00000000000000',
 webhookUrl:'https://discord.com/api/webhooks/'+String(300+i)+'00000000000000/abcdefghijklmnopqrstuv'+i}]));
const {general,...platform}=config;
const legacy={PROJECT_DISCORD_ALERTS_ENABLED:'1',PROJECT_DISCORD_GUILD_ID:guild,PROJECT_DISCORD_CHANNEL_ID:general.channelId,PROJECT_DISCORD_WEBHOOK_URL:general.webhookUrl};
const env={...legacy,PROJECT_DISCORD_PLATFORM_ROUTING_ENABLED:'1',PROJECT_DISCORD_PLATFORM_ROUTES:JSON.stringify(platform)};
function fixture(options={}){
 let head=0,rows={};
 const posted=[],requests=[];
 const ledger={read:()=>({head,rows:structuredClone(rows)}),save:(prior,state)=>{a.equal(prior,head);rows=structuredClone(state);return ++head;}};
 const client=async(url,o)=>{
  const route=routes.find(k=>url===config[k].webhookUrl||url===config[k].webhookUrl+'?wait=true'),cfg=config[route];
  a.ok(cfg);a.equal(o.redirect,'error');requests.push({route,method:o.method||'GET'});
  const channel_id=options.bad===route?'90000000000000001':cfg.channelId;
  if(o.method==='POST'){
   a.equal(url,cfg.webhookUrl+'?wait=true');
   const payload=JSON.parse(o.body);a.deepEqual(payload.allowed_mentions,{parse:[]});a.ok(payload.content.length<=2000);
   posted.push({route,text:payload.content});return {ok:true,json:async()=>({id:'80000000000000000',channel_id})};
  }
  return {ok:true,json:async()=>({guild_id:guild,channel_id})};
 };
 return {ledger,client,posted,requests};
}
const event=(kind,book,sport='nba')=>({id:hash(JSON.stringify([kind,book,sport])),kind,books:book?[book]:[],sport,observedAt:iso(-2),text:[kind,book,sport].join(' ')});
function modelRow(book='prizepicks',sport='nba'){
 const oe=hash('source'),ce=hash('calibration'),revision='b'.repeat(40);
 return {offer:{sport,book,player:'Example Player',opponent:'Example Opponent',market:'Example Market',tier:'standard',side:'Higher',
  line:27.5,active:true,providerOfferId:'native-42',playerId:'player1',eventId:'game1',marketId:'metric',scope:'full-game',
  originalPlatformVerified:true,exactCurrentOfferVerified:true,playerIdentityVerified:true,eventIdentityVerified:true,gameStartVerified:true,evidenceSha256:oe,gameStartAt:iso(90),verifiedAt:iso(-3)},
 model:{projection:29.1,probability:0.615,confidence:'Moderate',evidenceSummary:'Verified game-log sample, n=32',dataObservedAt:iso(-5),
  calibrated:true,modelApproved:true,modelRevision:revision,calibrationEvidenceSha256:ce,offerEvidenceSha256:oe},
 qualification:{individualResearchEligible:true,existingGatesPassed:true,offerEvidenceSha256:oe,calibrationEvidenceSha256:ce,modelRevision:revision,reviewEvidenceSha256:hash('review'),reviewedAt:iso(-2)}};
}
const report=rows=>({kind:'approved_individual_prop_research_v1',generatedAt:iso(-1),researchOnly:true,rows});
test('automatic delivery keeps all six prop events on the correct platform and qualified rows separate',async()=>{
 const f=fixture(),kinds=['new_prop','line_change','price_change','removed_prop','reposted_prop','alternate_tier'];
 const s=buildSuggestions(report([modelRow(),modelRow('underdog','cs2')]),now);
 const fakes=[event('suggestion','prizepicks'),{...event('new_prop','prizepicks','mlb'),books:['prizepicks','underdog']},event('discrepancy','underdog')];
 const feed=[...kinds.flatMap(kind=>[event(kind,'underdog','cs2'),event(kind,'prizepicks')]),...s,...fakes,event('research_update'),event('collection_status')];
 const result=await dispatch(feed,{...f,env,now,mode:'deliver'});
 a.equal(result.delivered,16);
 a.deepEqual(result.deliveredRoutes,{'prizepicks-props':6,'underdog-props':6,'prizepicks-suggestions':1,'underdog-suggestions':1,general:2});
 const firstTwo=f.posted.slice(0,2);a.ok(firstTwo.every(p=>p.text.includes('NEW PROP')&&p.text.includes('Reposted prop')));
 for(const row of f.posted){
  if(row.route==='general')a.match(row.text,/collection_status|research_update/);
  if(row.route.endsWith('-props')){a.ok(row.text.includes(row.route.replace('-props','')));a.doesNotMatch(row.text,/Example Player|discrepancy/);}
  if(row.route.endsWith('-suggestions'))a.match(row.text,/Example Player vs Example Opponent.*Example Market Higher 27.5.*proj 29.10.*61.5% est.*Moderate.*15:55Z.*sample, n=32/);
 }
 a.equal((await dispatch(feed,{...f,env,now,mode:'deliver'})).delivered,0);
});
test('refuses incomplete and reused routes, independently tests all destinations and keeps legacy usable until setup',async()=>{
 const f=fixture(),bad=fixture({bad:'prizepicks-props'}),options={...f,env,mode:'test_routes',runKey:'121',now};
 a.equal((await dispatch([],{...options,env:legacy})).status,'routes_unconfigured');a.equal(f.requests.length,0);
 a.equal((await dispatch([event('new_prop','prizepicks')],{...options,env:{...legacy,PROJECT_DISCORD_PLATFORM_ROUTING_ENABLED:'1'},mode:'deliver'})).status,'routes_unconfigured');
 await a.rejects(dispatch([],{...options,env:{...env,PROJECT_DISCORD_PLATFORM_ROUTES:JSON.stringify({'underdog-props':platform['underdog-props']})}}),/invalid platform route configuration/);
 await a.rejects(dispatch([],{...options,env:{...env,PROJECT_DISCORD_PLATFORM_ROUTES:JSON.stringify({...platform,'underdog-props':platform['prizepicks-props']})}}),/invalid platform route/);
 const good=await dispatch([],{...options,env:{...env,PROJECT_DISCORD_PLATFORM_ROUTING_ENABLED:'0',PROJECT_DISCORD_BATCH_CONFIG:'{"messagesPerRun":1}'}});
 a.equal(good.delivered,5);a.deepEqual(Object.keys(good.results),routes);
 a.ok(f.posted.every(({text})=>text.includes('No live offer or prediction')));
 a.equal((await dispatch([] ,options)).delivered,0);
 const failure=await dispatch([],{...options,...bad});
 a.equal(failure.delivered,4);a.equal(failure.results['prizepicks-props'],'unconfirmed');
 a.equal(bad.posted.some(p=>p.route==='prizepicks-props'),false);
 const s=buildSuggestions(report([modelRow()]),now);
 a.equal((await dispatch(s,{...options,env:legacy,mode:'deliver'})).delivered,0);
 const old=event('new_prop','prizepicks');
 a.equal((await dispatch([old],{...options,env:legacy,mode:'deliver'})).delivered,1);
 a.equal((await dispatch([old],{...options,mode:'deliver'})).delivered,0);
});
test('isolates a wrong destination and preserves sport filters including esports',async()=>{
 const f=fixture({bad:'prizepicks-props'});
 const r=await dispatch([event('new_prop','prizepicks','cs2'),event('new_prop','underdog','cs2'),event('new_prop','underdog')],
  {...f,env:{...env,PROJECT_DISCORD_FILTERS:'{"sports":["cs2"]}'},now,mode:'deliver'});
 a.equal(r.status,'route_verification_failed');a.deepEqual(r.unavailableRoutes,['prizepicks-props']);
 a.deepEqual(r.deliveredRoutes,{'underdog-props':1});
 a.equal(f.posted.length,1);a.match(f.posted[0].text,/cs2/);
});
test('suggestions abstain on stale or non-current offers, uncalibrated or unapproved models, missing or mismatched evidence and conflicting sides',()=>{
 const row=modelRow();
 for(const [part,field,value] of [
  ['offer','originalPlatformVerified',false],['offer','active',false],['offer','exactCurrentOfferVerified',false],
  ['offer','playerIdentityVerified',false],['offer','eventIdentityVerified',false],['offer','gameStartVerified',false],['offer','verifiedAt',iso(-16)],['offer','gameStartAt',iso(-1)],['offer','gameStartAt',iso(1500)],
  ['model','calibrated',false],['model','modelApproved',false],['model','probability',null],['model','dataObservedAt',iso(-91)],
  ['model','evidenceSummary',''],['model','offerEvidenceSha256',hash('other line')],
  ['qualification','existingGatesPassed',false],['qualification','individualResearchEligible',false],
  ['qualification','calibrationEvidenceSha256',hash('other model')],['qualification','reviewEvidenceSha256',null]
 ]) a.equal(buildSuggestions(report([{...row,[part]:{...row[part],[field]:value}}]),now).length,0,field);
 a.equal(buildSuggestions({kind:'public_prizepicks_model_ranking_v1',rows:[row]},now).length,0);
 a.equal(buildSuggestions(report([row,{...row,offer:{...row.offer,side:'Lower'}}]),now).length,0);
 a.equal(buildSuggestions(report([row,row]),now).length,1);
 const newer={...row,offer:{...row.offer,providerOfferId:'replaced-native-offer'},model:{...row.model,projection:30.2}};
 a.equal(buildSuggestions(report([row]),now)[0].id,buildSuggestions(report([newer]),now)[0].id);
});
test('collection status is recent, counts-only, throttled and routed as an operational event',()=>{
 const board={kind:'board_observation',sport:'nhl',book:'prizepicks',state:'populated',manifestDigest:hash('board'),observedAt:iso(-5),archivedAt:iso(-4)};
 const doc={kind:'public_pickfinder_activity_readiness_v1',generatedAt:iso(0),archiveInvalid:0,events:[board,board]};
 const first=collectionStatus(doc,now),next=collectionStatus({...doc,generatedAt:iso(1)},now+60000);
 a.equal(first.length,1);a.match(first[0].text,/1 populated/);a.equal(first[0].id,next[0].id);
 a.equal(collectionStatus(doc,now+61*60000).length,0);
});

test('bad setup exposes only fixed diagnostic codes and known route names, never configured values',async()=>{
 const f=fixture();
 const check=async(raw,problem,route)=>{
  try{await dispatch([],{...f,env:{...env,PROJECT_DISCORD_PLATFORM_ROUTES:raw},mode:'test_routes',runKey:'13',now});a.fail('expected invalid configuration');}
  catch(error){a.deepEqual(configDiagnostic(error),{status:'invalid_route_configuration',problem,...(route?{route}:{}),paidRequests:0});}
 };
 await check('{"looks-like-a-secret"', 'invalid_routes_json');
 await check(JSON.stringify({...platform,'prizepicks-props':{...platform['prizepicks-props'],channelId:123}}),'invalid_channel_id','prizepicks-props');
 await check(JSON.stringify({...platform,'underdog-props':{...platform['underdog-props'],webhookUrl:'credential-placeholder'}}),'invalid_webhook_url','underdog-props');
 await check(JSON.stringify({'not-a-known-route':platform['underdog-props']}),'missing_route','prizepicks-props');
 a.equal(f.requests.length,0);
 a.equal(configDiagnostic(Error('secret example')),null);
});
