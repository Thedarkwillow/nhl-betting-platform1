'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../scripts/pickfinder-pilot-reconcile.cjs');
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
