'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{safe}=require('../scripts/pickfinder-public-archive.cjs'),{invocation,queue,publicProfile}=require('../scripts/pickfinder-public-runner.cjs');
test('publication excludes credentials and account state',()=>{assert.deepEqual(safe({player:'Fixture Player',price:'-110'}),{player:'Fixture Player',price:'-110'});for(const x of [{password:'secret'},{value:'user@example.com'},{cookie:'abc'},{value:'Bearer abc'}])assert.throws(()=>safe(x));});
test('morning is actual-hour only, no private token',()=>{const e={PICKFINDER_AUTOMATION_AUTHORIZED:'1',PICKFINDER_PUBLIC_DATA_AUTHORIZED:'1',GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *'};assert.equal(invocation(e,new Date('2026-11-25T14:07:00Z')).allowed,true);assert.equal(invocation(e,new Date('2026-11-25T17:07:00Z')).allowed,false);});
test('queue resumes only current completed profile scopes',()=>{const b={book:'prizepicks',sport:'nba',offers:[{player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'}]};const q=queue([b],[]);assert.equal(q.total,1);const x=q.pending[0];const p=publicProfile({...x,research:[{origin:'profile',metric:'displayed panel',value:'not published'},{origin:'profile',metric:'row 1',value:'5',scope:'Stats'}],profileCollection:{truncated:false}});assert.equal(p.research.length,1);assert.equal(queue([b],[{records:[p]}]).pending.length,0);});

test('board chunks retain individual records and manifest separates them',()=>{const {splitBoard}=require('../scripts/pickfinder-public-runner.cjs');const x=splitBoard({book:'prizepicks',sport:'nba',sourceDigest:'a',offers:[{line:1}],researchObservations:[],unpricedTierObservations:[],sportsbookQuotes:[]});assert.equal(x.parts.length,1);assert.equal(x.parts[0].rows.length,1);assert.equal(x.meta.offers,undefined);});

test('exact shared detail scopes deduplicate across books but preserve line and context',()=>{const offer={player:'Fixture',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',market:'points',eventId:'e'};const a={book:'prizepicks',sport:'nba',offers:[offer]},b={book:'underdog',sport:'nba',offers:[offer,{...offer,detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A6'},{...offer,period:'1st_half'}]};const q=queue([a,b],[]);assert.equal(q.total,3);assert.equal(q.sharedAcrossBooks,1);const shared=q.pending.find(x=>x.books.length===2);assert.deepEqual(shared.books,['prizepicks','underdog']);const p=publicProfile({...shared,research:[{origin:'profile',metric:'row 1',scope:'Stats',value:'5'}],profileCollection:{truncated:false}});assert.equal(p.bookCoverageVerified,false);assert.equal(queue([a,b],[{records:[p]}]).pending.length,2);});

test('scheduled provenance must match an independently verified successful actual-hour workflow attempt',()=>{
 const {captureOrigin}=require('../scripts/pickfinder-public-runner.cjs'),{scheduledRunMatches}=require('../scripts/pickfinder-public-morning-audit.cjs');
 const env={GITHUB_EVENT_NAME:'schedule',GITHUB_EVENT_SCHEDULE:'7 6 * * *',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40)};
 const p={expected:'06:00'},o=captureOrigin(env,p),day='2026-11-25',slot='06:00',first='2026-11-25T14:20:00Z';
 const run={id:123,run_attempt:1,event:'schedule',head_sha:env.GITHUB_SHA,head_branch:'main',repository:{full_name:'Thedarkwillow/nhl-betting-platform1'},path:'.github/workflows/pickfinder-premium-hosted.yml',status:'completed',conclusion:'success',run_started_at:'2026-11-25T14:07:00Z'};
 assert.equal(scheduledRunMatches(o,run,day,slot,first),true);
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
 for(const mode of ['boards_only','features_only','nba_context_only'])for(const hour of [13,14,16,17])assert.equal(invocation({...env,REQUESTED_MODE:mode},new Date('2026-11-25T'+hour+':01:00Z')).allowed,false);
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
 assert.ok(src.includes('const evidence=p.historyRepair?null:await discover({env});'));
 assert.ok(src.includes('if(!p.historyRepair&&alive()){\n   const until=Date.now()+90000,gameAlive='));
 assert.ok(src.includes('if(!p.historyRepair&&alive()&&!p.featuresOnly){'));
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
