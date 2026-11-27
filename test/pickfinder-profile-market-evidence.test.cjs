'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {profileMarketEvidence}=require('../scripts/pickfinder-profile-market-evidence.cjs');
const record={sport:'nba',player:'Example Player',eventId:'event',market:'points',status:'sampled',detailId:'/players/nba/id?prop=id:points:event:18'};
const time='2026-11-27T00:00:00Z',digest='e'.repeat(64);
const cell=(value,labels=[])=>({value,labels});
const movement={origin:'line_movement',tab:'Line Movement',metric:'row 1',scope:'Line | App | Time',observedAt:time};
const extract=(f,values,overrides={})=>profileMarketEvidence({...record,...overrides},{...f,value:JSON.stringify(values)},digest,time,time);
test('profile line history preserves the book-specific line, both displayed sides and the unconverted movement clock',()=>{
 const row=[cell('20.5'),cell('O-130\nU-125',['fanduel']),cell('11/25 4:06PM')];
 const [receipt]=extract(movement,row);
 assert.equal(receipt.quoteLine,20.5);assert.equal(receipt.higher,'-130');assert.equal(receipt.lower,'-125');
 assert.equal(receipt.movementAtUtc,null);assert.equal(receipt.displayedMovementClock,row[2].value);
 assert.equal(receipt.modelApproved,false);assert.equal(receipt.profileDigest,digest);
 for(const invalid of [[cell('20.5\n0.5'),...row.slice(1)],[row[0],cell('O-130\nU-125',['prizepicks']),row[2]],[row[0],cell('O-130\nO-125',['fanduel']),row[2]]])assert.deepEqual(extract(movement,invalid),[]);
 assert.deepEqual(extract(movement,row,{eventId:'other'}),[]);
 assert.deepEqual(extract({...movement,observedAt:'2026-12-01T00:00:00Z'},row),[]);
});
test('movement UTC requires an explicit offset and a valid nonfuture calendar timestamp',()=>{
 const values=[cell('20.5'),cell('O-130\nU-125',['fanduel']),cell('11/25 4:06PM')];
 const accept=stamp=>extract(movement,[...values.slice(0,2),{...values[2],sourceMovementDateTime:stamp}])[0];
 assert.equal(accept('2026-11-25T16:06:00-08:00').movementAtUtc,'2026-11-26T00:06:00.000Z');
 for(const stamp of ['2026-11-25T16:06:00','2026-11-25T16:06:00-00:00','2026-11-31T12:00:00Z','2026-11-27T00:00:01Z','2026-11-25T15:00:00+14:01']){
  assert.equal(accept(stamp).movementAtUtc,null);
 }
});
test('browser clock context is recorded separately and cannot convert an offsetless quote',()=>{
 const values=[cell('20.5'),cell('O-130\nU-125',['fanduel']),{...cell('11/25 4:06 PM'),browserTimeZone:'America/Los_Angeles'}];
 const [r]=extract(movement,values);
 assert.equal(r.browserTimeZone,'America/Los_Angeles');
 assert.equal(r.movementAtUtc,null);
 assert.equal(extract(movement,[...values.slice(0,2),{...values[2],browserTimeZone:'Unknown/Zone'}])[0].browserTimeZone,undefined);
});
test('research workload and injury status require exact player and typed columns',()=>{
 const f={origin:'profile',scope:'Player | Passes | Potential Asts',metric:'row 1',tab:'Player overview',observedAt:time};
 const row=[cell('Example P.',['Example Player']),cell('40.5'),cell('6.3')];
 assert.deepEqual(extract(f,row).map(x=>x.value),[40.5,6.3]);
 assert.deepEqual(extract({...f,tab:'Injuries'},row),[]);
 assert.deepEqual(extract(f,row,{player:'Someone Else'}),[]);
 const injury={...f,tab:'Injuries',scope:'Player | Status'};
 assert.equal(extract(injury,[row[0],cell('Questionable')])[0].value,'questionable');
});
test('conflicting observations cannot certify a pair or combine isolated sides',()=>{
 const {summarize}=require('../scripts/pickfinder-profile-market-evidence.cjs');
 const values=[cell('20.5'),cell('O-130\nU-125',['fanduel']),cell('11/25 4:06PM')];
 const [r]=extract(movement,values);
 assert.equal(summarize([r,r]).distinctUnconflictedPairedGroups,1);
 assert.equal(summarize([r,{...r,higher:'-145'}]).conflictingMovementGroups,1);
 assert.equal(summarize([r,{...r,higher:'-145'}]).distinctUnconflictedPairedGroups,0);
 assert.equal(summarize([{...r,higher:null},{...r,lower:null}]).distinctUnconflictedPairedGroups,0);
 const [z]=extract(movement,[...values.slice(0,2),{...values[2],sourceMovementDateTime:'2026-11-25T16:06:00-08:00',browserTimeZone:'America/Los_Angeles'}]);
 const s=summarize([r,r,z,z]);
 assert.equal(s.unzonedPairedGroups,1);assert.equal(s.offsetBoundNoVigPairedGroups,1);
 assert.equal(s.browserTimezoneRows,2);assert.equal(s.byBook.fanduel.offsetBoundNoVigPairs,1);
 assert.equal(summarize([z,{...z,higher:'-145'}]).offsetBoundNoVigPairedGroups,0);
 assert.equal(summarize([{...z,higher:null},{...z,lower:null}]).offsetBoundNoVigPairedGroups,0);
 assert.equal(summarize([{...z,sourceMovementDateTime:null}]).offsetBoundNoVigPairedGroups,0);
});
test('matchup table keeps its named season, L10 and L5 ranks with unresolved team and positional filter',()=>{
 const f={origin:'profile',scope:'STAT | SZN | L10 | L5 | STRENGTH',metric:'row 1',tab:'Defense',observedAt:time};
 const cells=['RA\n4.9 allowed/g','2nd','9th','20th','TOUGH'].map(t=>cell(t));
 const [r]=extract(f,cells);
 assert.deepEqual(r.displayedRanks,{SZN:2,L10:9,L5:20});assert.equal(r.defendingTeamVerified,false);
 assert.equal(r.positionFilterVerified,false);assert.equal(r.displayedAllowedPerGame,4.9);
 assert.deepEqual(extract(f,[cells[0],cell('31st'),...cells.slice(2)]),[]);
 assert.deepEqual(extract({...f,tab:'Injuries'},cells),[]);
});
test('depth chart status requires an explicit suffix on exactly one selected-player cell',()=>{
 const f={origin:'profile',scope:' | Starter | 2nd | 3rd | 4th | 5th',metric:'row 1',tab:'Injuries',observedAt:time};
 const cells=[cell('PG'),cell('Other\nOUT',['Other']),cell('E. Player\nQ',['Example Player']),cell(null),cell(null),cell(null)];
 const [r]=extract(f,cells);
 assert.equal(r.value,'Q');assert.equal(r.normalizedStatus,null);assert.equal(r.depthSlot,'2nd');
 assert.equal(r.independentInjuryVerified,false);
 assert.equal(extract(f,cells.map((c,i)=>i===2?cell('E. Player\nOUT',['Example Player']):c))[0].normalizedStatus,'out');
 for(const c of [cell('E. Player',['Example Player']),cell('E. Player\nQ',['Other']),cell('E. Player\nQ',['Example Player','Other']),cell('Wrong Name\nQ',['Example Player'])]){
   assert.deepEqual(extract(f,cells.map((x,i)=>i===2?c:x)),[]);
 }
 assert.deepEqual(extract(f,cells.map((x,i)=>i===1?cells[2]:x)),[]);
});

