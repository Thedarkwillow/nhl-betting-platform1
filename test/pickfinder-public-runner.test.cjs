'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{safe}=require('../scripts/pickfinder-public-archive.cjs'),{invocation,queue,publicProfile}=require('../scripts/pickfinder-public-runner.cjs');
test('publication excludes credentials and account state',()=>{assert.deepEqual(safe({player:'Fixture Player',price:'-110'}),{player:'Fixture Player',price:'-110'});for(const x of [{password:'secret'},{value:'user@example.com'},{cookie:'abc'},{value:'Bearer abc'}])assert.throws(()=>safe(x));});
test('morning is actual-hour only, no private token',()=>{const e={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};assert.equal(invocation(e,new Date('2026-11-25T14:07:00Z')).allowed,true);assert.equal(invocation(e,new Date('2026-11-25T17:07:00Z')).allowed,false);});
test('fallback plans only missing core partitions while ordinary collection keeps broader traversal',()=>{
 const {boardTargets}=require('../scripts/pickfinder-public-runner.cjs');
 assert.deepEqual(boardTargets(null,['nfl/underdog']),[{code:'NFL',book:'underdog'}]);
 assert.deepEqual(boardTargets(null,[]),[]);
 assert.deepEqual(boardTargets(null).slice(0,2),[{code:'NBA',book:'prizepicks'},{code:'NBA',book:'underdog'}]);
 assert.ok(boardTargets(null).some(x=>x.code==='CS2'));
});
test('queue resumes only current completed profile scopes',()=>{const b={book:'prizepicks',sport:'nba',offers:[{player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'}]};const q=queue([b],[]);assert.equal(q.total,1);const x=q.pending[0];const p=publicProfile({...x,research:[{origin:'profile',metric:'displayed panel',value:'not published'},{origin:'profile',metric:'row 1',value:'5',scope:'Stats'}],profileCollection:{truncated:false}});assert.equal(p.research.length,1);assert.equal(queue([b],[{records:[p]}]).pending.length,0);});

test('board chunks retain individual records and manifest separates them',()=>{const {splitBoard}=require('../scripts/pickfinder-public-runner.cjs');const x=splitBoard({book:'prizepicks',sport:'nba',sourceDigest:'a',offers:[{line:1}],researchObservations:[],unpricedTierObservations:[],sportsbookQuotes:[]});assert.equal(x.parts.length,1);assert.equal(x.parts[0].rows.length,1);assert.equal(x.meta.offers,undefined);});

test('exact shared detail scopes deduplicate across books but preserve line and context',()=>{const offer={player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'};const a={book:'prizepicks',sport:'nba',offers:[offer]},b={book:'underdog',sport:'nba',offers:[offer,{...offer,detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A6'},{...offer,period:'1st_half'}]};const q=queue([a,b],[]);assert.equal(q.total,3);assert.equal(q.sharedAcrossBooks,1);const shared=q.pending.find(x=>x.books.length===2);assert.deepEqual(shared.books,['prizepicks','underdog']);const p=publicProfile({...shared,research:[{origin:'profile',metric:'row 1',scope:'Stats',value:'5'}],profileCollection:{truncated:false}});assert.equal(p.bookCoverageVerified,false);assert.equal(queue([a,b],[{records:[p]}]).pending.length,2);});

test('scheduled provenance must match an independently verified successful actual-hour workflow attempt',()=>{
 const {captureOrigin}=require('../scripts/pickfinder-public-runner.cjs'),{scheduledRunMatches}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40)};
 const p={expected:'06:00'},o=captureOrigin(env,p),day='2026-11-25',slot='06:00',first='2026-11-25T14:20:00Z';
 const run={id:123,run_attempt:1,event:'schedule',head_sha:env.GITHUB_SHA,head_branch:'main',repository:{full_name:'Thedarkwillow/nhl-betting-platform1'},path:'.github/workflows/pickfinder-premium-hosted.yml',status:'completed',conclusion:'success',run_started_at:'2026-11-25T14:07:00Z'};
 assert.equal(scheduledRunMatches(o,run,day,slot,first),true);
 assert.equal(scheduledRunMatches({...o,cron:'29 6 * * *'},run,day,slot,first),false);
 assert.equal(scheduledRunMatches({...o,cron:'29 6 * * *'},{...run,run_started_at:'2026-11-25T14:29:30Z'},day,slot,'2026-11-25T14:34:00Z'),true);
 assert.equal(scheduledRunMatches({...o,cron:'29 9 * * *'},run,day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,event:'workflow_dispatch'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,run_started_at:'2026-11-25T17:07:00Z'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,conclusion:'failure'},day,slot,first),false);
 assert.equal(scheduledRunMatches(o,{...run,run_attempt:2},day,slot,first),false);
 assert.equal(captureOrigin({...env,GITHUB_RUN_ID:'bad'},p),null);
 assert.equal(captureOrigin(env,{expected:'09:00'}),null);
 assert.equal(scheduledRunMatches(null,run,day,slot,first),false);
});


