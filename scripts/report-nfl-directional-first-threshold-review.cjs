"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),source=path.join(root,"outputs/nfl/backtests/pregame-forecast-proof-latest.json");
function main(){const original=JSON.parse(fs.readFileSync(source,"utf8"));const r=require("../src/nfl-directional-first-threshold-review.cjs").audit(original);
 r.wholeGameDirectionalBiasResearch=require("../src/nfl-directional-bias-cluster-audit.cjs").audit(original);
 if(r.wholeGameDirectionalBiasResearch.status!=="descriptive_first_git_game_cluster_diagnostics")throw Error("NFL cluster directional evidence unreconciled");
 const out=path.join(root,"outputs/nfl/backtests/directional-first-threshold-review-latest.json");fs.writeFileSync(out,JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({kind:r.kind,decided:r.overall.decided,correct:r.overall.correct,alwaysLowerRate:r.overall.lowerBaseline,
  marketAudits:Object.keys(r.byMarket).length,productionApproved:false}));return r;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
