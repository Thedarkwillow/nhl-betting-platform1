'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit,compare,inputAudit}=require('../scripts/pickfinder-pilot-reconcile.cjs');
const {readBoard}=require('../scripts/pickfinder-browser.cjs');
test('audit distinguishes empty app evidence from missing identity and does not reconstruct offers',()=>{
 const row={sport:'nba',detailId:'fixture',player:'fixture',market:'points',apps:[]};
 const r=audit({partitions:[{source:{book:'prizepicks',sport:'nba',pages:[{rows:[row,{...row,appEvidence:[{book:'prizepicks'}]},{...row,player:null}]}]},normalized:{health:{unresolvedRows:3}}}]});
 assert.equal(r.unresolved,3);assert.equal(r.partitions[0].noApps,2);assert.equal(r.partitions[0].evidenceRetained,1);assert.equal(r.recoveredOffers,0);
});
test('book isolated DOM evidence retains tier-only and explicit split price without borrowing another book',()=>{
 const badge={alt:'prizepicks'},goblin={alt:'goblin'},other={alt:'underdog'};
 const makeGroup=(icons,innerText)=>({innerText,querySelectorAll:()=>icons});
 const a=makeGroup([badge,goblin],'Goblin'),b=makeGroup([other],'O -110');
 const cell=makeGroup([badge,goblin,other],'Goblin O -110');
 badge.parentElement=a;goblin.parentElement=a;a.parentElement=cell;other.parentElement=b;b.parentElement=cell;
 const link={href:'https://www.pickfinder.app/players/nba/fixture?prop=x:points:e:2.5',querySelector:()=>({innerText:'fixture'})};
 const tr={querySelector:()=>link,cells:[cell]};
 const table={innerText:'',querySelectorAll:q=>q==='th'?[{innerText:'Apps'}]:[tr]};
 global.document={body:{innerText:'Premium'},querySelector:q=>q==='table'?table:q.includes('Open user menu')?{}:null};
 try{let r=readBoard({book:'prizepicks',code:'NBA',sport:'nba',observedAt:'2026-11-25T14:00:00Z'}).rows[0];assert.equal(r.apps.length,0);assert.equal(r.appEvidence[0].tier,'goblin');
 a.innerText='Higher +120\nLower -150';r=readBoard({book:'prizepicks',code:'NBA',sport:'nba',observedAt:'2026-11-25T14:00:00Z'}).rows[0];assert.equal(r.apps.length,2);assert.equal(r.apps[0].displayedPrice,'+120');assert.equal(r.apps[1].side,'Lower');
 }finally{delete global.document;}
});

test('new priced observation does not backfill old missing prices',()=>{
 const row={sport:'nba',detailId:'fixture',player:'fixture',market:'points',eventId:'event',apps:[]};
 const s={book:'prizepicks',sport:'nba',pages:[{rows:[row,{...row,detailId:'absent'}]}]};
 const fresh={...s,pages:[{rows:[{...row,apps:[{book:'prizepicks',line:2.5,side:'Higher',displayedPrice:'-110'}]}]}]};
 const r=compare({partitions:[{source:s}]},[fresh]);assert.equal(r.historicalUnresolved,2);assert.equal(r.freshExplicitPrice,1);assert.equal(r.historicalRecovered,0);assert.equal(r.partitions[0].notSeen,1);
});
test('input audit leaves independent verification and model promotion off',()=>{
 const r=inputAudit([{sport:'nba',book:'prizepicks',offers:[{book:'prizepicks',side:'Higher',line:2.5,displayedPrice:'-110',eventId:'event',observedAt:'2026-11-25T10:00:00Z',startAt:null}],researchObservations:[{value:null}]}]);
 assert.equal(r.sports.nba.explicitPrices,1);assert.equal(r.sports.nba.pregameTimestampVerified,0);assert.equal(r.sports.nba.eligibleForLockedModel,0);assert.equal(r.modelInputsApproved,false);
});

test('tier-only evidence stays distinct from actionable offer',()=>{const {missingDisposition}=require('../scripts/pickfinder-pilot-reconcile.cjs');const row={sport:'nba',player:'fixture',market:'points',detailId:'fixture',apps:[]};const source={book:'prizepicks',sport:'nba',pages:[{rows:[row]}]};const fresh={...source,pages:[{rows:[{...row,appEvidence:[{book:'prizepicks',icons:['prizepicks','goblin'],tier:'goblin',line:1.5}]},row]}]};const r=missingDisposition({partitions:[{source,normalized:{health:{unresolvedRows:1}}}]},[fresh]);assert.equal(r.originalMissingAppEvidence,1);assert.equal(r.newRows,2);assert.equal(r.tierOnly,1);assert.equal(r.missingBook,1);assert.equal(r.pricesInferred,0);assert.equal(r.sidesInferred,0);});

test('source-reported pregame clock does not count as independent verification',()=>{
 const r=inputAudit([{sport:'nba',book:'prizepicks',offers:[{book:'prizepicks',side:'Higher',line:2.5,displayedPrice:'-110',eventId:'event',observedAt:'2026-11-25T10:00:00Z',startAt:'2026-11-25T20:00:00Z'}],researchObservations:[]}]);
 assert.equal(r.sports.nba.sourceReportedPregame,1);assert.equal(r.sports.nba.pregameTimestampVerified,0);
});
test('replay of genuine-shaped tier-only fixture yields research evidence without a price or side',()=>{
 const {replayTierEvidence}=require('../scripts/pickfinder-pilot-reconcile.cjs');
 const observedAt='2026-11-25T10:00:00Z';
 const row={sport:'nba',player:'fixture',market:'points',detailId:'fixture',eventId:'fixture',observedAt,apps:[],appEvidence:[{book:'prizepicks',icons:['prizepicks','goblin'],tier:'goblin',line:1.5}]};
 const batch={schema:'pickfinder-premium-export-v1',book:'prizepicks',sport:'nba',localDay:'2026-11-25',slot:'manual',startedAt:observedAt,endedAt:observedAt,boardState:'populated',displayedPageCount:1,lastPageReached:true,pages:[{number:1,rows:[row]}]};
 assert.deepEqual(replayTierEvidence(batch),{tierRecords:1,pricedOfferKeys:0,unresolvedAppearances:1});
});
