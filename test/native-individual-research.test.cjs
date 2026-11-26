'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {generate}=require('../scripts/native-individual-research.cjs');
const {nflEmpiricalBaseline}=require('../scripts/prizepicks-multisport-model-bridge.cjs');
test('native NHL individual projection uses existing five game minimum',()=>{
 const history={playerId:1,name:'Example',team:'ABC',type:'skater',games:Array.from({length:5},(_,i)=>({gameId:i+1,gameDate:'2026-11-0'+(i+1),shotsOnGoal:2}))};
 const s={sport:'NHL',name:'Example',playerId:1,gameId:9,team:'ABC',opponent:'XYZ',startAt:'2026-11-26T01:00:00Z',history,historyDigests:[]};
 const ctx={preparedAt:'2026-11-25T19:00:00Z',revision:'a'.repeat(40),scopes:[s],archive:{latest:[]}};
 const r=generate(ctx);assert.equal(r.native.length,1);assert.equal(r.native[0].projection,2);assert.equal(r.native[0].modelApproved,false);assert.equal(r.rows.length,0);
 history.games.pop();assert.equal(generate(ctx).native.length,0);
});
test('NFL research baseline abstains below fifteen and preserves push mass',()=>{assert.equal(nflEmpiricalBaseline(Array(14).fill(2),2),null);const p=nflEmpiricalBaseline(Array(15).fill(2),2);assert.ok(Math.abs(p.higher+p.lower+p.push-1)<1e-9);assert.equal(p.modelApproved,false);});

test('legacy priced book-only tier is research standard; unknown and unpriced tiers abstain',()=>{const {researchTier}=require('../scripts/native-individual-research.cjs');const o={source:'pickfinder_premium',book:'prizepicks',tier:null,displayedPrice:'-110'};assert.equal(researchTier(o),'standard');assert.equal(researchTier({...o,displayedPrice:null}),null);assert.equal(researchTier({...o,tier:'unknown'}),null);assert.equal(researchTier({...o,source:'other'}),null);assert.equal(researchTier({...o,tier:'Demon'}),'demon');});

test('missing event clock on a real-shaped archive offer abstains without throwing',()=>{const clock='2026-11-25T19:00:00Z';const offer={source:'pickfinder_premium',sport:'nhl',book:'prizepicks',detailId:'/players/nhl/example?prop=nhl:Points:event:2.5',eventId:'event',player:'Example',market:'Points',line:2.5,side:'Higher',tier:null,displayedPrice:'-110',observedAt:clock,startAt:null};const ctx={preparedAt:clock,revision:'a'.repeat(40),scopes:[],archive:{latest:[{m:{sport:'nhl',book:'prizepicks'},first:clock,offers:[offer],researchObservations:[]}]}};assert.equal(generate(ctx).excluded.missing_event_timestamp,1);});

test('offline roster and schedule candidate never substitutes unverified local clock',()=>{
 const {reconcileLocal,reconcileArchive}=require('../scripts/native-individual-research.cjs');
 const r={sport:'nhl',eventId:'e',player:'Example',playerPath:'/players/nhl/abc',detailId:'/players/nhl/abc?prop=x%3Aplayer_goals%3Ae%3A0.5',state:'context_incomplete',routeVerified:true,playerLabelVerified:true,team:'OTT',opponent:'FLA',observedAt:'2026-11-25T19:00:00Z',displayedEvidence:[{label:'Matchup',value:'OTT @ FLA • Thu @ 12:00AM'}],displayedClocks:[]};
 const s={sport:'NHL',name:'Example',team:'OTT',opponent:'FLA',gameId:9,playerId:1,startAt:'2026-11-26T00:00:00Z',identityReviewed:true,eventReviewed:true,rosterReviewed:true,evidenceKind:'automated_native_schedule_roster_history',receiptDigest:'a'.repeat(64),firstGitAt:'2026-11-25T19:05:00Z'};
 const ctx={preparedAt:'2026-11-25T19:10:00Z',scopes:[s]};
 const c=reconcileLocal(r,ctx);assert.equal(c.nativeStartAt,s.startAt);assert.equal(c.sourceClockVerified,false);assert.equal(c.startAt,undefined);
 assert.equal(reconcileLocal(r,{...ctx,scopes:[s,{...s,gameId:10}]}),null);
 assert.equal(reconcileLocal({...r,opponent:'BOS'},ctx),null);
 assert.equal(reconcileLocal({...r,displayedClocks:[{value:'bad'}]},ctx),null);
 assert.equal(reconcileLocal(r,{...ctx,scopes:[{...s,firstGitAt:'2026-11-25T19:11:00Z'}]}),null);
 const a=reconcileArchive(ctx,[{schema:'pickfinder-public-nba-context-v1',records:[r,r]}]);assert.equal(a.uniqueCandidates,1);assert.equal(a.counts.candidates,2);
});

