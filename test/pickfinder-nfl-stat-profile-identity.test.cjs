'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),{verify}=require('../scripts/pickfinder-nfl-stat-profile-identity.cjs');
const {qualifyResearch}=require('../scripts/pickfinder-durable-identities.cjs');
const {validate}=require('../scripts/publish-pickfinder-derived.cjs');
test('historical NFL statistics require a weekly roster, exact schedule venue and more than one completed event',()=>{
 const digest='e'.repeat(64),native='b'.repeat(64),clock='2026-11-27T13:00:00Z',first='2026-11-27T12:10:00Z',seen='2026-11-27T12:05:00Z';
 const id='00-1111111',path='/players/nfl/fixture',name='Player Name',event='20261129ABCDEF12',detailId=path+'?prop=x%3Aplayer_kicking_points%3A'+event+'%3A4';
 const r={sport:'nfl',player:name,status:'sampled',truncated:false,detailId,eventId:event,market:'player_kicking_points',currentProfileAttemptedAt:seen,
  independentReconciliationContext:{team:'BUF',opponent:'NYJ',observedAt:seen,displayedLocalMatchup:{team:'BUF',opponent:'NYJ',homeAway:'home'}}};
 const g={week:12,home:'BUF',away:'NYJ',startAt:'2026-11-29T18:00:00Z'};
 const seasons=[{digest:native,first,doc:{kind:'nflverse_public_native_history_v1',games:[g],rosters:[{name,week:12,team:'BUF',gsisId:id}]}}];
 const rows=new Map([10,11].flatMap(i=>['fg_made','pat_made','kicking_points'].map((market,j)=>{
  const eventId='2026_'+i+'_BUF_MIA';return [i+market,{sport:'nfl',sourcePlayer:name,sourceDetailId:detailId,playerId:id,eventId,market,value:j+1,
  officialStartAt:'2026-11-22T18:00:00Z',profileAvailableAt:first,profileObservedAt:seen,nativeAvailableAt:first,nativeDigest:native,profileDigest:digest}];
 })));
 const durable={rows:[],statisticalCrosswalks:[],reviewedStatIdentities:[]};
 const opts={documents:[{doc:{records:[r]},digest,first}],audit:{rows},seasons,durable,clock};
 const proof=verify(opts);
 a.equal(proof.length,1);a.equal(proof[0].matchedCompletedGames.length,2);a.equal(proof[0].eventTimeVerified,false);
 const out=qualifyResearch(rows,{...durable,nflStatProfileIdentities:proof},clock);a.equal(out.length,6);a.ok(out.every(x=>x.market&&x.productionModelEligible===false&&x.operatorOfferVerified===false));
 const file='data/pickfinder-current-identity-registry.json',doc={kind:'pickfinder_current_identity_registry_v1',generatedAt:clock,
 paidRequests:0,modelApproved:false,originalPlatformVerified:false,archiveRevision:'f'.repeat(40),rows:[],registry:[],nflStatProfileIdentities:proof,qualifiedShadowStatistics:out};
 a.doesNotThrow(()=>validate(JSON.stringify(doc),file,Date.parse(clock)));
 a.throws(()=>validate(JSON.stringify({...doc,nflStatProfileIdentities:[]}),file,Date.parse(clock)),/shadow statistic/);
 a.equal(verify({...opts,audit:{rows:new Map([...rows].slice(0,3))}}).length,0);
 a.equal(verify({...opts,seasons:seasons.map(x=>({...x,doc:{...x.doc,games:[{...g,home:'NYJ',away:'BUF'}]}}))}).length,0);
 a.equal(verify({...opts,durable:{...durable,rows:[{sport:'nfl',namespace:'nfl:gsis',sourcePlayerPath:path,playerId:'00-2222222'}]}}).length,0);
});