test('collector captures only the exact visible semantic time cell of a movement table',()=>{
 const {readSections}=require('../scripts/pickfinder-player-research.cjs');
 const stamp='2026-11-25T16:06:00-08:00';
 const headers=['Line','App','Time'].map(innerText=>({innerText,tagName:'TH',rowSpan:1,colSpan:1}));
 const timeNode={innerText:'11/25 4:06PM',getClientRects:()=>[{}],getAttribute:()=>stamp};
 const t=(nodes)=>({getClientRects:()=>[{}],querySelectorAll:s=>s==='thead tr'?[{cells:headers}]:
  s==='thead th'?headers:s==='tbody tr'?[{cells:[
   {innerText:'20.5',querySelectorAll:()=>[]},
   {innerText:'O-130',querySelectorAll:sel=>sel==='img[alt]'?[{alt:'fanduel'}]:[]},
   {innerText:'11/25 4:06PM',querySelectorAll:sel=>sel==='time[datetime]'?nodes:[]}
  ]}]:[]});
 const prior=global.document;
 try {
  for(const [nodes,expected] of [[[timeNode],stamp],[[{...timeNode,innerText:'different'}],undefined],[[timeNode,timeNode],undefined]]){
   global.document={querySelectorAll:s=>s==='table'?[t(nodes)]:[]};
   const fields=readSections({tab:'Line Movement',origin:'line_movement',observedAt:time,context:{}});
   const row=JSON.parse(fields.find(f=>f.metric==='row 1').value);
   assert.equal(row[2].sourceMovementDateTime,expected);
   assert.equal(row[2].browserTimeZone,Intl.DateTimeFormat().resolvedOptions().timeZone);
   assert.equal(row[0].browserTimeZone,undefined);
  }
 }finally{global.document=prior;}
});

