"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {summarize}=require("../src/nfl-official-injury-evidence-counts.cjs");
const doc={kind:"nfl_first_party_published_game_status_v1",
 capturedAt:"2026-11-19T03:44:34Z",
 sources:["https://fantasy-www.nfl.com/news/nfl-week-11-injury-report-2026-season"],
 missingIsHealthy:false,activeGameRosterVerified:false,
 rows:[{season:2026,week:11,team:"IND",gsisId:"00-0000001",status:"out",modifiedAt:"2026-11-18T23:57:29Z"},
  {season:2026,week:11,team:"IND",gsisId:"00-0000002",status:"questionable",modifiedAt:"2026-11-18T23:57:29Z"},
  {season:2026,week:11,team:"HOU",gsisId:"00-0000003",status:"out",modifiedAt:"2026-11-18T23:57:29Z"}]};
const cfg={now:"2026-11-19T03:51:00Z",firstGitAt:"2026-11-19T03:47:00Z"};
test("first-Git published official report counts explicit negative statuses only",()=>{
 const r=summarize(doc,cfg);
 a.equal(r.officialFirstGitVerified,true);a.equal(r.rows,3);
 a.equal(r.out,2);a.equal(r.questionable,1);a.equal(r.doubtful,0);
 a.equal(r.activeGamedayVerified,false);a.equal(r.missingMeansHealthy,false);
 a.equal(r.approvedSelections,0);
});
test("late or untrusted or stale official report cannot be backdated",()=>{
 for(const [x,y] of [
  [doc,{...cfg,firstGitAt:null}],
  [doc,{...cfg,firstGitAt:"2026-11-19T03:40:00Z"}],
  [doc,{...cfg,firstGitAt:"2026-11-19T04:00:00Z"}],
  [{...doc,sources:["https://example.com/news/fake"]},cfg],
  [{...doc,missingIsHealthy:true},cfg],
  [{...doc,activeGameRosterVerified:true},cfg]
 ]){
  const q=summarize(x,y);
  a.equal(q.officialFirstGitVerified,false);
  a.equal(q.rows,0);
 }
});
test("duplicates quarantined and no other status implies active",()=>{
 const r=summarize({...doc,rows:[...doc.rows,doc.rows[0],
  {...doc.rows[0],gsisId:"00-0000004",status:"active"}]},cfg);
 a.equal(r.rows,3);a.equal(r.ambiguous,1);a.equal(r.activeGamedayVerified,false);
});
