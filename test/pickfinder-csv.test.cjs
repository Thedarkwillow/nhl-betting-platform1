"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {parseCsv,convert}=require("../scripts/import-pickfinder-csv.cjs");
test("CSV parser handles quoted newlines",()=>{
 const csv=["a,b",'"x','y",2',""].join("\n");
 assert.deepEqual(parseCsv(csv),[{a:"x\ny",b:"2"}]);
});

test("matches abbreviated NHL boxscore names with team verification",()=>{
 const history={players:{"1":{playerId:1,name:"C. McDavid",team:"EDM"},"2":{playerId:2,name:"C. McDavid",team:"OTHER"}}};
 const row={league:"NHL",player:"Connor McDavid",team:"EDM",prop_type:"Assists",line:0.5,extracted_at_utc:"2026-10-31T23:58:42Z"};
 const ok=convert([row],history);
 assert.equal(ok.lines.length,1);
 assert.equal(ok.lines[0].playerId,1);
 const wrong=convert([{...row,team:"NYR"}],history);
 assert.equal(wrong.lines.length,0);
 assert.equal(wrong.unmatched[0].reason,"team mismatch");
});