test('movement probe uses unique exact pairs and tests timezone shift across midnight',()=>{
 const {compare}=require('../scripts/pickfinder-movement-clock-probe.cjs');
 const row=(quoteLine,displayedMovementClock)=>({book:'fanduel',quoteLine,higher:'-110',lower:'-120',displayedMovementClock});
 const from=[row(20.5,'11/27 12:04AM'),row(21.5,'11/26 11:50PM')];
 const to=[row(20.5,'11/26 4:04PM'),row(21.5,'11/26 3:50PM')];
 const doc=(zone,rows)=>({zone,browserZone:zone,detailId:'/players/nba/id?prop=id:points:event:18',observedAt:'2026-11-27T00:05:00Z',sampled:true,rows});
 const first=doc('UTC',from), second=doc('America/Los_Angeles',to);
 assert.deepEqual(compare([first,second]),{state:'browser_local_candidate',matched:2,shifted:2,unchanged:0});
 assert.deepEqual(compare([first,{...second,rows:to.map(x=>({...x,displayedMovementClock:x.displayedMovementClock.replace(/([AP]M)$/, ' $1')}))}]),
  {state:'browser_local_candidate',matched:2,shifted:2,unchanged:0});
 assert.equal(compare([first,{...second,rows:from}]).state,'fixed_zone_candidate');
 assert.equal(compare([first,{...second,rows:[...to,to[0]]}]).state,'inconclusive');
 assert.equal(compare([first,{...second,browserZone:'UTC'}]).state,'incomplete');
});

test('movement probe ranks evidenced paired prices and excludes unsupported references',()=>{
 const {select,aggregate}=require('../scripts/pickfinder-movement-clock-probe.cjs');
 const quote=(player,eventId,book)=>({sport:'nfl',player,eventId,market:'yards',book,quoteLine:1.5,higher:'-110',lower:'-120',
  kind:'historical_sportsbook_quote',observedAt:time,
  detailId:'/players/nfl/'+player+'?'+new URLSearchParams({prop:'id:yards:'+eventId+':1.5'})});
 const first=quote('First','n1','fanduel'),second=quote('Second','n2','draftkings');
 const receipts=[{first:time,digest:'a'.repeat(64),doc:{schema:'pickfinder_profile_historical_sportsbook_recovery_v1',rows:[
  first,first,{...second,higher:null},second,{...second,book:'fliff'},
  {...quote('Invalid','n3','fanduel'),detailId:'https://example.com/players/nfl/Invalid?prop=id:yards:n3:1.5'},
  {...quote('Old','n4','fanduel'),observedAt:'2026-11-01T00:00:00Z'}
 ]}}];
 assert.deepEqual(select(receipts,time).map(({player})=>player),['Second','First']);
 const tennis={...first,sport:'tennis',player:'Third',eventId:'t1',detailId:'/players/tennis/third?prop=id:yards:t1:1.5'};
 const diverse=[{...receipts[0],doc:{...receipts[0].doc,rows:[...receipts[0].doc.rows,tennis]}}];
 assert.deepEqual(select(diverse,time).map(({player})=>player),['Second','Third']);
 assert.equal(aggregate([{matched:1,shifted:1,unchanged:0},{matched:1,shifted:1,unchanged:0}]).state,'browser_local_candidate');
 assert.equal(aggregate([{matched:1,shifted:1,unchanged:0},{matched:1,shifted:0,unchanged:1}]).state,'inconclusive');
});

