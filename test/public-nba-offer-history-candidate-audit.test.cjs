'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{audit}=require('../scripts/public-nba-offer-history-candidate-audit.cjs');
const clock='2026-11-25T14:00:00Z',start='2026-11-25T23:00:00Z',obs='2026-11-25T13:00:00Z';
const roster=[{playerId:'1',name:'Alpha Player',teamId:'a',team:'BOS'},{playerId:'2',name:'Beta Player',teamId:'b',team:'NYK'}];
const event={sport:'nba',namespace:'espn:nba',eventId:'10',status:'pre',startAt:start,teams:[{id:'a',abbr:'BOS'},{id:'b',abbr:'NYK'}]};
const offers=roster.map((p,i)=>({sport:'nba',player:p.name,book:'prizepicks',detailId:'fixture-'+i,eventId:'source-event',market:'player_points',line:20.5,side:'Higher',observedAt:obs,startAt:start}));
const fields=offers.flatMap((o,i)=>['Team','Opponent'].map((metric,j)=>({origin:'board',detailId:o.detailId,observedAt:obs,metric,value:roster[(i+j)%2].team,startAt:start})));
const payload={kind:'nba_offer_history_candidate_input_v1',crosswalk:[['1','101'],['2','102']],facts:{events:[event],roster},history:roster.flatMap((p,i)=>Array.from({length:12},(_,j)=>({playerId:101+i,player:p.name,team:p.team,gameDate:'2026-11-'+String(j+1).padStart(2,'0'),points:20})))};
const archive=(os,fs)=>({invalid:[],latest:[{m:{sport:'nba',book:'prizepicks'},first:'2026-11-25T13:30:00Z',digest:'fixture',offers:os,unpricedTierObservations:[],researchObservations:fs}]});
test('links individual candidate offers but does not certify original platform or production',()=>{const a=audit(archive(offers,fields),payload,clock);assert.equal(a.historyCandidates,2);assert.equal(a.sourceContextCorroborated,2);assert.equal(a.modelApproved,false);assert.equal(a.independentlyReviewedPickfinderCrosswalks,0);});
test('missing game context is never promoted',()=>{const a=audit(archive(offers.map(o=>({...o,startAt:null})),[]),payload,clock);assert.equal(a.historyCandidates,2);assert.equal(a.sourceContextCorroborated,0);});
test('insufficient prior history is excluded',()=>{const a=audit(archive(offers,fields),{...payload,history:[]},clock);assert.equal(a.historyCandidates,0);});
test('reviewed game context binds both sources to the exact archived event and player',()=>{
 const {indexReviews,matchesReview}=require('../scripts/pickfinder-reviewed-game-context.cjs');
 const game={eventId:'pf1',sourceUrl:'https://www.pickfinder.app/game-lines?game=pf1',nbaGameId:'0022600100',espnGameId:'10',home:'NYK',away:'BOS',displayedClock:'Wed 11/25, 3:00 PM',observedAt:obs,scheduleStartAt:start};
 const row={eventId:'pf1',player:'Alpha Player',playerPath:'/players/nba/p',sourceUrl:'https://www.pickfinder.app/players/nba/p?prop=m:points:pf1:20',nbaPlayerId:'101',espnPlayerId:'1',team:'BOS',opponent:'NYK',displayedMatchup:'BOS @ NYK',independentRosterVerified:true,observedAt:obs};
 const doc={schema:'pickfinder-independent-nba-matchup-review-v1',clockComparisonZone:'America/Los_Angeles',games:[game],records:[row]};
 const ev={...event,teams:[{abbr:'BOS',homeAway:'away'},{abbr:'NY',homeAway:'home'}]};
 const offer={...offers[0],eventId:'pf1',detailId:row.sourceUrl};
 const check=(docs,override={})=>matchesReview(indexReviews(docs,clock),{...offer,...override},'101',roster[0],ev);
 assert.equal(check([doc]),true);
 assert.equal(check([doc],{eventId:'wrong'}),false);
 assert.equal(check([{...doc,games:[{...game,displayedClock:'Wed 11/25, 4:00 PM'}]}]),false);
 assert.equal(check([doc,{...doc,records:[{...row,nbaPlayerId:'102'}]}]),false);
});

test('report keeps native board clock and reviewed receipt counts distinct',()=>{
 const a=audit(archive(offers,fields),payload,clock);
 assert.equal(a.boardNativeClockCorroborated,2);
 assert.equal(a.reviewedOrBoardContext,2);
 assert.equal(a.reviewedProfileContextKeys,0);
 assert.equal(a.missingReviewedAndBoardContext,0);
 const b=audit(archive(offers.map(o=>({...o,startAt:null})),[]),payload,clock);
 assert.equal(b.reviewedOrBoardContext,0);
 assert.equal(b.missingReviewedAndBoardContext,2);
});
test('grading queue counts a valid pregame archive before the game is due',()=>{
 const {gradingQueue}=require('../scripts/pickfinder-public-model-validation.cjs');
 const p={book:'prizepicks',gameId:'10',playerId:101,market:'points',line:20.5,offeredSide:'Higher',tier:'standard',gameStartAt:start,modelRevision:'fixture-revision'};
 const frame={doc:{generatedAt:obs,rows:[p]},first:'2026-11-25T13:30:00Z',digest:'fixture'};
 const waiting=gradingQueue([frame,frame],new Set(),clock);
 assert.equal(waiting.archived,1);assert.equal(waiting.pendingNotDue,1);assert.equal(waiting.selected.length,0);
 const due=gradingQueue([frame],new Set(),'2026-11-26T03:00:00Z');
 assert.equal(due.selected.length,1);assert.equal(JSON.parse(due.selected[0].id)[0],'fixture-revision');
 assert.equal(gradingQueue([frame],new Set([due.selected[0].id]),'2026-11-26T03:00:00Z').alreadyGraded,1);
 const legacy=JSON.stringify([null,p.book,p.gameId,p.playerId,p.market,p.line,p.offeredSide,p.tier]);
 assert.equal(gradingQueue([frame],new Set([legacy]),'2026-11-26T03:00:00Z').alreadyGraded,1);
 assert.equal(gradingQueue([{...frame,first:start}],new Set(),'2026-11-26T03:00:00Z').invalid,1);
});
test('game dialog receipt is not counted as a complete named dashboard',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {ROOT,sha}=require('../scripts/pickfinder-public-archive.cjs'),{coverage}=require('../scripts/pickfinder-public-evidence-audit.cjs');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pf-coverage-'));
 try{
  const dir=path.join(tmp,ROOT,'dashboards');fs.mkdirSync(dir,{recursive:true});
  for(const d of [{schema:'pickfinder-public-game-dialog-v1',records:[{sport:'NHL',eventId:'1'},{sport:'NBA',eventId:'2'}]},{name:'Games'}]){
   const raw=JSON.stringify(d);fs.writeFileSync(path.join(dir,sha(raw)+'.json'),raw);
  }
  const a=coverage(tmp);
  assert.equal(a.dashboardSnapshots,2);assert.equal(a.namedDashboardSnapshots,1);assert.equal(a.byDashboard.Games,1);
  assert.equal(a.gameDialogReceipts,1);assert.equal(a.gameDialogObservations,2);assert.equal(a.gameDialogBySport.NHL,1);
  assert.equal(a.unclassifiedDashboardFiles,0);assert.equal(a.allFiltersVerified,false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