test('historical cache shadow only deduplicates explicit prior-season dated structured facts and rejects conflicts',()=>{
 const {audit,candidate}=require('../scripts/pickfinder-public-history-cache.cjs'),{VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const now=new Date('2026-11-25T15:00:00Z');
 const f={origin:'profile',metric:'row 1',tab:'Game Log',scope:'Date | PTS',value:JSON.stringify([{value:'2024-11-01',labels:[]},{value:'12',labels:[]}]),observedAt:'2026-11-25T14:00:00Z',filterSelection:[{label:'season',display:'2024-25',value:'2024'}]};
 const r={status:'sampled',coverageVersion:VERSION,truncated:false,sport:'nba',player:'Fixture',market:'points',detailId:'/players/nba/a?prop=x',research:[f]};
 assert.ok(candidate(r,f,now));assert.equal(candidate(r,{...f,filterSelection:[]},now),null);
 assert.equal(candidate(r,{...f,origin:'line_movement'},now),null);assert.equal(candidate({...r,truncated:true},f,now),null);
 const changed={...r,detailId:'/players/nba/a?prop=y',research:[f]};
 const conflict={...r,research:[{...f,value:f.value.replace('"12"','"14"')}]};
 const half={...r,period:'first_half'};
 const x=audit([{records:[r,changed,conflict,half]}],now);
 assert.equal(x.candidates,4);assert.equal(x.duplicateObservations,1);assert.equal(x.distinctKeys,2);assert.equal(x.conflictedKeys,1);assert.equal(x.requestsSkipped,0);assert.equal(x.completeSeasonCertified,false);
 assert.equal(candidate(r,{...f,filterSelection:[{label:'season',display:'2025-26'}]},now),null);
 assert.equal(candidate(r,{...f,value:f.value.replace('2024-11-01','11/01')},now),null);
});


test('parallel profile trial is isolated to explicit manual deep collection',()=>{
 const {profileWorkers}=require('../scripts/pickfinder-public-runner.cjs');
 const env={GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'deep_research_now'},p={expected:'manual',deep:true};
 assert.equal(profileWorkers(env,p),2);
 for(const e of [{...env,GITHUB_EVENT_NAME:'schedule'},{...env,REQUESTED_MODE:'board_and_deep'},{...env,REQUESTED_MODE:'nba_context_only'}])assert.equal(profileWorkers(e,p),1);
 assert.equal(profileWorkers(env,{...p,expected:'09:00'}),1);
 assert.equal(profileWorkers(env,{...p,contextOnly:true}),1);
});

test('manual board, feature, and context sessions are isolated from deep and protected slots',()=>{
 const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'workflow_dispatch'};
 const at=new Date('2026-11-25T20:00:00Z'),b=invocation({...env,REQUESTED_MODE:'boards_only'},at),f=invocation({...env,REQUESTED_MODE:'features_only'},at),c=invocation({...env,REQUESTED_MODE:'nba_context_only'},at);
 assert.equal(b.boardsOnly,true);assert.equal(b.deep,false);assert.equal(f.featuresOnly,true);assert.equal(f.deep,true);assert.equal(c.contextOnly,true);
 for(const mode of ['boards_only','features_only','nba_context_only','board_and_deep','deep_research_now','probe_now','nba_history_repair','timezone_validation'])for(const hour of [13,14,16,17])assert.equal(invocation({...env,REQUESTED_MODE:mode},new Date('2026-11-25T'+hour+':01:00Z')).allowed,false);
 const delayed={...env,GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 16 * * *'};
 assert.equal(invocation(delayed,new Date('2026-11-25T13:20:00Z')).allowed,false);
 assert.equal(invocation(delayed,new Date('2026-11-25T18:00:00Z')).allowed,true);
});

test('historical cache exact lookup excludes conflicts',()=>{
 const {buildIndex,lookup,candidate}=require('../scripts/pickfinder-public-history-cache.cjs'),{VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const now=new Date('2026-11-25T15:00:00Z'),f={origin:'profile',metric:'row 1',tab:'Game Log',scope:'Date | PTS',value:JSON.stringify([{value:'2024-11-01',labels:[]},{value:'12',labels:[]}]),observedAt:'2026-11-25T14:00:00Z',filterSelection:[{label:'season',display:'2024-25',value:'2024'}]};
 const r={status:'sampled',coverageVersion:VERSION,truncated:false,sport:'nba',player:'Fixture',market:'points',detailId:'/players/nba/a?prop=x',research:[f]};
 const k=candidate(r,f,now).key;
 const x=buildIndex([{records:[r]}],now);assert.deepEqual(lookup(x.index,k).field,f);
 const y=buildIndex([{records:[r,{...r,research:[{...f,value:f.value.replace('"12"','"14"')}]}]}],now);assert.equal(lookup(y.index,k),null);assert.equal(y.summary.requestsSkipped,0);
});

test('feature authentication waits before checking and fails closed',async()=>{
 const {waitPremium}=require('../scripts/pickfinder-public-runner.cjs');
 const calls=[],page={getByRole:()=>({waitFor:async()=>calls.push('menu')}),waitForFunction:async()=>calls.push('premium')};
 assert.equal(await waitPremium(page,async()=>{calls.push('verify');return true;}),true);
 assert.deepEqual(calls,['menu','premium','verify']);
 assert.equal(await waitPremium({...page,waitForFunction:async()=>{throw Error('timeout');}},async()=>true),false);
 assert.equal(await waitPremium(page,async()=>false),false);
});
test('cache rejection counts reconcile without allowing unknown historical rows',()=>{
 const {audit}=require('../scripts/pickfinder-public-history-cache.cjs'),{VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const now=new Date('2026-11-25T15:00:00Z'),f={origin:'profile',metric:'row 1',tab:'Game Log',scope:'Date | PTS',value:JSON.stringify([{value:'2024-11-01'},{value:'12'}]),observedAt:'2026-11-25T14:00:00Z',filterSelection:[{label:'season',display:'2024-25'}]};
 const r={status:'sampled',coverageVersion:VERSION,truncated:false,sport:'nba',player:'Fixture',market:'points',detailId:'/players/nba/a',research:[f,{...f,filterSelection:[]},{...f,value:f.value.replace('2024-11-01','11/01')}]};
 const x=audit([{records:[r,{...r,truncated:true,research:[f]}]}],now);
 assert.equal(x.candidates,1);assert.equal(x.fields,4);
 assert.deepEqual(x.rejectionReasons,{prior_season_unverified:1,game_date_unverified:1,truncated_profile:1});
 assert.equal(x.requestsSkipped,0);assert.equal(x.modelInputsApproved,false);
});

test('season and date shape diagnostics never promote ambiguous rows',()=>{
 const {seasonShape,dateShape,priorSeason}=require('../scripts/pickfinder-public-history-cache.cjs');
 const now=new Date('2026-11-25T15:00:00Z');
 assert.equal(seasonShape(null,now),'absent');
 assert.equal(seasonShape([{label:'season',value:'2024'}],now),'value_only');
 assert.equal(seasonShape([{label:'season',display:'2025-26'}],now),'year_or_range_not_prior');
 assert.equal(seasonShape([{label:'season',display:'2024-25'}],now),'explicit_prior');
 assert.equal(seasonShape([{label:'season',display:'Current season'}],now),'relative_or_all');
 assert.equal(priorSeason([{label:'season',display:'Current season'}],now),null);
 assert.equal(dateShape({scope:'Date | PTS',value:JSON.stringify([{value:'11/01'},{value:'10'}])}),'numeric_without_year');
 assert.equal(dateShape({scope:'Date | PTS',value:JSON.stringify([{value:'2024-11-01'},{value:'10'}])}),'iso_day');
 assert.equal(dateShape({scope:'Opponent | PTS',value:'[]'}),'no_unique_date_header');
});

test('feature inspector opens only a unique named navigation control and verifies panel',async()=>{
 const {inspectTool}=require('../scripts/pickfinder-tool-schema.cjs');
 const calls=[];
 const b={isVisible:async()=>true,isEnabled:async()=>true,click:async()=>calls.push('open')};
 const page={url:()=> 'https://www.pickfinder.app/props',locator:()=>({evaluateAll:async()=>[0],nth:()=>b}),waitForFunction:async()=>{},evaluate:async(fn,args)=>args.allowed?[]:{verified:true,controls:[{label:'Pick Builder',kind:'h2',disabled:false,inputType:null}]}};
 const x=await inspectTool(page,'builder',async()=>true);assert.equal(x.state,'read_only_schema_observed');assert.equal(x.method,'navigation_button');assert.equal(x.mutations,0);assert.deepEqual(calls,['open']);
 const ambiguous={...page,locator:()=>({evaluateAll:async()=>[0,1]}),evaluate:async(fn,args)=>args.allowed?[]:{verified:false,controls:[]}};
 assert.equal((await inspectTool(ambiguous,'builder',async()=>true)).state,'navigation_not_verified');
 const missing={...page,waitForFunction:async()=>{throw Error('missing panel')}};
 assert.equal((await inspectTool(missing,'alerts',async()=>true)).state,'panel_or_route_unverified');
 assert.equal((await inspectTool(page,'alerts',async()=>false)).state,'session_or_route_unverified');
});

test('malformed NBA historical header requeues only affected scopes until newer aligned evidence',()=>{
 const b={book:'prizepicks',sport:'nba',offers:[{player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'},{player:'Other',detailId:'/players/nba/b?prop=y%3Apoints%3Ae%3A5',market:'points',eventId:'e'}]};
 const q=queue([b],[]),x=q.pending.find(p=>p.player==='Fixture'),y=q.pending.find(p=>p.player==='Other');
 const heads=['Date','Opponent',...Array.from({length:87},(_,i)=>'Sport stat '+i)];
 const f={origin:'profile',tab:'Game Log',metric:'row 1',scope:heads.slice(0,59).join(' | '),value:JSON.stringify(heads.map(()=>({value:'1'}))),observedAt:'2026-11-25T20:00:00Z'};
 const make=(x,f)=>publicProfile({...x,research:[f],profileCollection:{truncated:false}});
 const old=make(x,f),other=make(y,{...f,scope:'Date | PTS',value:'[{"value":"11/20"},{"value":"12"}]'});
 let p=queue([b],[{records:[old,other]}]);
 assert.equal(p.malformedHistoryPending,1);assert.equal(p.repairPending.length,1);assert.equal(p.repairPending[0].player,'Fixture');assert.equal(p.pending.length,1);assert.equal(p.pending[0].player,'Fixture');
 const fixed=make(x,{...f,scope:heads.join(' | '),observedAt:'2026-11-25T21:00:00Z'});
 p=queue([b],[{records:[old,other,fixed]}]);assert.equal(p.malformedHistoryPending,0);assert.equal(p.repairPending.length,0);assert.equal(p.pending.length,0);
});

test('NBA history repair is manual and protects both morning capture windows',()=>{
 const e={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'nba_history_repair'};
 const p=invocation(e,new Date('2026-11-25T20:00:00Z'));
 assert.equal(p.allowed,true);assert.equal(p.deep,true);assert.equal(p.historyRepair,true);
 for(const h of [13,14,16,17])assert.equal(invocation(e,new Date('2026-11-25T'+h+':01:00Z')).allowed,false);
 assert.throws(()=>invocation({...e,GITHUB_EVENT_NAME:'push'},new Date('2026-11-25T20:00:00Z')),/manual repair only/);
});

test('NBA history-only runner excludes unrelated context and discovery prepasses',()=>{
 const fs=require('node:fs'),src=fs.readFileSync(require.resolve('../scripts/pickfinder-public-runner.cjs'),'utf8');
 assert.ok(src.includes('const evidence=p.historyRepair||p.currentProfiles||p.clockAudit||p.partitions||fallback?null:await discover({env});'));
 assert.ok(src.includes('if(!p.historyRepair&&!p.currentProfiles&&alive()){\n   const until=Date.now()+90000,gameAlive='));
 assert.ok(src.includes('if(!p.historyRepair&&!p.currentProfiles&&alive()&&!p.featuresOnly){'));
});

test('historical prop table is collected without treating unrelated stat or movement tables as results',()=>{
 const {readSections}=require('../scripts/pickfinder-player-research.cjs');
 const th=x=>({innerText:x,tagName:'TH',rowSpan:1,colSpan:1});
 const table=(headers,values)=>({getClientRects:()=>[{}],querySelectorAll:s=>s==='thead th'?headers.map(th):s==='thead tr'?[{cells:headers.map(th)}]:s==='tbody tr'?[{cells:values.map(innerText=>({innerText,querySelectorAll:()=>[]}))}]:[]});
 const tables=[table(['Date','Prop Line','Result'],['2026-11-20','5.5','7']),table(['Date','PTS','REB'],['2026-11-20','20','5']),table(['App','Time','Line','Result'],['DraftKings','12:00','5.5','7'])];
 const prior=global.document;
 try{
  global.document={body:{innerText:''},querySelectorAll:s=>s==='table'?tables:[]};
  const fields=readSections({tab:'Prop History',origin:'prop_history',observedAt:'2026-11-26T20:00:00Z',context:{}});
  assert.equal(fields.length,1);assert.equal(fields[0].scope,'Date | Prop Line | Result');assert.equal(fields[0].headerLayout,'span-grid-v1');
  assert.equal(JSON.parse(fields[0].value)[2].value,'7');
 }finally{if(prior===undefined)delete global.document;else global.document=prior;}
});
test('multi-row sporting headers align spans and preserve period-specific labels',()=>{
 const {readSections}=require('../scripts/pickfinder-player-research.cjs');
 const th=(innerText,rowSpan=1,colSpan=1)=>({innerText,tagName:'TH',rowSpan,colSpan});
 const headerRows=[{cells:[th('Date',2),th('Opponent',2),th('Stats',1,2),th('First Half',1,2)]},{cells:[th('PTS'),th('REB'),th('PTS'),th('REB')]}];
 const table={getClientRects:()=>[{}],querySelectorAll:s=>s==='thead tr'?headerRows:s==='thead th'?headerRows.flatMap(r=>r.cells):s==='tbody tr'?[{cells:['11/20','TOR','24','8','10','4'].map(innerText=>({innerText,querySelectorAll:()=>[]}))}]:[]};
 const prior=global.document;
 try{
  global.document={body:{innerText:''},querySelectorAll:s=>s==='table'?[table]:[]};
  const fields=readSections({tab:'Game Log',origin:'profile',observedAt:'2026-11-26T20:00:00Z',context:{}});
  assert.equal(fields[0].scope,'Date | Opponent | PTS | REB | First Half / PTS | First Half / REB');
  assert.equal(fields[0].headerLayout,'span-grid-v1');assert.equal(JSON.parse(fields[0].value).length,6);
 }finally{if(prior===undefined)delete global.document;else global.document=prior;}
});
test('header repair cannot clear a different malformed row or an incomplete replay',()=>{
 const b={book:'prizepicks',sport:'nba',offers:[{player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'}]};
 const x=queue([b],[]).pending[0],stamp='2026-11-25T20:00:00Z',later='2026-11-25T21:00:00Z';
 const row=(metric,scope,observedAt,headerLayout)=>({origin:'profile',tab:'Game Log',metric,scope,value:'[{"value":"11/20"},{"value":"TOR"},{"value":"5"}]',observedAt,headerLayout});
 const record=(fields,truncated=false)=>publicProfile({...x,research:fields,profileCollection:{truncated}});
 const old=record([row('row 1','Date | Opp',stamp),row('row 2','Date | Opp',stamp)]);
 const fixed1=row('row 1','Date | Opp | PTS',later,'span-grid-v1'),fixed2={...fixed1,metric:'row 2'};
 const partial=queue([b],[{records:[old,record([fixed1])]}]);
 assert.equal(partial.malformedHistoryPending,1);assert.equal(partial.unresolvedHistoryRows,1);assert.equal(partial.deferredHistoryScopes,1);
 assert.equal(queue([b],[{records:[old,record([fixed1,fixed2],true)]}]).repairPending.length,1);
 assert.equal(queue([b],[{records:[old,record([fixed1,fixed2])]}]).repairPending.length,0);
});
test('notification menu follows only explicit same-origin allowlisted link',async()=>{
 const {inspectTool}=require('../scripts/pickfinder-tool-schema.cjs');let opened=false,route='https://www.pickfinder.app/props';const visits=[];
 const menu={count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{opened=true;}};
 const page={url:()=>route,locator:()=>({evaluateAll:async()=>[]}),getByRole:(role,o)=>{assert.equal(o.name,'Open user menu');return menu;},goto:async u=>{route=u;visits.push(u);},evaluate:async(fn,args)=>args.allowed?(opened&&args.name==='Notifications'?['https://www.pickfinder.app/settings/notifications','https://example.com/settings/notifications']:[]):{verified:true,controls:[{label:'Notifications',kind:'h2',disabled:false,inputType:null}]}};
 const x=await inspectTool(page,'alerts',async()=>true);
 assert.equal(x.state,'read_only_schema_observed');assert.equal(x.method,'user_menu_link');assert.equal(x.mutations,0);
 assert.deepEqual(visits,['https://www.pickfinder.app/settings/notifications']);
});

test('named navigation can reference its visible control label by ID',async()=>{
 const {navigationButton}=require('../scripts/pickfinder-tool-schema.cjs');
 const attributes={'aria-labelledby':'tool title'};
 const element={matches:()=>true,getAttribute:k=>attributes[k],ownerDocument:{getElementById:id=>({textContent:id==='tool'?'Pick':'Builder'})},querySelector:()=>null,closest:()=>null,getClientRects:()=>[{}]};
 const button={isEnabled:async()=>true,isVisible:async()=>true};
 const page={locator:()=>({evaluateAll:async(fn,names)=>fn([element],names),nth:()=>button})};
 assert.equal(await navigationButton(page,['Pick Builder']),button);
 assert.equal(await navigationButton(page,['Alerts']),null);
});

test('archived queue inputs stay pinned when a later commit adds a bad digest',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {execFileSync}=require('node:child_process');
 const {iterate,archiveRevision,ROOT,sha}=require('../scripts/pickfinder-public-archive.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-iterate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,'-c','user.name=Test','-c','user.email=test@example.invalid',...args],{stdio:'pipe'});
 git('init','-q');
 const dir=path.join(root,ROOT,'profiles'),raw=JSON.stringify({records:[]});
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,sha(raw)+'.json'),raw);
 git('add','.');git('commit','-qm','first');
 const revision=archiveRevision(root);
 fs.writeFileSync(path.join(dir,'a'.repeat(64)+'.json'),raw);
 git('add','.');git('commit','-qm','second');
 assert.deepEqual([...iterate(root,'profiles',revision)],[{records:[]}]);
 assert.throws(()=>[...iterate(root,'profiles')],/archive digest mismatch/);
});

test('reads an already visible Pick Builder sidebar without opening or saving a pick',async()=>{
 const {inspectTool}=require('../scripts/pickfinder-tool-schema.cjs');
 const heading={kind:'h2',label:'Pick Builder'},button={kind:'button',label:'Export'};
 for(const controls of [[heading],[heading,button]]){
  const page={url:()=>'https://www.pickfinder.app/props',locator:()=>({evaluateAll:async()=>[]}),
   evaluate:async(fn,args)=>{
    if(args.allowed)return [];
    assert.equal(args.panel,true);assert.deepEqual(args.names,['Pick Builder','Lineup Builder']);
    return {verified:true,controls};
   }};
  const result=await inspectTool(page,'builder',async()=>true);
  assert.equal(result.state,controls.length===1?'panel_only_observed':'read_only_schema_observed');
  assert.equal(result.method,'visible_panel');assert.equal(result.mutations,0);assert.equal(result.submissionVerified,false);
 }
});


test('floating popup launcher requires unique explicit opening intent and excludes mutable controls',async()=>{
 const {navigationButton}=require('../scripts/pickfinder-tool-schema.cjs');
 const allowed=['Alerts','Open Notifications'];
 const button={isVisible:async()=>true,isEnabled:async()=>true};
 const candidate=(label,popup,extra={})=>{
  const attributes={'aria-label':label,'aria-haspopup':popup,...extra};
  return {matches:()=>false,getAttribute:k=>attributes[k],hasAttribute:k=>Object.hasOwn(attributes,k),
   getClientRects:()=>[{}],querySelector:()=>null,closest:()=>null};
 };
 const find=async elements=>navigationButton({locator:()=>({evaluateAll:(fn,args)=>fn(elements,args),nth:()=>button})},allowed);
 assert.equal(await find([candidate('Open Notifications','dialog')]),button);
 for(const rejected of [candidate('Enable notifications','dialog'),candidate('Alerts','true'),
   candidate('Open Notifications','false'),candidate('Open Notifications','menu',{'aria-pressed':'false'}),
   candidate('Open Notifications','dialog',{type:'submit'})])assert.equal(await find([rejected]),null);
 assert.equal(await find([candidate('Open Notifications','dialog'),candidate('Open Notifications','menu')]),null);
});

test('rolling NBA log requires matching cells, context and header before clearing an old row',()=>{
 const board={sport:'nba',book:'prizepicks',offers:[{player:'Fixture',market:'rebounds',eventId:'e',detailId:'/players/nba/f?prop=rebounds'}]};
 const item=queue([board],[]).pending[0];
 const first='2026-11-25T20:00:00Z',later='2026-11-26T22:00:00Z';
 const row=(day,metric,when,aligned)=>({origin:'profile',tab:'Matchup',scope:aligned?'Date | Opp | REB':'Date | Opp',metric,
  observedAt:when,headerLayout:aligned?'span-grid-v1':undefined,value:JSON.stringify([day,'TOR','8'].map(value=>({value})))});
 const record=(...fields)=>publicProfile({...item,research:fields,profileCollection:{truncated:false}});
 const old=row('11/23','row 1',first,false),differentGame=row('11/25','row 1',later,true),sameGame=row('11/23','row 2',later,true);
 const check=(fields)=>queue([board],[{records:[record(old),record(...fields)]}]);
 const gap=check([differentGame]);
 assert.equal(gap.unresolvedHistoryRows,1);assert.equal(gap.done,0);assert.equal(gap.deferredHistoryScopes,1);
 assert.equal(gap.repairPending.length,0);
 const refreshed=check([differentGame,{...old,observedAt:'2026-11-27T22:00:00Z'}]);
 assert.equal(refreshed.deferredHistoryScopes,0);assert.equal(refreshed.repairPending.length,1);
 assert.equal(check([differentGame,sameGame]).done,1);
 for(const change of [{tab:'Defense'},{filterSelection:[]},{scope:'Date | Team | REB'},{window:'Last 5 Games'}]){
  assert.equal(check([differentGame,{...sameGame,...change}]).unresolvedHistoryRows,1);
 }
});

test('opens exact Notifications menu item in the authenticated account modal',async()=>{
 const {inspectTool}=require('../scripts/pickfinder-tool-schema.cjs');
 const visited=[];
 const visible=action=>({count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>visited.push(action)});
 const page={
  url:()=> 'https://www.pickfinder.app/props',
  locator:()=>({evaluateAll:async()=>[]}),
  getByRole:(role,o)=>visible(role+':'+o.name),
  evaluate:async(fn,args)=>args.allowed?[]:{verified:true,controls:[{label:'Board drops',kind:'h2'}]},
  waitForFunction:async()=>{}
 };
 const result=await inspectTool(page,'alerts',async()=>true);
 assert.equal(result.state,'read_only_schema_observed');
 assert.deepEqual(visited,['button:Open user menu','menuitem:Notifications']);
 assert.equal(result.mutations,0);
});

test('observes only the Builder side choices and dismisses the observed popover',async()=>{
 const {openBoardBuilder}=require('../scripts/pickfinder-tool-schema.cjs'),calls=[];
 const control={count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true};
 const page={
  getByText:()=>control,locator:()=>({...control,first:()=>({...control,click:async()=>calls.push('open')})}),
  getByRole:role=>{assert.equal(role,'dialog');return {filter:()=>({
   waitFor:async()=>{},getByRole:(kind,{name})=>({...control,count:async()=>Number(name==='Over')})
  })};},keyboard:{press:async key=>calls.push(key)}
 };
 const receipt=await openBoardBuilder(page);
 assert.deepEqual(receipt.controls.map(x=>x.label),['Over']);
 assert.deepEqual(calls,['open','Escape']);
 assert.equal(receipt.mutations,0);
});

test('current profiles resume board-exact work without enqueuing legacy repair',()=>{
 const {currentProfileQueue}=require('../scripts/pickfinder-public-runner.cjs');
 const {VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const tick=Date.parse('2026-11-27T07:00:00Z'),iso=ms=>new Date(tick+ms).toISOString();
 const o={book:'prizepicks',sport:'nba',player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e',observedAt:iso(-60000),startAt:iso(3600000),period:null};
 const b={m:{book:o.book,sport:o.sport,authenticated:true,boardState:'populated',pageTraversalComplete:true,lastPageReached:true,
  health:{wrongSport:0,priceConflictKeys:0},firstObservedAt:iso(-60000),lastObservedAt:iso(-60000)},first:iso(-30000),offers:[o]};
 const a={latest:[b],invalid:[]};
 const prior={...o,coverageVersion:VERSION,status:'sampled',truncated:false,research:[{origin:'profile',observedAt:iso(-50000),value:'stats'}]};
 assert.equal(currentProfileQueue(a,[{records:[prior]}],tick).reused,1);
 assert.equal(currentProfileQueue(a,[{records:[{...prior,truncated:true}]}],tick).pending.length,1);
 assert.equal(currentProfileQueue(a,[{records:[{...prior,period:'first_half'}]}],tick).pending.length,1);
 assert.equal(currentProfileQueue({latest:[{...b,offers:[{...o,startAt:iso(-1)}]}],invalid:[]},[],tick).expired,1);
 assert.equal(currentProfileQueue({...a,invalid:['bad']},[],tick).pending.length,0);
 for(const bad of [{boardState:'partial'},{lastPageReached:false},{lastObservedAt:iso(-9*3600000)}])
  assert.equal(currentProfileQueue({latest:[{...b,m:{...b.m,...bad}}],invalid:[]},[],tick).pending.length,0);
});
test('current profile mode only dispatches outside protected morning hours',()=>{
 const e={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',
  GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'current_profiles'};
 assert.equal(invocation(e,new Date('2026-11-27T07:00:00Z')).currentProfiles,true);
 assert.equal(invocation(e,new Date('2026-11-27T13:00:00Z')).allowed,false);
 assert.throws(()=>invocation({...e,GITHUB_EVENT_NAME:'pull_request'},new Date('2026-11-27T07:00:00Z')));
});

test('current profile suppresses only exact shared dated game logs repeated across tabs',()=>{
 const {compactCurrentProfile}=require('../scripts/pickfinder-public-runner.cjs');
 const f={origin:'profile',tab:'Player overview',scope:'Date | Opponent | Pts',metric:'row 1',window:'Last 5 Games',
  headerLayout:'span-grid-v1',value:JSON.stringify([{value:'10/26'},{value:'@BOS'},{value:'6'}])};
 const changed={...f,tab:'Matchup',value:f.value.replace('"6"','"7"')};
 const filtered={...f,tab:'Defense',filterSelection:['Away']};
 const movement={...f,tab:'Line Movement',origin:'line_movement'};
 const result=compactCurrentProfile({research:[f,{...f,tab:'Defense'},changed,filtered,movement]});
 assert.equal(result.identicalSharedLogCopiesNotRearchived,1);
 assert.deepEqual(result.research,[f,changed,filtered,movement]);
});

test('clock audit is strictly manual and keeps exact unique-board profile scope',()=>{
 const {clockAuditTargets}=require('../scripts/pickfinder-public-runner.cjs');
 const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'clock_audit'};
 assert.equal(invocation(env,new Date('2026-11-27T08:15:00Z')).clockAudit,true);
 for(const h of [13,14,16,17])assert.equal(invocation(env,new Date(`2026-11-27T${h}:15:00Z`)).allowed,false);
 assert.throws(()=>invocation({...env,GITHUB_EVENT_NAME:'schedule'},new Date('2026-11-27T08:15:00Z')),/manual bounded/);
 const r={sport:'nba',player:'Fixture',market:'points',eventId:'event',book:'prizepicks',observedAt:'2026-11-27T08:10:00Z',
  detailId:'/players/nba/fixture?prop=fixture%3Apoints%3Aevent%3A4',boardArchiveDigest:'a'.repeat(64)};
 const selected=clockAuditTargets([r,{...r,detailId:r.detailId.slice(0,-1)+'5',hasClock:true},{...r,player:'Invalid',eventId:'other'},
  {...r,player:'Other',detailId:r.detailId.replace('/fixture?','/other?')}]);
 assert.equal(selected.length,2);assert.equal(selected[0].detailId,r.detailId.slice(0,-1)+'5');
 assert.equal(selected[0].boardArchiveDigest,r.boardArchiveDigest);assert.equal(selected[0].eventId,'event');
});

test('current queue prioritizes exact goalie saves scope without retiring other unique players',()=>{
 const {currentProfileQueue}=require('../scripts/pickfinder-public-runner.cjs');
 const tick=Date.parse('2026-11-27T08:00:00Z'),iso=ms=>new Date(tick+ms).toISOString();
 const offer=(player,market,event='e',line='4')=>({book:'prizepicks',sport:'nhl',player,market,eventId:event,
  detailId:'/players/nhl/'+player+'?prop='+encodeURIComponent('p:'+market+':'+event+':'+line),observedAt:iso(-9000),startAt:iso(900000)});
 const goalie=offer('goalie','player_saves'),duplicate=offer('goalie','player_saves','e','5'),newPlayer=offer('new','player_shots_on_goal'),seen=offer('seen','player_points');
 const b={m:{book:'prizepicks',sport:'nhl',authenticated:true,boardState:'populated',pageTraversalComplete:true,lastPageReached:true,
  health:{wrongSport:0,priceConflictKeys:0},firstObservedAt:iso(-9000),lastObservedAt:iso(-9000)},first:iso(-8000),offers:[newPlayer,seen,goalie,duplicate]};
 const prior=[{records:[{...offer('seen','player_goals','old'),currentProfileAttemptedAt:iso(-60000)},
  {...offer('goalie','player_goals','old'),currentProfileAttemptedAt:iso(-60000)}]}];
 const q=currentProfileQueue({latest:[b],invalid:[]},prior,tick);
 assert.deepEqual(q.pending.slice(0,2).map(x=>x.player),['goalie','new']);
 assert.equal(q.distinctSeenGoaliesWithNewSavesScope,1);
 assert.equal(q.distinctNewPlayersQueued,1);
 assert.equal(q.pending.filter(x=>x.player==='goalie').length,1);
 const after=currentProfileQueue({latest:[b],invalid:[]},[...prior,{records:[{...goalie,currentProfileAttemptedAt:iso(-5000)}]}],tick);
 assert.equal(after.pending.filter(x=>x.player==='goalie').length,0);
 assert.equal(after.unchangedSkipped,2);
});

test('Props pagination waits for a new row identity, a stable total, and actual return',async()=>{
 const {observePropsPager,qualifiesPage}=require('../scripts/pickfinder-dashboard-controls.cjs');
 const a={page:1,total:3,rows:2,keys:['p1','p2']};
 const stale={...a,page:2},priceOnly={...stale,keys:['p2','p1']},unstable={...stale,total:4,keys:['p3','p4']};
 const b={...unstable,total:3};
 for(const x of [stale,priceOnly,unstable,{...b,keys:['p3','p3']}])assert.equal(qualifiesPage(x,2,3,a),false);
 const snapshots=[a,stale,priceOnly,unstable,b,a],actions=[];
 const page={url:()=> 'https://www.pickfinder.app/props',getByRole:(r,{name})=>({count:async()=>1,isVisible:async()=>true,
  isEnabled:async()=>true,click:async()=>actions.push(name)})};
 const out=await observePropsPager(page,()=>true,{read:async()=>snapshots.shift(),pause:async()=>{}});
 assert.equal(out.state,'verified_bounded_transition');
 assert.deepEqual(actions,['Next page','Previous page']);assert.equal(out.returnToFirstVerified,true);
 assert.equal(out.fullTraversalVerified,false);assert.equal(out.before.count,2);assert.notEqual(out.before.membersSha256,out.after.membersSha256);
});
test('reads an explicitly scoped builder export menu without interacting with picks or export',async()=>{
 const {inspectTool}=require('../scripts/pickfinder-tool-schema.cjs');
 const calls=[],page={url:()=> 'https://www.pickfinder.app/props',
  getByRole:()=>({all:async()=>[],count:async()=>0}),
  locator:()=>({evaluateAll:async()=>[]}),
  evaluate:async(_fn,args)=>{
   calls.push(args);
   if(args.allowed)return [];
   if(args.label==='pick builder')return {method:'local_builder_export_menu_visible',
    controls:[{label:'Export',kind:'button',disabled:false,inputType:null}]};
   return {verified:false,controls:[]};
  }};
 const r=await inspectTool(page,'builder',async()=>true);
 assert.equal(r.state,'read_only_schema_observed');assert.equal(r.method,'local_builder_export_menu_visible');
 assert.equal(r.controls[0].label,'Export');assert.equal(r.mutations,0);assert.equal(r.submissionVerified,false);
 assert.equal(calls.filter(x=>x.label==='pick builder').length,1);
});

test('profile timing cohorts bind exact ordered scope, selected book and movement probes',()=>{
 const {profileBenchmarkScope}=require('../scripts/pickfinder-public-runner.cjs');
 const a={sport:'nba',player:'A',market:'points',eventId:'a',book:'prizepicks',detailId:'/players/nba/a?prop=x'};
 const b={...a,player:'B',detailId:'/players/nba/b?prop=y'};
 const opts={currentProfiles:true};
 const d=profileBenchmarkScope([a,b],opts);
 assert.match(d.cohortDigest,/^[a-f0-9]{64}$/);
 assert.equal(d.scopes,2);
 assert.equal(profileBenchmarkScope([a,b],opts).cohortDigest,d.cohortDigest);
 for(const [rows,how] of [[[b,a],opts],[[{...a,book:'underdog'},b],opts],
  [[{...a,probeSportsbookMovement:true},b],opts],[[a,b],{}],[[{...a,period:'1H'},b],opts]])
  assert.notEqual(profileBenchmarkScope(rows,how).cohortDigest,d.cohortDigest);
 assert.equal(profileBenchmarkScope([a,a],opts).cohortDigest,null);
 assert.equal(profileBenchmarkScope([{...a,detailId:'https://example.com/players/nba/a?prop=x'}],opts).cohortDigest,null);
});

test('explicit partition recovery only targets validated manual scopes and protects morning runs',()=>{
 const {recoveryPartitions,invocation,boardTargets}=require('../scripts/pickfinder-public-runner.cjs');
 const stamp=new Date('2026-11-28T00:00:00Z');
 const env={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'workflow_dispatch',REQUESTED_MODE:'recover_partitions',REQUESTED_PARTITIONS:'DOTA2/prizepicks, tennis/prizepicks'};
 const p=invocation(env,stamp);
 assert.equal(p.allowed,true);assert.equal(p.boardsOnly,true);
 assert.deepEqual(boardTargets(null,p.partitions).map(x=>x.code.toLowerCase()+'/'+x.book).sort(),['dota2/prizepicks','tennis/prizepicks']);
 assert.equal(invocation(env,new Date('2026-11-27T17:10:00Z')).allowed,false);
 assert.throws(()=>invocation({...env,GITHUB_EVENT_NAME:'schedule'},stamp));
 for(const x of ['','nhl/prizepicks,','mlb/bad','nhl/prizepicks,nhl/prizepicks','nhl/prizepicks,nfl/underdog,nba/prizepicks,cs2/underdog,tennis/prizepicks'])assert.throws(()=>recoveryPartitions(x));
});
