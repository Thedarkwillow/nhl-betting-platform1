'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {sha}=require('../scripts/pickfinder-public-archive.cjs');
const {candidates,exactNhlMatchups,readPartner,makeForecasts,committed,officialGrades,verifiedGrades,
 scoreboard,run,canPublishForecast}=require('../scripts/nhl-public-sog-shadow.cjs');

const at='2026-11-27T23:00:00Z',source='2026-11-27T22:58:00Z',startAt='2026-11-28T00:00:00Z';
const finalAt='2026-11-28T03:00:00Z';
const h='a'.repeat(64), z='b'.repeat(64);
const market='player_shots_on_goal';
const offer={sport:'nhl',book:'prizepicks',player:'Example Skater',market,tier:'standard',line:2.5,
 startAt,observedAt:source,eventId:'pickfinder-fixture-event',detailId:'pickfinder-fixture-player',side:'Higher'};
const researchObservations=['Team','Opponent'].map((metric,i)=>({metric,value:['BOS','NYR'][i],detailId:offer.detailId,origin:'board',observedAt:source}));
const b={m:{sport:'nhl',book:'prizepicks',boardState:'populated',pageTraversalComplete:true,lastObservedAt:source},first:source,digest:h,
 offers:[offer],researchObservations};
const model={sport:'NHL',book:'prizepicks',player:offer.player,gameId:'2026020201',playerId:12345,team:'BOS',opponent:'NYR',
 startAt,market:'shotsOnGoal',tier:'standard',line:2.5,side:'Higher',probability:.6,pushProbability:0,projection:3,
 priorObservations:5,method:'weighted-form-v1/poisson-v0',sourceObservedAt:source,forecastAt:at,manifestDigest:h,
 sourceDetailId:offer.detailId,sourceEventId:offer.eventId,historyDigests:[h],
 modelRevision:'d'.repeat(40),researchOnly:true,modelApproved:false,originalPlatformVerified:false};
const pair=[model,{...model,side:'Lower',probability:.4}];
const projection={type:'projection',id:'restricted-example-id',
 attributes:{stat_type:'Shots On Goal',line_score:2.5,status:'pre_game',odds_type:'standard',allowed_wager_types:'under_or_over',start_time:startAt,game_id:'game'},
 relationships:{new_player:{data:{id:'skater'}},game:{data:{id:'game'}},duration:{data:{id:'11'}}}};
const partnerDoc={meta:{current_page:1,total_pages:1},data:[projection],included:[
 {type:'new_player',id:'skater',attributes:{display_name:offer.player,position:'C',team:'BOS'}},
 {type:'game',id:'game',attributes:{metadata:{game_info:{teams:{home:{abbreviation:'BOS'},away:{abbreviation:'NYR'}}}}}}]};
