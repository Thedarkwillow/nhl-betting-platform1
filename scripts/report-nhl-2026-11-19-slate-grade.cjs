"use strict";
/* Build complete NHL per-game and per-tier original-frozen result counts
 * entirely from archived official finals and first-Git ledger. Zero API calls.
 */
const fs=require("node:fs"),path=require("node:path");
const {audit}=require("../src/nhl-slate-graded-summary.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function main(){
 const day=process.env.NHL_GRADE_SLATE_DATE||"2026-11-19";
 if(!/^2026-11-19$/.test(day))throw Error("Expected requested original Nov 19 slate");
 const result=audit({date:day,stats:read("outputs/player-stats/"+day+".json"),
   schedule:read("outputs/official-nhl/season-schedules/2026-27.json"),
   ledger:read("outputs/research/registry/nhl-precommitted-ledger-latest.json")});
 if(result.status!=="all_games_official_final_original_frozen_prop_research_only"||
    !result.all12GamesVerified||result.officialGamesTotal!==12)
  throw Error("Do not archive incomplete or unproven Nov 19 NHL slate");
 const out="outputs/health/nhl-2026-11-19-all-games-graded.json";
 fs.mkdirSync(path.dirname(path.join(root,out)),{recursive:true});
 fs.writeFileSync(path.join(root,out),JSON.stringify({...result,
   generatedAt:new Date().toISOString()},null,2)+"\n");
 console.log(JSON.stringify({kind:result.kind,slateDate:result.slateDate,
   officialGames:result.officialGamesTotal,registered:result.all.registered,
   decided:result.all.decided,wins:result.all.correct,losses:result.all.incorrect,
   pushes:result.all.push,pending:result.all.pending,
   tiers:Object.fromEntries(Object.entries(result.tiers).map(([t,x])=>
     [t,{decided:x.decided,wins:x.correct,losses:x.incorrect,pending:x.pending}])),
   approved:false,providerRequests:0,output:out}));
 return result;
}
if(require.main===module)main();
module.exports={main};
