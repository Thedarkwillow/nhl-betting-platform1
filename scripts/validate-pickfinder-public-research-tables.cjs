'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n),'utf8'));
const index=read('pickfinder-public-research-directory.json');
const all=read('pickfinder-public-research-tables.json');
a.equal(all.kind,'pickfinder_public_research_tables_v1');
a.equal(all.sourceIndexSha256,index.indexSha256);
a.equal(all.exactModelInputsApproved,false);a.equal(all.independentPlayerIdentityVerified,false);
a.equal(all.paidApiRequests,0);
const routes=new Set(index.researchRoutes.filter(p=>/^\/leagues\/[^/]+\/(?!players$)[^/]+$/.test(p))),used=new Set();
const perLeague={};let tables=0,rows=0;
for(const s of all.sources){
 const route='/leagues/'+s.league+'/'+s.view;
 a.ok(routes.has(route)&&!used.has(route));
 a.equal(s.url,'https://www.pickfinder.app'+route);
 used.add(route);
 a.ok(['scoped_tables_observed','no_structured_table','source_not_read'].includes(s.status));
 if(s.status!=='source_not_read'){
  a.match(s.sourceSha256,/^[a-f0-9]{64}$/);
  a.ok(Number.isFinite(Date.parse(s.observedAt)));
 }
 if(s.status==='scoped_tables_observed')a.ok(s.tables.length>0); else a.equal(s.tables.length,0);
 const v=perLeague[s.league]??={sources:0,tables:0,rows:0};
 v.sources++;v.tables+=s.tables.length;tables+=s.tables.length;
 for(const t of s.tables){
  a.equal(typeof t.heading,'string');a.ok(t.heading&&t.columns.length>=2&&t.columns.length===t.definitions.length);
  for(const row of t.rows){
   a.equal(row.length,t.columns.length);
   a.ok(row.every(x=>x===null||typeof x==='string'&&x.length<=400&&!/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|<script|Bearer\s+)/i.test(x)));
  }
  rows+=t.rows.length;v.rows+=t.rows.length;
 }
}
a.equal(used.size,routes.size);
const summary={kind:'pickfinder_public_research_tables_index_v1',sources:used.size,tables,rows,perLeague,modelInputsApproved:false,paidApiRequests:0};
if(process.argv[2]==='--write')fs.writeFileSync(path.join(root,'data/pickfinder-public-research-tables-index.json'),JSON.stringify(summary,null,2)+'\n');
else a.deepEqual(read('pickfinder-public-research-tables-index.json'),summary);
console.log(JSON.stringify({sources:used.size,tables,rows,paidApiRequests:0,modelInputsApproved:false}));
