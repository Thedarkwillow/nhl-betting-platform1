"use strict";
const {test}=require("node:test"),a=require("node:assert/strict");
const {auditPages}=require("../src/underdog-board-pagination-integrity.cjs");
const at="2026-11-17T20:00:00Z";
function row(id){return {league:"NHL",is_demo:false,source:"underdogapi",
 id:"m_"+id,line_id:id,status:"active",line:2.5,observed_at:"2026-11-17T19:55:00Z",
 player:{id:"pl_"+id,name:"Fixture Player"},event:{id:"fx_1",starts_at:"2026-11-18T00:00:00Z"},
 market:{id:"m_"+id,stat:"shots_on_goal",period:"Full game"},
 selections:[{side:"higher",available:true},{side:"lower",available:true}]};}
function page(cursor,next,data){
 return {requestedCursor:cursor,requestedLeague:"NHL",requestedView:"full",
  requestedFilterSignature:"league=NHL&view=full&limit=100",
  response:{meta:{count:data.length,limit:100,mode:"live",
   schema_version:"1.0",observed_at:"2026-11-17T19:55:00Z",
   is_demo:false,source_status:"fresh",next_cursor:next},data}};
}
test("contiguous scoped two-page Underdog archive is private research, never platform verified",()=>{
 const x=auditPages([page(null,"cursorB",[row("u1")]),page("cursorB",null,[row("u2")])],{league:"NHL",now:at});
 a.equal(x.requestPaginationComplete,true);a.equal(x.rows,2);a.equal(x.pages,2);
 a.equal(x.fullPlatformBoardVerified,false);a.equal(x.sourcePlayerIdentityVerified,false);
 a.equal(x.publicRows,0);a.equal(x.productionEligible,false);
});
test("cursor gaps, silent truncation, repeated lines and demo flags fail closed",()=>{
 const good=page(null,"cursorB",[row("u1")]);
 for(const docs of [
  [good],
  [good,page("cursorC",null,[row("u2")])],
  [good,page("cursorB",null,[row("u1")])],
  [page(null,null,[{...row("u1"),is_demo:true}])],
  [page(null,null,[{...row("u1"),observed_at:"2026-11-17T17:00:00Z"}])],
  [page(null,null,[{...row("u1"),selections:[{side:"higher",available:true},{side:"higher",available:true}]}])]
 ]){
  const result=auditPages(docs,{league:"NHL",now:at});
  a.equal(result.status,"unverified");a.equal(result.requestPaginationComplete,false);
 }
});
test("cross-sport contamination and partial/full-view ambiguity cannot pass",()=>{
 a.equal(auditPages([page(null,null,[{...row("u1"),league:"NFL"}])],{league:"NHL",now:at}).status,"unverified");
 a.equal(auditPages([page(null,null,[row("u1")])],{league:"NHL",now:at,requestedView:"first_only"}).status,"unverified");
});

test("Underdog provider pages must prove live schema, fresh metadata and unchanged requested filters",()=>{
 const clean=[page(null,"next",[row("u1")]),page("next",null,[row("u2")])];
 a.equal(auditPages(clean,{league:"NHL",now:at}).requestPaginationComplete,true);
 const variants=[
  [clean[0],{...clean[1],requestedLeague:"NFL"}],
  [clean[0],{...clean[1],requestedView:"compact"}],
  [clean[0],{...clean[1],requestedFilterSignature:"league=NHL&view=full&stat=points"}],
  [{...clean[0],response:{...clean[0].response,meta:{...clean[0].response.meta,mode:"demo"}}},clean[1]],
  [{...clean[0],response:{...clean[0].response,meta:{...clean[0].response.meta,schema_version:"unverified"}}},clean[1]],
  [{...clean[0],response:{...clean[0].response,meta:{...clean[0].response.meta,observed_at:"2026-11-17T15:00:00Z"}}},clean[1]],
  [{...clean[0],response:{...clean[0].response,data:[{...row("u1"),player:null}]}} ,clean[1]]
 ];
 for(const pages of variants){
  const result=auditPages(pages,{league:"NHL",now:at});
  a.equal(result.status,"unverified");
  a.equal(result.productionEligible,false);
 }
 const ok=auditPages(clean,{league:"NHL",now:at});
 a.equal(ok.collectorFilterContinuityVerified,true);
 a.equal(ok.independentlyPinnedProviderSnapshot,false);
 a.equal(ok.fullPlatformBoardVerified,false);
});
