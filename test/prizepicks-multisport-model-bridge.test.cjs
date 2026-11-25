'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {evaluateOther,mapPeriod}=require('../scripts/prizepicks-multisport-model-bridge.cjs');
const {evaluate}=require('../scripts/prizepicks-direct-model-bridge.cjs');
const {retain}=require('../scripts/prizepicks-restricted-forecast-storage.cjs');
const clock='2026-11-25T16:30:00Z',obs='2026-11-25T16:25:00Z',start='2026-11-25T23:00:00Z',h='a'.repeat(64),rev='b'.repeat(40);
const row={provider:'PrizePicksAPI',sport:'NHL',player:'Fixture Player',team:'AAA',opponent:'BBB',providerOfferId:'fixture',line:2.5,stat:'Shots On Goal',period:'Full game',receivedAt:clock,observedAt:obs,startsAt:start,productionEligible:false,originalAppAvailabilityVerified:false,selections:{Higher:{available:true,tier:'standard'},Lower:{available:true,tier:'standard'}}};
const base={sport:'NHL',name:row.player,team:row.team,opponent:row.opponent,playerId:7,gameId:100,startAt:start,identityReviewed:true,eventReviewed:true,rosterReviewed:true,receiptDigest:h,receiptCommit:rev,observedAt:'2026-11-25T15:00:00Z',firstGitAt:'2026-11-25T15:01:00Z',historyDigests:[h]};
const games=Array.from({length:8},(_,i)=>({gameId:i+1,gameDate:'2026-11-0'+(i+1),knownAt:'2026-11-10T00:00:00Z',finalVerified:true,shotsOnGoal:3}));
const scope={...base,history:{playerId:7,name:row.player,team:row.team,type:'skater',games}};
const ctx=s=>({revision:rev,preparedAt:clock,scopes:[s],archive:{invalid:[],latest:[]}});
t('NHL existing projection, both offered sides, no future data, no calibrated claim',()=>{
 const c=ctx({...scope,history:{...scope.history,games:[...games,{gameId:99,gameDate:'2026-11-25',knownAt:'2026-11-26T00:00:00Z',finalVerified:true,shotsOnGoal:500}]}});
 const p=evaluate([row],{other:c},clock).predictions;a.equal(p.length,2);a.equal(p[0].projection,3);a.equal(p[0].priorObservations,8);a.equal(p[0].calibrated,false);a.equal(p[0].originalPlatformVerified,false);
 a.equal(evaluate([row,row],{other:c},clock).predictions.length,2);
});
t('wrong event, wrong team, ambiguous receipt, goalie starter unknown, or partial game fail closed',()=>{
 for(const r of [{...row,startsAt:'2026-11-25T23:05:00Z'},{...row,team:'CCC'},{...row,period:'1P'},{...row,stat:'Goalie Saves'}])a.equal(evaluateOther([r],ctx(scope),clock).predictions.length,0);
 a.equal(evaluateOther([row],{...ctx(scope),scopes:[scope,scope]},clock).predictions.length,0);
 a.equal(evaluateOther([row],ctx({...scope,firstGitAt:clock}),clock).predictions.length,0);
});
t('NFL uses existing role gate and shrunk projection; same week excluded; probability stays null',()=>{
 const history=Array.from({length:6},(_,i)=>({identity:'player:7',year:2026,week:i+1,finalVerified:true,knownAt:'2026-11-20T00:00:00Z',measures:{passing_attempts:30,passing_yards:250}}));
 const s={...base,sport:'NFL',season:2026,week:12,position:'QB',history:[...history,{...history[0],week:12,measures:{passing_attempts:40,passing_yards:999}}]};
 const r={...row,sport:'NFL',stat:'Pass Yards',line:240.5};
 const p=evaluateOther([r],ctx(s),clock).predictions;a.equal(p.length,2);a.equal(p[0].projection,250);a.equal(p[0].priorObservations,6);a.equal(p[0].rawConditionalEstimate,null);
 a.equal(evaluateOther([r],ctx({...s,position:'WR'}),clock).predictions.length,0);
});
t('NFL kicking requires verified participation and uses prior-only kicking history',()=>{
 const history=Array.from({length:6},(_,i)=>({identity:'kicker:7',year:2026,week:i+1,finalVerified:true,knownAt:'2026-11-20T00:00:00Z',measures:{fg_made:2}}));
 const s={...base,sport:'NFL',season:2026,week:12,position:'K',history};
 const r={...row,sport:'NFL',stat:'Field Goals Made',line:1.5};
 a.equal(evaluateOther([r],ctx(s),clock).predictions.length,0);
 const p=evaluateOther([r],ctx({...s,kickerParticipationVerified:true}),clock).predictions;a.equal(p.length,2);a.equal(p[0].projection,2);a.equal(p[0].rawConditionalEstimate,null);
});
t('all five esports titles use existing exact-scope model, only independently verified complete maps',()=>{
 for(const sport of ['CS2','VALORANT','LOL','DOTA2','COD']){
  const history=Array.from({length:12},(_,i)=>[1,2].map(mapIndex=>({title:sport,playerId:'7',teamId:'A',opponentId:'B',seriesId:'prior'+i,mapId:'map'+i+'-'+mapIndex,mapIndex,sourceId:'fixture',sourceUrl:'https://example.org',ruleset:'r1',final:true,participationVerified:true,professional:true,identityVerified:true,startAt:'2026-11-01T00:00:00Z',endAt:'2026-11-01T01:00:00Z',observedAt:'2026-11-01T02:00:00Z',exposure:20,exposureUnit:['CS2','VALORANT'].includes(sport)?'rounds':'minutes',stats:{kills:10},sourceAuthorized:true,officialFinalVerified:true,scoringContractVerified:true,sourceDocumentSha256:h,scheduleDispositionVerified:true,chronobreakResolved:true,forfeit:false,overtimeIncluded:true,participationThresholdVerified:true,playedFullMap:true,edition:'edition',mode:'mode',archiveDigest:h,archiveFirstGitAt:'2026-11-02T00:00:00Z'}))).flat();
  const s={...base,sport,teamId:'A',opponentId:'B',maps:[1,2],scopeReviewed:true,ruleset:'r1',ruleVersion:'v1',edition:'edition',mode:'mode',history};
  const r={...row,sport,stat:'Kills',period:'Maps 1-2',line:19.5};
  const p=evaluateOther([r],ctx(s),clock).predictions;a.equal(p.length,2,sport);a.equal(p[0].projection,20);a.equal(p[0].priorObservations,12);
  a.equal(evaluateOther([r],ctx({...s,history:history.slice(1)}),clock).predictions.length,0);
  a.equal(evaluateOther([{...r,period:'Map 1'}],ctx(s),clock).predictions.length,0);
 }
 a.deepEqual(mapPeriod('Maps 1-3'),[1,2,3]);a.equal(mapPeriod('Maps 2-1'),null);
});
t('PickFinder matches exact reviewed scope, tier, side, start and fresh observation',()=>{
 const p={detailId:'/players/nhl/p?prop=x',eventId:'e',player:row.player,market:'player_shots_on_goal',reviewed:true,apiStat:row.stat,apiPeriod:row.period};
 const o={...p,book:'prizepicks',sport:'nhl',line:2.5,side:'Higher',tier:'standard',startAt:start,observedAt:obs};
 const c=ctx({...scope,pickfinder:p});
 c.archive.latest=[{m:{sport:'nhl',book:'prizepicks'},first:clock,offers:[o],sportsbookQuotes:[]}];
 const out=evaluateOther([row],c,clock).predictions;a.equal(out.find(x=>x.side==='Higher').pickfinderCorroborated,true);a.equal(out.find(x=>x.side==='Lower').pickfinderCorroborated,false);
 c.archive.latest[0].offers=[{...o,line:3.5}];a.equal(evaluateOther([row],c,clock).predictions.some(x=>x.pickfinderCorroborated),false);
});
t('retention denied by default; authorized test storage is exclusive, allowlisted and never public',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'pp-fixture-'));try{
 const result=evaluateOther([row],ctx(scope),clock);result.predictions[0].secret='fixture-secret';
 const options={directory:d,checkout:process.cwd(),clock};
 a.throws(()=>retain(result,options),/not_authorized/);
 const grant='authorized_individual_forecast_retention_v1',saved=retain(result,{...options,grant});
 a.equal(saved.retained,2);a.equal(saved.independentArchiveChronologyVerified,false);
 const file=path.join(d,saved.digest+'.json');a.equal(fs.statSync(file).mode&0o777,0o600);a.ok(!fs.readFileSync(file,'utf8').includes('fixture-secret'));
 a.throws(()=>retain(result,{...options,grant}),/EEXIST/);
 a.throws(()=>retain(result,{...options,grant,directory:process.cwd()}),/storage_not_private/);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