test('movement follow-up rotates sampled profiles and never double-counts an archived quote',()=>{
 const {select,combineProbeReceipts}=require('../scripts/pickfinder-movement-clock-probe.cjs');
 const a='2026-11-27T01:31:43Z',b='2026-11-27T01:31:47Z';
 const detailId='https://www.pickfinder.app/players/nfl/one?prop=id:yards:n1:10.5';
 const pair={book:'hardrockbet',quoteLine:10.5,higher:'-115',lower:'-115'};
 const record=id=>({observations:[
  {detailId:id,zone:'UTC',browserZone:'UTC',observedAt:a,sampled:true,rows:[{...pair,displayedMovementClock:'11/27 1:21AM'}]},
  {detailId:id,zone:'America/Los_Angeles',browserZone:'America/Los_Angeles',observedAt:b,sampled:true,rows:[{...pair,displayedMovementClock:'11/26 5:21PM'}]}
 ]});
 const old={schema:'pickfinder-movement-clock-probe-v1',observedAt:b,records:[record(detailId)]};
 assert.equal(combineProbeReceipts([old,old],b).matched,1);
 assert.equal(combineProbeReceipts([old,{...old,records:[record(detailId.replace('/one','/two'))]}],b).state,'browser_local_candidate');
 const docs=[{first:a,digest:'a'.repeat(64),doc:{schema:'pickfinder_profile_historical_sportsbook_recovery_v1',rows:[
  {...pair,detailId,sport:'nfl',player:'One',market:'yards',eventId:'n1',kind:'historical_sportsbook_quote',observedAt:a},
  {...pair,detailId:'/players/nfl/two?prop=id:yards:n2:10.5',sport:'nfl',player:'Two',market:'yards',eventId:'n2',kind:'historical_sportsbook_quote',observedAt:a}
 ]}}];
 const prior={...old,records:[record(new URL(detailId).pathname+new URL(detailId).search)]};
 assert.deepEqual(select(docs,b,[prior]).map(x=>x.player),['Two']);
});
test('ranked tennis label allows one unsampled exact-profile retry, not other names or collected tables',()=>{
 const {select,profileLabels}=require('../scripts/pickfinder-movement-clock-probe.cjs');
 const player='Test Player (#457)',detailId='/players/tennis/test?prop=id:games:t1:10.5';
 assert.deepEqual(profileLabels('tennis',player),[player,'Test Player']);
 for(const [sport,name] of [['nhl',player],['tennis','Test Player (Junior)'],['tennis','Test Player (#0)']])assert.deepEqual(profileLabels(sport,name),[name]);
 const doc={schema:'pickfinder_profile_historical_sportsbook_recovery_v1',rows:[{sport:'tennis',player,detailId,market:'games',eventId:'t1',book:'fanduel',quoteLine:10.5,higher:'-110',lower:'-110',kind:'historical_sportsbook_quote',observedAt:time}]};
 const source=[{first:time,digest:'a'.repeat(64),doc}];
 const miss={detailId,phase:'player_not_visible',sampled:false,rows:[]};
 const prior=o=>[{schema:'pickfinder-movement-clock-probe-v1',observedAt:time,records:[{sport:'tennis',player,observations:[o]}]}];
 assert.equal(select(source,time,prior(miss)).length,1);
 for(const o of [{...miss,profileLabelStrategy:2},{...miss,phase:'movement_table_no_exact_pairs',sampled:true}])assert.equal(select(source,time,prior(o)).length,0);
});
test('current exact pick’em movements preserve explicit unpriced tiers without benchmark promotion',()=>{
 const {summarize}=require('../scripts/pickfinder-profile-market-evidence.cjs');
 const current={currentProfileAttemptedAt:time};
 const result=extract(movement,[cell('20.5'),cell(null,['prizepicks','demon']),cell('11/25 4:06PM')],current);
 assert.equal(result[0].displayedTier,'demon');
 assert.equal(result[0].higher,null);
 assert.equal(result[0].originalPlatformVerified,false);
 assert.equal(result[0].openingOrClosingVerified,false);
 assert.equal(summarize(result).currentPickEmMovement.unpricedRows,1);
 assert.equal(summarize(result).offsetBoundNoVigPairedGroups,0);
 const [q]=extract(movement,[cell('20.5'),cell('O-119\nU-119',['underdog']),cell('11/25 4:06PM')],current);
 assert.equal(q.displayedTier,null);
 assert.equal(q.lower,'-119');
 assert.equal(summarize([q]).pairedRows,0);
 const v={...current,sport:'valorant',detailId:record.detailId.replace('/nba/','/val/')};
 assert.equal(extract(movement,[cell('20.5'),cell('O-119\nU',['underdog']),cell('11/25 4:06PM')],v)[0].lower,null);
 assert.deepEqual(extract(movement,[cell('20.5'),cell('O-119\nO-118',['underdog']),cell('11/25 4:06PM')],v),[]);
 assert.deepEqual(extract(movement,[cell('20.5'),cell('O-119',['underdog']),cell('11/25 4:06PM')],{...v,sport:'cs2'}),[]);
});

