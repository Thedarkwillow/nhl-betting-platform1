'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {recoverArchiveClocks,proofMatches}=require('../scripts/pickfinder-verified-board-clock.cjs');
const {sha}=require('../scripts/pickfinder-public-archive.cjs');
const {ZONES,clockAt}=require('../scripts/pickfinder-controlled-clock.cjs');
test('exact-event clock is replayed from controlled observations and untouched official facts',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clock-proof-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 const old='2026-11-27T13:00:00Z',observedAt='2026-11-27T22:57:00Z',clock='2026-11-27T23:00:00Z',start='2026-11-28T00:00:00Z',event='exampleNHL',native='2026020414',player='Example Skater';
 const git=(...a)=>execFileSync('git',['-C',dir,...a],{stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_COMMITTER_DATE:old,GIT_AUTHOR_DATE:old}});
 const write=(loc,obj,hashed=true)=>{
  const raw=JSON.stringify(obj)+'\n',digest=sha(raw),f=path.join(dir,loc+(hashed?'/'+digest+'.json':''));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,raw);return digest;
 };
 git('init');git('config','user.name','Fixture');git('config','user.email','clock@example.invalid');
 const proofs=[{url:'https://api-web.nhle.com/v1/schedule/2026-11-27',digest:'a'.repeat(64),observedAt:old},
  {url:'https://api-web.nhle.com/v1/roster/SEA/20262027',teamId:'SEA',digest:'b'.repeat(64),observedAt:old}];
 // Proof receipts need a still-fresh official leading schedule at their first Git commit.
 const factClock='2026-11-27T22:00:00Z';
 const commit=(at,msg)=>{git('add','.');execFileSync('git',['-C',dir,'commit','-qm',msg],{env:{...process.env,GIT_COMMITTER_DATE:at,GIT_AUTHOR_DATE:at}});};
 const nativeDigest=write('research/pickfinder-public-identity-v1/native-facts',{kind:'independent_public_sport_identity_facts_v1',sport:'nhl',source:'nhl:official',observedAt:factClock,
  proofs:proofs.map(x=>({...x,observedAt:factClock})),events:[{eventId:native,startAt:start,status:'pre',teams:[{id:'SEA',abbr:'SEA',homeAway:'away'},{id:'EDM',abbr:'EDM',homeAway:'home'}]}],
  roster:[{name:player,playerId:'12345',team:'SEA',teamId:'SEA',position:'C'}]});
 const o={sport:'nhl',book:'prizepicks',player,market:'player_shots_on_goal',eventId:event,
  detailId:'/players/nhl/example?prop=x%3Aplayer_shots_on_goal%3AexampleNHL%3A1.5',observedAt,startAt:null};
 const ds=ZONES.map(z=>write('research/pickfinder-public-v1/directory',{schema:'pickfinder-controlled-clock-v1',records:[{
  ...o,observedAt:factClock,playerPath:'/players/nhl/example',routeVerified:true,playerLabelVerified:true,team:'SEA',opponent:'EDM',
  localMatchup:{team:'SEA',opponent:'EDM',homeAway:'away',...clockAt(start,z)},browserClock:{zone:z},requestedZone:z}]}));
 commit(factClock,'Frozen independent schedule and timezone observations');
 write('data/pickfinder-current-identity-registry.json',{kind:'pickfinder_current_identity_registry_v1',eventRegistry:[{
  sport:'nhl',namespace:'nhl:official',sourceEventId:event,eventId:native,startAt:start,nativeReceiptDigest:nativeDigest,timezoneReceiptDigests:ds}]},false);
 commit('2026-11-27T22:30:00Z','Commit registry as locator');
 const board={m:{sport:'nhl',book:'prizepicks',pageTraversalComplete:true},first:observedAt,offers:[o]};
 const recover=os=>recoverArchiveClocks(dir,{latest:[{...board,offers:os}]},clock).latest[0].offers;
 const [verified]=recover([o]);
 assert.equal(verified.startAt,'2026-11-28T00:00:00.000Z');
 assert.ok(proofMatches({gameId:native,sourceEventId:event,startAt:start,sourceObservedAt:observedAt},verified.boardClockProof));
 assert.equal(proofMatches({gameId:'other',sourceEventId:event,startAt:start,sourceObservedAt:observedAt},verified.boardClockProof),false);
 assert.equal(recover([{...o,startAt:'2026-11-28T00:30:00Z'}])[0].clockConflict,true);
 assert.equal(recover([{...o,detailId:o.detailId.replace('exampleNHL','wrong')}])[0].startAt,null);
 assert.equal(recover([{...o,observedAt:'2026-11-27T22:01:00Z'}])[0].startAt,null);
});