test('candidate offer links retain exact threshold and never qualify a probability',()=>{
 const {candidateOffers,reconcileArchive}=require('../scripts/native-individual-research.cjs');
 const clock='2026-11-25T19:10:00Z',o={sport:'nhl',book:'prizepicks',source:'pickfinder_premium',eventId:'e',player:'Example',market:'player_goals',detailId:'/players/nhl/abc?prop=x%3Aplayer_goals%3Ae%3A0.5',line:0.5,side:'Higher',tier:'standard',observedAt:clock};
 const c={sport:'nhl',eventId:'e',player:'Example',playerPath:'/players/nhl/abc',nativeGameId:9,nativePlayerId:1,nativeStartAt:'2026-11-26T00:00:00Z'};
 const ctx={preparedAt:clock,archive:{latest:[{first:clock,digest:'abc',offers:[o,o,{...o,line:1.5}]}]}};
 const rows=candidateOffers(ctx,{rows:[c]});assert.equal(rows.length,1);assert.equal(rows[0].line,0.5);assert.equal(rows[0].probability,null);assert.equal(rows[0].sourceClockVerified,false);assert.equal(rows[0].modelApproved,false);
 const a=reconcileArchive(ctx,[{schema:'pickfinder-public-nba-context-v1',records:[{state:'context_incomplete',routeVerified:false}]}]);assert.equal(a.reasons.unverified_profile,1);assert.equal(a.counts.unresolved,1);
});

test('roster-only candidate stays out of model-ready rows and requires matching venue',()=>{
 const {reconcileArchive}=require('../scripts/native-individual-research.cjs');
 const r={sport:'nba',eventId:'e',player:'Example',playerPath:'/players/nba/abc',detailId:'/players/nba/abc?prop=x%3Aplayer_points%3Ae%3A20.5',state:'context_incomplete',routeVerified:true,playerLabelVerified:true,team:'NYK',opponent:'CLE',observedAt:'2026-11-25T19:00:00Z',displayedEvidence:[{label:'Matchup',value:'NYK @ CLE • Thu @ 12:00AM'}],displayedClocks:[]};
 const s={sport:'NBA',name:'Example',team:'NYK',opponent:'CLE',gameId:'9',playerId:'1',startAt:'2026-11-26T00:00:00Z',identityReviewed:true,eventReviewed:true,rosterReviewed:true,evidenceKind:'automated_native_schedule_roster_only',historyVerified:false,nativeNamespace:'espn:nba',homeAway:'away',receiptDigest:'a'.repeat(64),firstGitAt:'2026-11-25T19:05:00Z'};
 const ctx={preparedAt:'2026-11-25T19:10:00Z',scopes:[],identityScopes:[s]};const docs=[{schema:'pickfinder-public-nba-context-v1',records:[r]}];
 const a=reconcileArchive(ctx,docs);assert.equal(a.uniqueCandidates,0);assert.equal(a.identityOnlyUnique,1);assert.equal(a.identityOnlyRows[0].sourceClockVerified,false);assert.equal(a.identityOnlyRows[0].historyVerified,false);assert.equal(reconcileArchive({...ctx,identityScopes:[{...s,homeAway:'home'}]},docs).identityOnlyUnique,0);
});

test('clock comparison counts distinct events, handles midnight and never verifies timezone',()=>{
 const {clockAudit}=require('../scripts/native-individual-research.cjs');
 const a={sport:'nhl',eventId:'e',nativeStartAt:'2026-11-26T00:00:00Z',localMatchup:{weekday:'Wed',hour:4,minute:0,dayPeriod:'PM'}};
 const b={...a,eventId:'f'};const bad={...b,localMatchup:{...b.localMatchup,hour:5}};
 const out=clockAudit([a,a,b,bad]);assert.equal(out.distinctEvents,2);assert.equal(out.conflictingEvents,1);assert.equal(out.offsetMinutesByEvent['-480'],1);assert.equal(out.sourceClockVerified,false);
});

test('clock offer join retains exact threshold and rejects conflicting event scopes',()=>{
 const {clockOfferContext}=require('../scripts/native-individual-research.cjs');
 const o={sport:'nhl',book:'prizepicks',eventId:'e',player:'Example',market:'player_goals',detailId:'/players/nhl/abc?prop=x%3Aplayer_goals%3Ae%3A0.5',line:0.5,observedAt:'2026-11-25T19:00:00Z'};
 const r={sport:'nhl',eventId:'e',player:'Example',playerPath:'/players/nhl/abc',nativeGameId:9,nativePlayerId:1,team:'OTT',opponent:'FLA',observedAt:o.observedAt,nativeStartAt:'2026-11-26T00:00:00Z',clockCorroborated:true};
 const at=Date.parse('2026-11-25T19:10:00Z');
 assert.equal(clockOfferContext(o,[r],at).startAt,r.nativeStartAt);
 assert.equal(clockOfferContext({...o,line:1.5},[r],at),null);
 assert.equal(clockOfferContext(o,[r,{...r,nativeGameId:10}],at),null);
 assert.equal(clockOfferContext(o,[r],Date.parse(r.nativeStartAt)),null);
});

test('PickFinder native aliases preserve period and history gates',()=>{
 const {pickfinderProject}=require('../scripts/prizepicks-multisport-model-bridge.cjs');
 const clock='2026-11-25T19:00:00Z',s={sport:'NHL',playerId:1,name:'Example',team:'ABC',history:{playerId:1,name:'Example',team:'ABC',type:'skater',games:Array.from({length:5},(_,i)=>({gameId:i+1,gameDate:'2026-11-0'+(i+1),knownAt:'2026-11-20T00:00:00Z',finalVerified:true,goals:1}))}};
 const o={market:'player_goals',line:0.5,period:null};
 assert.equal(pickfinderProject(o,s,clock).prediction.metric,'goals');
 assert.equal(pickfinderProject({...o,period:'first period'},s,clock).reason,'unsupported_period');
 assert.equal(pickfinderProject({...o,market:'unknown'},s,clock).reason,'unmapped_market');
 assert.equal(pickfinderProject(o,{...s,history:null},clock).reason,'history_or_role_gate');
});