test('a selected sportsbook App row keeps its own line, paired prices and offsetless time',()=>{
 const [r]=extract(movement,[cell('0.5'),cell('O-900\nU+170',['novig']),cell('11/27 2:09AM')],{
  sport:'nhl',detailId:'/players/nhl/id?prop=id:points:event:1.5'});
 assert.equal(r.quoteLine,.5);assert.equal(r.higher,'-900');assert.equal(r.lower,'+170');assert.equal(r.movementAtUtc,null);
 assert.equal(require('../scripts/pickfinder-profile-market-evidence.cjs').summarize([r]).offsetBoundNoVigPairedGroups,0);
});

test('single observed App selector verifies the replacement brand before returning typed fields',async()=>{
 const {sportsbookMovementSelection}=require('../scripts/pickfinder-player-research.cjs');
 const calls=[];
 const button={count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>calls.push('click')};
 const page={getByRole:(role)=>role==='table'?{...button,filter:()=>({...button,getByRole:()=>button})}:role==='columnheader'?button:
  {...button,evaluate:async()=> 'novig'},keyboard:{press:async()=>calls.push('dismiss')}};
 const old={...movement,value:JSON.stringify([cell('1.5'),cell(null,['prizepicks','goblin']),cell('11/27 12:00AM')])};
 const good={...movement,value:JSON.stringify([cell('0.5'),cell('O-900\nU+170',['novig']),cell('11/27 2:09AM')])};
 assert.deepEqual(await sportsbookMovementSelection(page,async()=>[old,good],()=>true),[good]);
 assert.deepEqual(calls,['click','click']);
});

