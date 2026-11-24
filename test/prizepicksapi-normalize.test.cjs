"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeProjections}=require("../src/prizepicksapi-normalize.cjs");
const at="2026-11-01T17:00:00Z";
const p={id:"pp_example",source:"prizepicks",league:"NHL",status:"active",is_demo:false,
 player:{name:"Example Skater",team:"NYR"},event:{opponent:"EDM",starts_at:"2026-11-02T01:00:00Z"},
 market:{stat:"Shots On Goal",period:"Full game"},line:2.5,observed_at:"2026-11-01T16:58:00Z",
 selections:[{side:"more",tier:"standard",available:true,payout_multiplier:null},
 {side:"less",tier:"standard",available:true,payout_multiplier:null}]};
test("standard sides preserve game identity and unknown payout",()=>{
 const v=normalizeProjections([p],at);
 assert.deepEqual(v.rows.map(x=>x.side),["Higher","Lower"]);
 assert.equal(v.rows[0].eventStartsAt,p.event.starts_at);
 assert.equal(v.rows[0].tierPayoutVerified,false);
});
test("goblin demon only have Higher where available",()=>{
 const v=normalizeProjections([{...p,selections:[
 {side:"more",tier:"goblin",available:true},{side:"less",tier:"goblin",available:true},
 {side:"more",tier:"demon",available:true},{side:"less",tier:"demon",available:true}]}],at);
 assert.deepEqual(v.rows.map(x=>x.tier),["Goblin","Demon"]);
});
test("rejects demo, started, stale and duplicate offers",()=>{
 const v=normalizeProjections([p,p,{...p,event:{starts_at:"2026-11-01T16:00:00Z"}},
 {...p,observed_at:"2026-11-01T12:00:00Z"},{...p,is_demo:true}],at);
 assert.equal(v.rows.length,2);
 assert.equal(v.skipped.duplicate,2);
 assert.equal(v.skipped.started,1);
 assert.equal(v.skipped.stale,1);
 assert.equal(v.skipped.invalid,1);
});

test("live compact projections may omit is_demo but never accept demo rows",()=>{
 const compact={...p};
 delete compact.is_demo;
 const rows=normalizeProjections([compact,{...p,id:"demo_1",is_demo:true}],at);
 assert.equal(rows.rows.length,2);
 assert.equal(rows.skipped.invalid,1);
});


const compact={id:"pp_16258896",league:"NHL",player:"Example Skater",
 team:"NYR",stat:"Shots On Goal",period:"Full game",line:2.5,
 tier:"standard",sides:["more","less"],opponent:"EDM",
 starts_at:"2026-11-02T01:00:00Z",status:"active",
 observed_at:"2026-11-01T16:58:00Z",
 player_id:"pl_example",fixture_id:"fx_example",
 opening_line:3.5,line_moves:2};
