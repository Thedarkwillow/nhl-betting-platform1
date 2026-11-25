'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{traverseCustomFilters}=require('../scripts/pickfinder-custom-filters.cjs');
test('walks all exposed multi-select subsets crossed with single-select and restores',async()=>{
 const current={map:new Set(['A']),sport:new Set(['X'])},labels={map:['A','B'],sport:['X','Y']},saved=[];
 const controls=[{label:'Map',id:'map'},{label:'Sport',id:'sport'}];
 const res=await traverseCustomFilters({url:()=> 'https://www.pickfinder.app/games'},{read:async()=>controls,open:async()=>{},close:async()=>{},options:async x=>({multiple:x.id==='map',options:labels[x.id].map(label=>({label,selected:current[x.id].has(label)}))}),choose:async(x,label)=>{if(x.id==='map'){if(current.map.has(label))current.map.delete(label);else current.map.add(label);}else current.sport=new Set([label]);},onState:async s=>saved.push(JSON.stringify(s.map(x=>x.values)))});
 assert.equal(new Set(saved).size,8);assert.equal(res.supportedCombinationsExhausted,true);assert.equal(res.allFilterCombinationsVerified,false);assert.deepEqual([...current.map],['A']);assert.deepEqual([...current.sport],['X']);
});
test('interrupted traversal never claims exhaustive coverage',async()=>{
 let current='A',n=0;
 const res=await traverseCustomFilters({url:()=> 'https://www.pickfinder.app/games'},{read:async()=>[{label:'Map',id:'map'}],open:async()=>{},close:async()=>{},options:async()=>({multiple:false,options:['A','B'].map(label=>({label,selected:current===label}))}),choose:async(_,x)=>{current=x;},onState:async()=>{n++},shouldContinue:()=>n<1});
 assert.equal(res.supportedCombinationsExhausted,false);assert.ok(res.issues.includes('deadline'));assert.equal(current,'A');
});

test('native multiselect traverses empty, individual and combined values',async()=>{
 const {traverseNativeFilters}=require('../scripts/pickfinder-research-coverage.cjs');
 const rows=[{label:'Map',index:0,multiple:true,value:['a'],options:[{value:'a',label:'A'},{value:'b',label:'B'}]}],out=[];
 const a=await traverseNativeFilters(null,{read:async()=>structuredClone(rows),set:async(x,value)=>{rows[x.index].value=value;},onState:async s=>out.push(s[0].value)});
 assert.equal(out.length,4);assert.deepEqual(rows[0].value,['a']);assert.equal(a.nativeCombinationsExhausted,true);
});
