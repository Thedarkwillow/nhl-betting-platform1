"use strict";
const test=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const y=fs.readFileSync(".github/workflows/private-position-matchup-v2.yml","utf8");
test("scheduled NHL NFL positional evaluation verifies game clusters before private archival",()=>{
 a.match(y,/test\/paired-historical-game-projection\.test\.cjs/);
 a.match(y,/node src\/nfl-position-opportunity-matchup\.cjs/);
 a.match(y,/g\.pairedGameUncertainty\?\.modelPromoted!==false/);
 a.match(y,/g\.pairedGameUncertainty\?\.independentlyValidatedFutureOriginalLines!==false/);
 a.match(y,/git add -f outputs\/health\/nhl-position-rate-matchup-v2-latest\.json/);
 a.match(y,/outputs\/nfl\/backtests\/position-opportunity-matchup-latest\.json/);
 a.doesNotMatch(y,/UNDERDOG_API_KEY|PRIZEPICKS_API_KEY|ODDS_API_KEY/);
});
