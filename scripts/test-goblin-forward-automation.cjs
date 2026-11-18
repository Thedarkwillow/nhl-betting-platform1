"use strict";
const test=require("node:test"),a=require("node:assert/strict"),
 fs=require("node:fs");
const prod=fs.readFileSync(".github/workflows/private-nhl-goblin-forward.yml","utf8");
const publisher=fs.readFileSync(".github/workflows/publish-safe-research-progress.yml","utf8");
test("NHL Goblin automation follows original pregame freezes and grades existing results",()=>{
 a.match(prod,/Freeze actual-time NHL and NFL pregame Higher Lower research/);
 a.match(prod,/Private NHL shot and point opportunity evaluation/);
 a.match(prod,/concurrency:[\s\S]*private-goblin-first-git-pregame-research/);
 a.match(prod,/node scripts\/report-goblin-forward\.cjs/);
 a.match(prod,/git push -q origin HEAD:main/);
 a.match(prod,/Date\.parse\(r\.gameStartsAt\)-Date\.now\(\)<15\*60000/);
 a.match(prod,/outputs\/research\/goblin-future/);
 a.match(prod,/test\/goblin-opportunity-evidence\.test\.cjs/);
});
test("no new paid provider trigger, public player row export, or automatic wagers",()=>{
 a.doesNotMatch(prod,/ODDS_API_KEY|THE_ODDS_API_KEY|AUTO_WAGER|PLACE_BET/);
 a.doesNotMatch(prod,/playerName|public\/data\//);
 a.match(prod,/providerRequests:0,approvedLineups:0/);
 a.match(publisher,/Private NHL Goblin future-only opportunity research/);
});
