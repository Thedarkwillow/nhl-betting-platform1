"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{choose,groups}=require("../scripts/dota-series-archive-review.cjs");
function row(n,series,t){return {provider:"opendota",title:"DOTA2",providerGameId:String(n),leagueId:"10",providerSeriesId:String(series),providerSeriesType:1,teamIds:["1","2"],winnerTeamId:"1",startAt:new Date(t*3600000).toISOString(),endAt:new Date(t*3600000+1800000).toISOString(),providerReportedFinal:true};}
test("fill partially archived series before unrelated newer games",()=>{const a=[row(1,11,1),row(2,11,2),row(3,12,10),row(4,12,11)];assert.equal(choose(a,new Set(["1"]),1)[0].providerGameId,"2");assert.equal(groups(a).length,2);});
test("reject conflicting team and overlapping timestamps as ordered series",()=>{const a=row(1,11,1),b=row(2,11,1);assert.equal(groups([a,b]).length,0);assert.equal(groups([a,{...row(3,11,2),teamIds:["1","3"]}]).length,0);});
