"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {failureCategory,coverage,nextMissingSeasonDates,priorSeasonDateFiles}=require("../scripts/backfill-nhl-prior-season-periods.cjs");
test("unavailable official shiftcharts remain missing and are never invented as completed",()=>{
 a.equal(failureCategory("Incomplete NHL shiftchart pagination (reported=0, received=0, pages=1)"),"official_shiftchart_zero_rows");
 a.equal(failureCategory("NHL official source HTTP 503"),"transient_or_http_source_failure");
 const x=coverage(["2025-10-07"],["2025-10-08"],["2025-10-09"],[]);
 a.equal(x.accountedDates,3);a.equal(x.completeDates,2);a.equal(x.verifiedEmptyDates,1);
 a.equal(x.remainingDates,x.seasonCalendarDays-3);
 a.equal(x.allDatesAccountedFor,false);
 a.throws(()=>coverage(["2025-10-07"],[],[],["2025-10-07"]));
 a.throws(()=>coverage(["2024-08-07"],[],[],[]));
});
test("one shiftchart failure never starves all four new official date attempts",()=>{
 const x=nextMissingSeasonDates({existingDates:["2025-10-07"],emptyDates:[],
  recentFailedDates:["2025-10-08","2025-10-09"],max:5});
 a.equal(x.length,5);
 a.ok(x.includes("2025-10-08"));
 a.ok(x.filter(d=>!["2025-10-08","2025-10-09"].includes(d)).length>=3);
});

test("current 2026–27 NHL period dates never enter the isolated 2025–26 completeness denominator",()=>{
 const files=["2025-10-07.json","2026-02-11.json","2026-05-02.json",
  "2026-06-24.json","2026-10-17.json","2026-11-06.json","2025-10-07.backup.json","x.json"];
 const past=priorSeasonDateFiles(files);
 a.deepEqual(past,["2025-10-07","2026-02-11","2026-05-02","2026-06-24"]);
 const r=coverage(past,[],[],[]);
 a.equal(r.accountedDates,4);a.equal(r.seasonCalendarDays,261);
 a.equal(r.remainingDates,257);
 a.equal(priorSeasonDateFiles(["2026-11-06.json"]).length,0);
});
