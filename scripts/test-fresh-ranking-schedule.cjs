"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=x=>fs.readFileSync(path.join(root,".github/workflows",x),"utf8");
test("fresh approval exports follow, never precede, configured source opportunities",()=>{
 const capture=read("verified-independent-nhl-capture.yml");
 const exportJob=read("refresh-allowlisted-nhl-rankings.yml");
 for(const cron of ["18 6 * * *","35 9 * * *","35 13 * * *"])
  assert.ok(capture.includes("cron: '"+cron+"'"),"Original bounded independent capture schedule changed");
 for(const cron of ["45 6 * * *","1 10,14 * * *"])
  assert.ok(exportJob.includes("cron: '"+cron+"'"),"Matched public read-only refresh missing");
 assert.doesNotMatch(exportJob,/cron: '27 6,9,12,15 \* \* \*'/);
 assert.match(exportJob,/workflows:[\s\S]*?'Verified independent NHL capture and private preview'/);
 assert.match(exportJob,/node scripts\/export-public-nhl-data\.cjs/);
 assert.match(exportJob,/if\(!approved\)\{/);
});
test("freshness alignment never bypasses the public allowlist or source expiry",()=>{
 const y=read("refresh-allowlisted-nhl-rankings.yml");
 assert.match(y,/now-t<=30\*60000/);
 assert.match(y,/boardCoverage\?\.apiPaginationComplete===true/);
 assert.match(y,/d\.props=approved\?sorted\(d\.props\):\[\]/);
 assert.match(y,/const reason=!source\?'approved_archive_missing'/);
 assert.match(y,/originalPlatformAvailabilityVerified:false/);
 assert.doesNotMatch(y,/\bPRIZEPICKSAPI_KEY\b|\bUNDERDOG_API_KEY\b|\bODDS_API_KEY\b/);
});
