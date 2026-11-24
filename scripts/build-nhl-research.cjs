"use strict";
const fs=require("node:fs");
const {estimateCountProbabilities}=require("../src/prop-probabilities.cjs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const board=read("outputs/board-merged/prizepicks-nhl-latest.json");
const projections=read("outputs/projections/players.json");
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const mapMarket=m=>{
 const x=norm(m);
 if(["sog","shots on goal","shots"].includes(x))return "shotsOnGoal";
 if(["goals","goal"].includes(x))return "goals";
 if(["assists","assist"].includes(x))return "assists";
 if(["points","point"].includes(x))return "points";
 if(["blocked shots","blocks","blocked"].includes(x))return "blockedShots";
 if(["goalie saves","saves","save"].includes(x))return "saves";
 return null;
};
const byName=new Map(),byAbbrev=new Map();
for(const p of Object.values(projections.players)){
 const name=norm(p.name),team=norm(p.team);
 const fullKey=team+"|"+name;
 if(!byName.has(fullKey))byName.set(fullKey,[]);
 byName.get(fullKey).push(p);
 // NHL game logs abbreviate first names; match only when team and surname agree.
 const tokens=name.split(" ");
 if(tokens.length>=2){
  const initial=tokens[0][0],surname=tokens.slice(1).join(" ");
  const key=team+"|"+initial+"|"+surname;
  if(!byAbbrev.has(key))byAbbrev.set(key,[]);
  byAbbrev.get(key).push(p);
 }
}
function findPlayers(row){
 const team=norm(row.team),name=norm(row.player),tokens=name.split(" ");
 if(!team||tokens.length<2)return [];
 const exact=byName.get(team+"|"+name)||[];
 if(exact.length)return exact;
 const key=team+"|"+tokens[0][0]+"|"+tokens.slice(1).join(" ");
 return byAbbrev.get(key)||[];
}
const results=[],excluded={};
const now=Date.now(),maxBoardAgeHours=8;
const boardAgeHours=(now-Date.parse(board.generatedAt))/3600000;
const boardFresh=Number.isFinite(boardAgeHours)&&boardAgeHours>=0&&boardAgeHours<=maxBoardAgeHours;
const projectionAgeHours=(now-Date.parse(projections.builtAt))/3600000;
const projectionsFresh=Number.isFinite(projectionAgeHours)&&projectionAgeHours>=0&&projectionAgeHours<=48;
function skip(reason){excluded[reason]=(excluded[reason]||0)+1;}
for(const row of board.rows){
 if(!boardFresh){skip("stale_board");continue;}
 if(!projectionsFresh){skip("stale_projections");continue;}
 const rowAgeHours=(now-Date.parse(row.capturedAt))/3600000;
 if(!Number.isFinite(rowAgeHours)||rowAgeHours<0||rowAgeHours>maxBoardAgeHours){skip("stale_prop");continue;}
 if(row.isLive){skip("live");continue;}
 const tierLabel=norm(row.tier);
 const tier=["standard","goblin","demon"].includes(tierLabel)?tierLabel:null;
 if(!tier){skip("unknown_tier");continue;}
 if(row.period&&!["full game","game"].includes(norm(row.period))){skip("non_full_game");continue;}
 const field=mapMarket(row.market);
 if(!field){skip("unsupported_market");continue;}
 const matches=findPlayers(row);
 if(matches.length!==1){skip(matches.length?"ambiguous_player":"unmatched_player");continue;}
 const p=matches[0],proj=p.projections?.[field];
 if(!proj?.ready||!Number.isFinite(proj.estimate)){skip("insufficient_history");continue;}
 const line=Number(row.line);
 if(!Number.isFinite(line)){skip("invalid_line");continue;}
 const delta=Number((proj.estimate-line).toFixed(3));
 const probs=estimateCountProbabilities(proj.estimate,line);
 const probability=probs?probs[delta>0?"higher":"lower"]:null;
 // Ranking signal only: this is NOT a calibrated probability or verified hit rate.
 results.push({player:p.name,team:p.team,playerId:p.playerId,market:field,line,
  projection:proj.estimate,edge:delta,lean:delta>0?"Higher":delta<0?"Lower":"Neutral",
  observations:proj.observations,last5:proj.last5,last10:proj.last10,
  matchup:row.matchup||null,tier:row.tier,capturedAt:row.capturedAt,
  source:row.source,category:row.category,model:projections.model,
  probability,probabilities:probs,probabilityCalibrated:false,
  expectedValue:null,verified:false, payoutMultiplier:null, tierPayoutVerified:false});
}
results.sort((a,b)=>(b.probability??0)-(a.probability??0)||b.observations-a.observations);
const unique=results.filter((r,i)=>results.findIndex(x=>x.playerId===r.playerId&&x.market===r.market&&x.line===r.line)===i);
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const lineups=optimize(unique);
const output={generatedAt:new Date().toISOString(),boardGeneratedAt:board.generatedAt,
 model:projections.model,method:"Poisson-v0 count model using weighted-form projection; uncalibrated research estimate",
 warning:"Poisson probabilities are exploratory and NOT historically calibrated. Props are not independently verified as current. Goblin and Demon tiers are analyzed but excluded from lineups pending verified payout terms. No payout-adjusted EV or complete correlation optimization. Lineups are constrained research rankings based on uncalibrated individual probabilities, not validated joint probabilities or recommended wagers.",
 boardFresh,boardAgeHours:Number.isFinite(boardAgeHours)?Number(boardAgeHours.toFixed(2)):null,projectionsFresh,projectionAgeHours:Number.isFinite(projectionAgeHours)?Number(projectionAgeHours.toFixed(2)):null,boardCoverageComplete:board.coverageComplete,boardCategoriesComplete:board.completeCategories,
 boardCategoriesTotal:board.discoveredCategories,totalRows:board.rows.length,
 matchedRows:results.length,uniqueMatchedProps:unique.length,excluded,
 rankedProps:unique,lineups};
fs.mkdirSync(path.join(root,"outputs/research"),{recursive:true});
fs.writeFileSync(path.join(root,"outputs/research/nhl-latest.json"),JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({matchedRows:results.length,uniqueMatchedProps:unique.length,excluded,boardCoverageComplete:board.coverageComplete}));