const partner=()=>readPartner(async()=>({ok:true,json:async()=>partnerDoc}),()=>at);
const freeze=async()=>makeForecasts(pair,await partner(),new Map(),at).rows;
const kind='nhl_public_sog_shadow_forecasts_v1';
test('requires full captured traversal, explicit timestamp, exact matchup and fresh committed evidence',()=>{
 assert.equal(candidates({latest:[b]},at).boards.length,1);
 assert.equal(exactNhlMatchups([b]).size,1);
 assert.equal(exactNhlMatchups([{...b,researchObservations:[...researchObservations,{...researchObservations[0],value:'NYI'}]}]).size,0);
 for(const [alter,reason] of [
  [{...b,m:{...b.m,pageTraversalComplete:false}},'incomplete_traversal'],
  [{...b,offers:[{...offer,startAt:null}]},'missing_exact_pickfinder_start'],
  [{...b,offers:[{...offer,period:'1P'}]},'nonstandard_or_unsupported_scope'],
  [{...b,offers:[{...offer,tier:'goblin'}]},'nonstandard_or_unsupported_scope'],
  [{...b,offers:[{...offer,startAt:'2026-11-27T23:15:00Z'}]},'too_close_or_started'],
  [{...b,offers:[{...offer,observedAt:'2026-11-27T22:54:59Z'}]},'stale_or_uncommitted_offer']
 ]){
  const r=candidates({latest:[alter]},at);assert.equal(r.boards.length,0);assert.equal(r.excluded[reason],1);
 }
});
test('uses one bounded uncredentialed call, rejects pagination and never archives partner rows or IDs',async()=>{
 let calls=0;
 const p=await readPartner(async (url,opt)=>{
  calls++;assert.equal(new URL(url).hostname,'partner-api.prizepicks.com');assert.equal(opt.redirect,'error');
  assert.equal(opt.headers.authorization,undefined);return {ok:true,json:async()=>partnerDoc};
 },()=>at);
 assert.equal(calls,1);
 const r=makeForecasts(pair,p,new Map(),at);
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].side,'Higher');
 assert.equal(r.rows[0].higherProbability,.6);assert.ok(r.rows[0].partnerResponseDigest);
 assert.ok(!JSON.stringify(r.rows).includes(projection.id));
 assert.ok(!JSON.stringify(r.rows).includes('under_or_over'));
 await assert.rejects(readPartner(async()=>({ok:true,json:async()=>({...partnerDoc,meta:{current_page:1,total_pages:2}})}),()=>at));
});
test('rejects one-sided, mismatched, ambiguous and already frozen decisions',async()=>{
 const p=await partner();
 assert.equal(makeForecasts([model],p,new Map(),at).excluded.pickfinder_both_sides_unverified,1);
 const groups=new Map([...p.groups].map(([k])=>[k,[['Higher']]]));
 assert.equal(makeForecasts(pair,{...p,groups},new Map(),at).excluded.partner_both_sides_unverified,2);
 assert.equal(makeForecasts(pair,{...p,groups:new Map([...p.groups].map(([k])=>[k,[['Higher','Lower'],['Higher','Lower']]]))},new Map(),at).excluded.ambiguous_partner_match,2);
 assert.equal(makeForecasts(pair.map(x=>({...x,opponent:'NYI'})),p,new Map(),at).excluded.no_exact_partner_match,2);
 const rows=await freeze();
 assert.equal(makeForecasts(pair,p,new Map([['other threshold',{row:{...rows[0],line:3.5}}]]),at).excluded.already_frozen_player_game,2);
});
test('cannot publish or accept after the source freshness deadline or fifteen-minute lead',async()=>{
 const rows=await freeze(),doc={kind,generatedAt:at,rows};
 assert.ok(canPublishForecast(doc,Date.parse(at)));
 assert.ok(!canPublishForecast(doc,Date.parse(source)+300000));
 assert.ok(!canPublishForecast({...doc,rows:[{...rows[0],startAt:'2026-11-27T23:15:00Z'}]},Date.parse(at)));
 assert.equal(committed([{doc,digest:h,first:at}],finalAt).size,1);
 assert.equal(committed([{doc,digest:h,first:'2026-11-28T00:01:00Z'}],finalAt).size,0);
});
test('grades only the exact independently observed official final and compares identical thresholds',async()=>{
 const rows=await freeze(),forecasts=committed([{doc:{kind,generatedAt:at,rows},digest:h,first:at}],finalAt);
 const official={event:model.gameId,team:model.team,opp:model.opponent,start:startAt,first:finalAt,digest:z,stats:{sog:4}};
 const index={byPlayer:new Map([[JSON.stringify(['nhl',String(model.playerId)]),[official]]])};
 const grades=officialGrades(forecasts,index,finalAt);
 assert.equal(grades.length,1);
 assert.ok(!officialGrades(forecasts,index,'2026-11-28T02:00:00Z').length);
 assert.ok(!officialGrades(forecasts,{byPlayer:new Map()},finalAt).length);
 const doc={kind:'nhl_public_sog_shadow_grades_v1',generatedAt:finalAt,rows:grades};
 assert.equal(verifiedGrades([{doc,first:finalAt}],grades,finalAt).size,1);
 assert.equal(verifiedGrades([{doc:{...doc,rows:[{...grades[0],actual:2}]},first:finalAt}],grades,finalAt).size,0);
 const scores=scoreboard(forecasts,grades);
 assert.equal(scores.decisions,1);assert.equal(scores.modelWins,1);assert.equal(scores.alwaysHigherWins,1);
 assert.equal(scores.alwaysLowerWins,0);assert.ok(Math.abs(scores.brier-.16)<1e-12);
});
test('an immutable public archive without an exact timestamp stays closed without an API request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nhl-sog-fixture-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const g=(...args)=>execFileSync('git',['-C',dir,...args],{stdio:'ignore',env:{...process.env,GIT_COMMITTER_DATE:source,GIT_AUTHOR_DATE:source}});
 g('init');g('config','user.name','Fixture');g('config','user.email','fixture@example.invalid');
 const persist=(folder,doc)=>{
  const raw=JSON.stringify(doc)+'\n',digest=sha(raw),d=path.join(dir,'research','pickfinder-public-v1',folder);
  fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,digest+'.json'),raw);return digest;
 };
 const sourceDigest='c'.repeat(64),common={sport:'nhl',book:'prizepicks',sourceDigest};
 const part=persist('board-parts',{...common,schema:'pickfinder-public-board-part-v1',field:'offers',rows:[{...offer,startAt:null}]});
 const digest=persist('boards',{...b.m,...common,schema:'pickfinder-public-normalized-v1',authenticated:true,
  firstObservedAt:source,partDigests:[part],health:{distinctOfferKeys:1,researchFields:0,unpricedTierObservations:0,sportsbookQuoteObservations:0}});
 g('add','.');g('commit','-m','fixture');
 const r=await run(dir,{mode:'capture',manifestDigest:digest,clock:()=>at,fetchPartner:async()=>assert.fail('no partner request allowed')});
 assert.equal(r.lastCapture.excluded.missing_exact_pickfinder_start,1);assert.equal(r.lastCapture.partnerRequests,0);
 assert.equal(r.committedForecasts,0);assert.equal(r.modelApproved,false);
 const summary=await run(dir,{clock:()=>at});
 assert.equal(summary.lastCapture.excluded.missing_exact_pickfinder_start,1);
});
test('full Git-backed exact offer fixture freezes, verifies, grades and scores with no private checkout',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nhl-sog-e2e-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let gitClock=source;
 const g=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore',env:{...process.env,GIT_COMMITTER_DATE:gitClock,GIT_AUTHOR_DATE:gitClock}});
 const put=(folder,doc)=>{
  const raw=JSON.stringify(doc)+'\n',digest=sha(raw),d=path.join(root,'research',folder);
  fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,digest+'.json'),raw);return digest;
 };
 const archive='pickfinder-public-v1/',native='pickfinder-public-identity-v1/';
 const common={sport:'nhl',book:'prizepicks',sourceDigest:h};
 g('init');g('config','user.name','Fixture');g('config','user.email','fixture@example.invalid');
 const part=(field,rows)=>put(archive+'board-parts',{...common,schema:'pickfinder-public-board-part-v1',field,rows});
 const partDigests=[part('offers',[offer,{...offer,side:'Lower'}]),part('researchObservations',researchObservations)];
 const digest=put(archive+'boards',{...b.m,...common,schema:'pickfinder-public-normalized-v1',authenticated:true,
  firstObservedAt:source,partDigests,health:{distinctOfferKeys:2,researchFields:2,unpricedTierObservations:0,sportsbookQuoteObservations:0}});
 const upcoming={eventId:model.gameId,startAt,namespace:'nhl:official',status:'pre',completed:false,teams:[{id:'BOS',abbr:'BOS'},{id:'NYR',abbr:'NYR'}]};
 put(native+'native-facts',{kind:'independent_public_sport_identity_facts_v1',sport:'nhl',source:'nhl:official',observedAt:source,events:[upcoming],
  roster:[{playerId:String(model.playerId),name:model.player,position:'C',team:'BOS',teamId:'BOS'}],
  proofs:[{url:'https://api-web.nhle.com/v1/schedule/2026-11-27',digest:h,observedAt:source},
   {url:'https://api-web.nhle.com/v1/roster/BOS/20262027',teamId:'BOS',digest:h,observedAt:source}]});
 put(native+'nhl-final-stat-facts',{kind:'nhl_official_recent_final_stats_v1',observedAt:source,
  games:[21,22,23,24,25].map((day,i)=>({event:{...upcoming,eventId:String(2026020101+i),startAt:'2026-11-'+day+'T01:00:00Z',status:'post',completed:true},
    observedAt:'2026-11-'+day+'T04:00:00Z',sourceDigest:z,rows:[{playerId:String(model.playerId),team:'BOS',appeared:true,stats:{sog:4}}]}))});
 g('add','research');g('commit','-m','Commit source and history before model freeze');
 let r=await run(root,{mode:'capture',manifestDigest:digest,clock:()=>at,fetchPartner:partner});
 assert.equal(r.lastCapture.candidateOffers,2);assert.equal(r.lastCapture.projectedSides,2);
 assert.equal(r.lastCapture.matchedDecisions,1,JSON.stringify(r));
 gitClock=at;g('add','research');g('commit','-m','Freeze prospectively');
 put(native+'nhl-final-stat-facts',{kind:'nhl_official_recent_final_stats_v1',observedAt:finalAt,
  games:[{event:{...upcoming,status:'post',completed:true},observedAt:finalAt,sourceDigest:z,
   rows:[{playerId:String(model.playerId),team:'BOS',appeared:true,stats:{sog:5}}]}]});
 gitClock=finalAt;g('add','research');g('commit','-m','Archive independent final');
 r=await run(root,{clock:()=>finalAt});
 assert.equal(r.committedForecasts,1);assert.equal(r.lastRun.newStagedGrades,1);
 assert.equal(r.performance.decisions,0);
 g('add','research');g('commit','-m','Archive independent grade');
 r=await run(root,{clock:()=>finalAt});
 assert.equal(r.performance.decisions,1);assert.equal(r.performance.modelWins,1);
 assert.equal(r.performance.alwaysHigherWins,1);assert.equal(r.performance.alwaysLowerWins,0);
 assert.equal(r.modelApproved,false);assert.equal(r.productionChanged,false);
});
