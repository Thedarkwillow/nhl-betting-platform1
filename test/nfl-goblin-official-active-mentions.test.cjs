"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {scan}=require("../src/nfl-goblin-official-active-mentions.cjs");
const game={providerGameId:"provider-11-HOU",officialGameId:"2026_11_IND_HOU",
 officialKickoffAt:"2026-11-20T01:15:00Z"};
const player={providerPlayerId:"PP-abc",originalProviderGameId:game.providerGameId,
 officialGameId:game.officialGameId,originalPlayerName:"C.J. Stroud",
 team:"HOU",gsisId:"00-0039896",
 source:"conditional_unique_name_team_position_prior_roster",
 independentlyVerifiedProviderGSIS:false,gameDayActiveVerified:false};
const capture="2026-11-19T22:50:00Z",now="2026-11-19T23:02:00Z",
 git="2026-11-19T22:55:00Z";
const article={kind:"nfl_official_explicit_active_news_archive_v1",
 capturedAt:capture,articlesExamined:1,officialWeek:11,
 firstGitPending:true,researchOnly:true,
 noMedicalClearanceByOmission:true,
 positiveSnippets:[{sourceUrl:"https://www.nfl.com/news/week-11-injuries-sunday-pregame-2026-nfl-season",
  title:"NFL Week 11 injuries",
  publishedAt:"2026-11-19T22:40:00Z",updatedAt:"2026-11-19T22:45:00Z",
  observedAt:capture,teamHeader:"Houston Texans",
  snippet:"QB C.J. Stroud (knee; questionable) is officially active for Thursday's game."}]};
const run=(candidate=[player],doc=article,opts={})=>
 scan(candidate,doc,[game],{firstGitAt:git,now,...opts});
t("only explicit first-Git official NFL.com positive status joins provisional player research",()=>{
 const d=run();
 a.equal(d.corroboratedConditionalPlayers,1);
 a.equal(d.explicitMentions,1);
 a.equal(d.officialPositiveProviderGSISVerified,0);
 a.equal(d.officialCompleteGameRosterVerified,false);
 a.equal(d.approvedSelections,0);
 a.equal(d.noActiveByOmission,true);
});
t("injury report absence, expected-to-play, negative inactives and wrong team NEVER mark active",()=>{
 a.equal(run([player],{...article,positiveSnippets:[]}).corroboratedConditionalPlayers,0);
 for(const snippet of [
 "C.J. Stroud is expected to play on Thursday.",
 "C.J. Stroud is inactive for Thursday.",
 "C.J. Stroud is not active for Thursday."
 ])a.equal(run([player],{...article,positiveSnippets:[
  {...article.positiveSnippets[0],snippet}]}).corroboratedConditionalPlayers,0);
 a.equal(run([player],{...article,positiveSnippets:[
  {...article.positiveSnippets[0],teamHeader:"Indianapolis Colts"}]}).corroboratedConditionalPlayers,0);
});
t("live assertions must have official source and immutable pregame first Git",()=>{
 a.equal(run([player],article,{firstGitAt:"2026-11-20T01:05:00Z"})
  .corroboratedConditionalPlayers,0);
 a.equal(run([player],{...article,officialWeek:10}).corroboratedConditionalPlayers,0);
 a.equal(run([player],{...article,positiveSnippets:[
  {...article.positiveSnippets[0],sourceUrl:"https://fake-nfl.com/news/active"}]})
  .corroboratedConditionalPlayers,0);
 a.equal(run([player],{...article,positiveSnippets:[
  {...article.positiveSnippets[0],publishedAt:"2026-11-14T22:40:00Z"}]})
  .corroboratedConditionalPlayers,0);
});

t("NFL positive research evidence is per-player, per-game, never a verified platform ID",()=>{
 const x=run();
 a.equal(x.corroboratedConditionalPlayers,1);
 a.equal(x.conditionalGameDayMentions.length,1);
 a.equal(x.conditionalGameDayMentions[0].providerPlayerId,player.providerPlayerId);
 a.equal(x.conditionalGameDayMentions[0].officialGameId,game.officialGameId);
 a.equal(x.conditionalGameDayMentions[0].independentProviderGsisVerified,false);
 a.equal(x.conditionalGameDayMentions[0].bettingEligible,false);
 a.equal(x.approvedSelections,0);
 for(const bad of [
  {...player,gsisId:"inferred-only"},
  {...player,source:"guessed_name_only"},
  {...player,independentlyVerifiedProviderGSIS:true},
  {...player,officialGameId:"2026_12_IND_HOU"}
 ]){
  const z=run([bad]);
  a.equal(z.corroboratedConditionalPlayers,0);
  a.equal(z.conditionalGameDayMentions.length,0);
 }
});
t("NFL positives for another person or a past game cannot clear this player",()=>{
 for(const snippet of [
  "QB Other Player (knee) is officially active for Thursday's game.",
  "C.J. Stroud was active for last Thursday's game.",
  "C.J. Stroud is expected to be active for Thursday's game.",
  "C.J. Stroud is active next month, not tonight."
 ]){
  const r=run([player],{...article,positiveSnippets:[{
   ...article.positiveSnippets[0],snippet}]});
  a.equal(r.corroboratedConditionalPlayers,0,snippet);
 }
});