// Fixture follows publicly documented /projections?view=compact schema,
// not the nested full-view mock that concealed the production bug.
test("real compact API field contract creates two precise sides, not fabricated payouts",()=>{
 const {rows,skipped}=normalizeProjections([compact],at);
 assert.equal(skipped.invalid,0);
 assert.deepEqual(rows.map(x=>x.side),["Higher","Lower"]);
 assert.deepEqual(rows.map(x=>x.tier),["Standard","Standard"]);
 assert.ok(rows.every(x=>x.matchup==="EDM"&&x.team==="NYR"&&
  x.player==="Example Skater"&&x.market==="Shots On Goal"&&
  x.period==="Full game"&&x.projectionId===compact.id));
 assert.ok(rows.every(x=>x.eventStartsAt===compact.starts_at&&
  x.observedAt===compact.observed_at&&x.capturedAt===at));
 assert.ok(rows.every(x=>x.payoutMultiplier===null&&
  x.tierPayoutVerified===false&&x.lineContext===null));
});
test("compact goblin and demon never fabricate the unavailable Lower side",()=>{
 const a={...compact,id:"pp_goblin",tier:"goblin",sides:["more"]};
 const b={...compact,id:"pp_demon",tier:"demon",sides:["more","less"]};
 const result=normalizeProjections([a,b],at);
 assert.deepEqual(result.rows.map(x=>[x.tier,x.side]),[
  ["Goblin","Higher"],["Demon","Higher"]]);
});
test("compact rejects missing real identity, status, demo, wrong league and unknown tiers",()=>{
 const bad=[
  {...compact,id:"bad"},
  {...compact,league:"NBA"},
  {...compact,status:"unavailable"},
  {...compact,is_demo:true},
  {...compact,source:"demo"},
  {...compact,player:null},
  {...compact,team:null},
  {...compact,stat:null},
  {...compact,period:null},
  {...compact,starts_at:null},
  {...compact,tier:"unknown"},
  {...compact,sides:[]},
  {...compact,sides:["higher"]},
  {...compact,sides:["more","more"]},
  {...compact,line:NaN}
 ];
 const result=normalizeProjections(bad,at);
 assert.equal(result.rows.length,0);
 assert.equal(result.skipped.invalid,bad.length);
});
test("compact remains freshness and chronology guarded, with stable deduplication",()=>{
 const stale={...compact,id:"pp_stale",observed_at:"2026-11-01T15:30:00Z"};
 const started={...compact,id:"pp_started",starts_at:"2026-11-01T16:00:00Z"};
 const live={...compact,id:"pp_live",starts_at:"2026-11-01T16:59:00Z"};
 const out=normalizeProjections([compact,compact,stale,started,live],at);
 assert.equal(out.rows.length,2);
 assert.equal(out.skipped.duplicate,2);
 assert.equal(out.skipped.stale,1);
 assert.equal(out.skipped.started,2);
});
test("compact normalized rows match the pre-existing official NHL model research contract",()=>{
 const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
 const clock="2026-11-01T17:00:00Z",captured=clock;
 const row=normalizeProjections([compact],clock);
 const board={generatedAt:captured,completePagination:true,
  rows:row.rows,provider:"prizepicksapi.com"};
 const projections={builtAt:"2026-11-01T16:50:00Z",model:"unit",
  players:{"1":{playerId:1,name:"Example Skater",team:"NYR",
   latestGameDate:"2026-10-29",projections:{
    shotsOnGoal:{estimate:3.2,observations:8,ready:true,last5:3,last10:3.2}}}}};
 const out=buildFreeNhlResearch(board,projections,clock);
 assert.equal(out.matchedRows,2);
 assert.equal(out.boardCoverageComplete,true);
 assert.ok(out.rankedProps.every(x=>x.player==="Example Skater"&&
  x.opponent==="EDM"&&x.eventStartsAt===compact.starts_at&&x.source==="PrizePicks"));
});

test("fixed as-of board treats old line-change timestamps as active membership, but not old live offers",()=>{
 const old={...p,id:"pp_oldchange",observed_at:"2026-10-30T08:00:00Z"};
 assert.equal(normalizeProjections([old],at).rows.length,0);
 const fixed=normalizeProjections([old],at,{validatedAsOfAt:at});
 assert.equal(fixed.rows.length,2);
 assert.equal(fixed.skipped.stale,0);
 assert.equal(fixed.rows[0].observedAt,old.observed_at);
 assert.throws(()=>normalizeProjections([old],at,{validatedAsOfAt:"2026-10-31T00:00:00Z"}),/Invalid NHL/);
});

test("complete verified replay lasting between two and five minutes normalizes without moving its pin",()=>{
 const late="2026-11-01T17:03:30Z";
 const future={...p,id:"pp_future",observed_at:"2026-11-01T17:01:00Z"};
 const started={...p,id:"pp_started_between_pin_and_finish",event:{...p.event,starts_at:"2026-11-01T17:02:00Z"}};
 const r=normalizeProjections([p,future,started],late,{validatedAsOfAt:at});
 assert.equal(r.rows.length,2);
 assert.equal(r.rows[0].capturedAt,late);
 assert.equal(r.skipped.stale,1);
 assert.equal(r.skipped.started,1);
 assert.throws(()=>normalizeProjections([p],"2026-11-01T17:05:01Z",{validatedAsOfAt:at}),/Invalid NHL normalization clock/);
});