test('depth slot from overview is a display observation, not a confirmed starter or injury',()=>{
 const f={origin:'profile',scope:' | Starter | 2nd | 3rd | 4th | 5th',metric:'row 1',tab:'Player overview',observedAt:time};
 const row=[cell('PF'),cell('Example Player',['Example Player']),cell('Other',['Other']),cell(null),cell(null),cell(null)];
 const [r]=extract(f,row);
 assert.equal(r.kind,'depth_chart_observation');assert.equal(r.depthSlot,'Starter');assert.equal(r.confirmedLineup,false);
 assert.equal(r.teamVerified,false);assert.equal(r.independentInjuryVerified,false);assert.equal(r.modelApproved,false);
 assert.equal(require('../scripts/pickfinder-profile-market-evidence.cjs').summarize([r]).depthChartObservations,1);
 assert.deepEqual(extract(f,row.map((c,i)=>i===1?cell('Wrong Name',['Example Player']):c)),[]);
});
test('title-case defense headers, soft labels and missing short windows remain descriptive',()=>{
 const f={origin:'profile',scope:'Stat | SZN | L10 | L5 | Strength',metric:'row 1',tab:'Defense',observedAt:time};
 const [r]=extract(f,['Pts\n9.8 allowed/g','7th','2nd','—','soft'].map(x=>cell(x)));
 assert.deepEqual(r.displayedRanks,{SZN:7,L10:2,L5:null});assert.equal(r.displayedStrength,'SOFT');
 assert.equal(r.defendingTeamVerified,false);assert.equal(r.modelApproved,false);
});
test('collector separates the visible threshold from the exact movement badge without inventing a clock',()=>{
 const {readSections}=require('../scripts/pickfinder-player-research.cjs');
 const headers=['Line','App','Time'].map(innerText=>({innerText,tagName:'TH',rowSpan:1,colSpan:1}));
 const span=(innerText,classes,visible=true)=>({innerText,tagName:'SPAN',classList:{contains:x=>classes.includes(x)},getClientRects:()=>visible?[{}]:[]});
 const t=(badge)=>({getClientRects:()=>[{}],querySelectorAll:s=>s==='thead tr'?[{cells:headers}]:
  s==='thead th'?headers:s==='tbody tr'?[{cells:[
   {innerText:'14.5\n1',children:[{children:[span('14.5',['text-base']),badge]}],querySelectorAll:()=>[]},
   {innerText:'O-119\nU-119',querySelectorAll:sel=>sel==='img[alt]'?[{alt:'prizepicks'}]:[]},
   {innerText:'11/26 1:07PM',querySelectorAll:()=>[]}
  ]}]:[]});
 const prior=global.document;
 try{
  for(const [badge,expected] of [[span('1',['rounded-full','text-xs']),'14.5'],[span('1',[]),'14.5\n1'],[span('1',['rounded-full','text-xs'],false),'14.5\n1']]){
   global.document={querySelectorAll:s=>s==='table'?[t(badge)]:[]};
   const obs=readSections({tab:'Line Movement',origin:'line_movement',observedAt:time,context:{}}).find(f=>f.metric==='row 1');
   const cells=JSON.parse(obs.value);assert.equal(cells[0].value,expected);
   const r=extract(obs,cells,{currentProfileAttemptedAt:time});
   if(expected==='14.5'){assert.equal(r[0].quoteLine,14.5);assert.equal(r[0].higher,'-119');assert.equal(r[0].lower,'-119');assert.equal(r[0].movementAtUtc,null);assert.equal(r[0].originalPlatformVerified,false);}
   else assert.deepEqual(r,[]);
  }
 }finally{global.document=prior;}
});

test('one verified sportsbook can be selected from a menu with several books',async()=>{
 const {sportsbookMovementSelection}=require('../scripts/pickfinder-player-research.cjs');
 const calls=[];
 const button={count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>calls.push('open')};
 const page={getByRole:(role,opts)=>role==='table'?{...button,filter:()=>({...button,getByRole:()=>button})}:role==='columnheader'?button:
  (()=>{const available=['fanduel O-106 U-122','novig O+120 U-130','draftkings O+102'].filter(x=>opts.name.test(x));return {...button,count:async()=>available.length,evaluate:async()=>available[0].split(' ')[0],click:async()=>calls.push(available[0])};})(),
  keyboard:{press:async()=>calls.push('dismiss')}};
 const old={...movement,value:JSON.stringify([cell('14.5'),cell('O-119\nU-119',['prizepicks']),cell('11/26 1:07PM')])};
 const good={...movement,value:JSON.stringify([cell('14.5'),cell('O-106\nU-122',['fanduel']),cell('11/27 6:13AM')])};
 assert.deepEqual(await sportsbookMovementSelection(page,async()=>[old,good],()=>true),[good]);
 assert.deepEqual(calls,['open','fanduel O-106 U-122']);
 assert.equal(extract(good,JSON.parse(good.value))[0].movementAtUtc,null);
});
