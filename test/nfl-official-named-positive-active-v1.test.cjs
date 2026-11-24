"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {assess}=require("../src/nfl-official-named-positive-active-v1.cjs");
const p={gameId:"2026_11_ARI_KC",team:"KC",player:"Rashee Rice",
 historicalPlayerId:"00-0039067",eventStartsAt:"2026-11-22T18:00:00Z"};
const doc={kind:"nfl_official_explicit_active_news_archive_v1",
 capturedAt:"2026-11-22T15:30:00Z",firstGitPending:true,researchOnly:true,
 noMedicalClearanceByOmission:true,officialWeek:11,
 positiveSnippets:[{sourceUrl:"https://www.nfl.com/news/chiefs-cardinals-week-11-actives",
 teamHeader:"Kansas City Chiefs",publishedAt:"2026-11-22T15:20:00Z",
 updatedAt:"2026-11-22T15:25:00Z",observedAt:"2026-11-22T15:30:00Z",
 snippet:"Rashee Rice (knee) is officially active for Sunday's game."}]};
const options={firstGitAt:"2026-11-22T15:32:00Z",asOf:"2026-11-22T15:35:00Z"};
t("exact first-Git official named active context remains non-bettable",()=>{
 const r=assess(p,doc,options);
 a.equal(r.namedFirstPartyStatementFound,true);
 a.equal(r.independentlyVerifiedProviderGSIS,false);
 a.equal(r.fullGameDayActiveRosterVerified,false);
 a.equal(r.originalAppOfferAuthenticated,false);
 a.equal(r.bettingEligible,false);
});
t("absent or conflicting NFL.com reports never imply active",()=>{
 const snippets=["Rashee Rice is expected to be active for Sunday.",
 "Rashee Rice is not active for Sunday.",
 "Tony Pollard is officially active for Sunday.",
 "Rashee Rice was active for last week's game.",
 "Rice is active for Sunday."];
 for(const s of snippets)a.equal(assess(p,{...doc,positiveSnippets:[{
  ...doc.positiveSnippets[0],snippet:s}]},options).namedFirstPartyStatementFound,false,s);
 for(const wrong of [
  {...doc,officialWeek:10},
  {...doc,positiveSnippets:[{...doc.positiveSnippets[0],teamHeader:"Arizona Cardinals"}]},
  {...doc,positiveSnippets:[{...doc.positiveSnippets[0],sourceUrl:"https://example.com/news/report"}]},
  {...doc,positiveSnippets:[doc.positiveSnippets[0],doc.positiveSnippets[0]]}
 ])a.equal(assess(p,wrong,options).namedFirstPartyStatementFound,false);
});
t("a post-kickoff publication or archive first-Git cannot retroactively clear a prop",()=>{
 a.equal(assess(p,doc,{...options,firstGitAt:"2026-11-22T17:55:00Z"}).namedFirstPartyStatementFound,false);
 a.equal(assess(p,{...doc,capturedAt:"2026-11-22T15:40:00Z"},options).namedFirstPartyStatementFound,false);
 a.equal(assess(p,{...doc,positiveSnippets:[{...doc.positiveSnippets[0],
  publishedAt:"2026-11-22T18:00:00Z",updatedAt:"2026-11-22T18:00:00Z"}]},options).namedFirstPartyStatementFound,false);
});
