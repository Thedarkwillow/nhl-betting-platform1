"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseCSV,evaluate}=require("../src/nba-pinnacle-independent-replay-v1.cjs");
test("CSV parser handles quoted comma and escaped quote and rejects ragged records",()=>{
 assert.deepEqual(parseCSV('a,b\n"x,y","a""b"\n'),[{a:"x,y",b:'a"b'}]);
 assert.throws(()=>parseCSV("a,b\n1\n"));
});
function fixture(){
 const h="prop_id,game_id,league,player,stat,start_time_utc,closed_at,opened_at,close_line,actual,close_over,close_under,result,home_team,away_team";
 const good="1,100,NBA,Sample Player,Points,2026-10-24T23:00:00Z,2026-10-24T22:59:00Z,2026-10-24T20:00:00Z,15.5,20,1.9,1.9,over,Home,Away";
 const rest=Array.from({length:2277},(_,i)=>good.replace(/^1,100,/,String(i+2)+",999,"));
 const archive=[h,good,...rest].join("\n");
 const past=Array.from({length:15},(_,i)=>({gameId:String(i),playerId:"9",player:"Sample Player",date:"2026-04-"+String(i+1).padStart(2,"0"),minutes:30,points:12+i%5,starter:true,usageProxyPerMinute:.5}));
 const target={...past[0],gameId:"200",date:"2026-10-24",tip:Date.parse("2026-10-24T23:00:00Z"),points:20,team:"Home",opponent:"Away",home:true};
 const d=rows=>({rows,rawRows:rows.length,games:rows.length,rejected:{}});
 return {archive,prior:d(past),current:d([target]),target,d};
}
test("replay excludes both ambiguous duplicate quotes and matches without consulting actual",()=>{
 const x=fixture(),a=evaluate(x.archive,x.prior,x.current);
 assert.equal(a.matchedRows,1);assert.equal(a.evaluatedRows,1);assert.equal(a.excluded.duplicateMarket,2277);
 const b=evaluate(x.archive,x.prior,x.d([{...x.target,points:99}]));
 assert.equal(b.excluded.actualMismatch,1);assert.equal(b.evaluatedRows,0);
});
test("future player games do not change the replay",()=>{
 const x=fixture(),a=evaluate(x.archive,x.prior,x.current),b=evaluate(x.archive,x.prior,x.d([x.target,{...x.target,gameId:"201",date:"2026-10-25",tip:x.target.tip+86400000,points:100}]));
 assert.deepEqual(a.markets,b.markets);assert.equal(b.freezeApproved,false);
});
