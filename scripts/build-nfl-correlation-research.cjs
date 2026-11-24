"use strict";
/**
 * Research-only same-player and two-athlete NFL *realized* stat dependence.
 * Do not plug raw Pearson coefficients into 2–6 pick probabilities.
 * Uses 2024–2025 development and 2026 descriptive comparison, not
 * originally offered PrizePicks/Underdog lines or prespecified roster.
 * Cohort is conditional on recorded player-game appearances.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const ROOT=path.resolve(__dirname,"..");
const MIN_DEV_PAIRS=12,MIN_TEST_PAIRS=5,SHRINK_N=30;
const TYPES=Object.freeze([
 {id:"qb_pass_rush_yards",mode:"same",posA:["QB"],a:"passing_yards",b:"rushing_yards"},
 {id:"qb_pass_tds_rush_yards",mode:"same",posA:["QB"],a:"passing_tds",b:"rushing_yards"},
 {id:"rb_rush_receive_yards",mode:"same",posA:["RB","FB"],a:"rushing_yards",b:"receiving_yards"},
 {id:"wr_rush_receive_yards",mode:"same",posA:["WR"],a:"rushing_yards",b:"receiving_yards"},
 {id:"te_receiving_yards_tds",mode:"same",posA:["TE"],a:"receiving_yards",b:"receiving_tds"},
 {id:"qb_wr_pass_receive_yards",mode:"team",posA:["QB"],posB:["WR"],a:"passing_yards",b:"receiving_yards"},
 {id:"qb_te_pass_receive_yards",mode:"team",posA:["QB"],posB:["TE"],a:"passing_yards",b:"receiving_yards"},
 {id:"rb_wr_rush_receive_yards",mode:"team",posA:["RB"],posB:["WR"],a:"rushing_yards",b:"receiving_yards"},
]);
const valid=x=>typeof x==="number"&&Number.isFinite(x);
function standardize(rows){
 const games=new Map(),seen=new Set(),counts={raw:rows.length,accepted:0,missing:0,duplicates:0};
 for(const r of rows){
  const y=Number(r.season),w=Number(r.week);
  if(![2024,2025,2026].includes(y)||!Number.isInteger(w)||w<1||w>18||
   r.season_type!=="REG"||typeof r.game_id!=="string"||
   typeof r.team!=="string"||typeof r.player_id!=="string"||
   typeof r.position!=="string"){counts.missing++;continue;}
  const k=y+"|"+r.game_id+"|"+r.player_id;
  if(seen.has(k)){counts.duplicates++;throw Error("Duplicate historical NFL player-game ID "+k);}
  seen.add(k);
  const id=y+"|"+r.game_id;
  if(!games.has(id))games.set(id,[]);
  games.get(id).push({year:y,gameId:r.game_id,team:r.team,
   identity:r.player_id,position:r.position.toUpperCase(),
   values:Object.fromEntries(["passing_yards","rushing_yards",
    "receiving_yards","passing_tds","rushing_tds","receiving_tds"]
    .map(name=>[name,valid(r[name])?r[name]:null]))});
  counts.accepted++;
 }
 return {games,counts};
}
function pearson(pairs){
 if(pairs.length<2)return null;
 const n=pairs.length,ax=pairs.reduce((s,p)=>s+p[0],0)/n,
  ay=pairs.reduce((s,p)=>s+p[1],0)/n;
 let aa=0,bb=0,ab=0;
 for(const [a,b] of pairs){aa+=(a-ax)**2;bb+=(b-ay)**2;ab+=(a-ax)*(b-ay);}
 if(aa<=1e-9||bb<=1e-9)return null;
 return Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb)));
}
function collectPairs(games){
 const records=new Map();
 for(const spec of TYPES)records.set(spec.id,new Map());
 for(const players of games.values()){
  const year=players[0]?.year;
  for(const spec of TYPES){
   const ids=records.get(spec.id);
   for(const a of players.filter(p=>spec.posA.includes(p.position)&&valid(p.values[spec.a]))){
    const targets=spec.mode==="same"?[a]:
     players.filter(b=>spec.posB.includes(b.position)&&
      b.team===a.team&&b.identity!==a.identity);
    for(const b of targets){
     if(!valid(b.values[spec.b]))continue;
     const key=spec.id+"|"+a.identity+"|"+(spec.mode==="same"?
      a.identity:b.identity);
     if(!ids.has(key))ids.set(key,{yearPoints:{2024:[],2025:[],2026:[]}});
     ids.get(key).yearPoints[year].push([a.values[spec.a],b.values[spec.b]]);
    }
   }
  }
 }
 return records;
}
const round=x=>x===null?null:Number(x.toFixed(5));
function summarize(records){
 const groups=[];
 for(const spec of TYPES){
  const pairs=records.get(spec.id);
  let enoughDev=0,enough2026=0,both=0,signStable=0,
    tooFew=0,zeroVariance=0;
  const stats=[];
  for(const {yearPoints} of pairs.values()){
   const dev=[...yearPoints[2024],...yearPoints[2025]],test=yearPoints[2026];
   if(dev.length<MIN_DEV_PAIRS){tooFew++;continue;}
   const c=pearson(dev);
   if(c===null){zeroVariance++;continue;}
   enoughDev++;
   const testCorr=test.length>=MIN_TEST_PAIRS?pearson(test):null;
   if(testCorr!==null){
    enough2026++;both++;
    if(Math.sign(c)===Math.sign(testCorr))signStable++;
   }
   const shrunk=c*dev.length/(dev.length+SHRINK_N);
   stats.push({devN:dev.length,devRaw:c,devShrunk:shrunk,
    testN:test.length,testCorr});
  }
  const mean=fn=>stats.length?round(stats.reduce((s,x)=>s+fn(x),0)/stats.length):null;
  groups.push({id:spec.id,mode:spec.mode,devPairCandidates:pairs.size,
   enough2024to2025Training:enoughDev,has2026Comparison:enough2026,
   signStableAcrossDev2026:signStable,
   devPearsonMean:mean(x=>x.devRaw),
   shrinkMean:mean(x=>x.devShrunk),
   total2024to2025Observations:stats.reduce((s,x)=>s+x.devN,0),
   total2026PairedObservations:stats.reduce((s,x)=>s+x.testN,0),
   tooFewObservations:tooFew,zeroVarianceRejected:zeroVariance,
   playerSpecificCorrForFutureMatchesValidated:false,
   perPairJointDistributionCalibrated:false});
 }
 return groups;
}
function audit(rows){
 const data=standardize(rows),groups=summarize(collectPairs(data.games));
 return {schemaVersion:1,kind:"nfl_empirical_pair_dependence_retro_only_v1",
  generatedAt:new Date().toISOString(),devSeasons:[2024,2025],
  comparisonSeason:2026,
  minimumDevPairs:MIN_DEV_PAIRS,minimum2026Pairs:MIN_TEST_PAIRS,
  shrinkagePriorObservations:SHRINK_N,
  asOfHistoricalPredictionsFrozen:false,
  observedPlayerGameConditioningSelectionBias:true,
  opponentAndGameScriptConditioningNotCalibrated:true,
  teammateCovarianceMayDependOnAvailability:true,
  futureLineupCorrelationValidated:false,
  savedOfficialPlatformOriginalLines:false,
  noModelPromotion:true,autoPickEligible:false,
  counts:data.counts,groups};
}
function readPlayerWeekly(root=ROOT){
 const out=[];
 for(const year of [2024,2025,2026]){
  const file=path.join(root,"outputs/nfl/history",String(year),"player_weekly.json.gz");
  const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  if(doc.dataset!=="player_weekly"||doc.recordCount!==doc.rows?.length||
    doc.retrospectivePlayerStatsNotPregameLines!==true)
   throw Error("Missing nflverse weekly history provenance for correlation "+year);
  out.push(...doc.rows);
 }
 return out;
}
function main(){
 const r=audit(readPlayerWeekly()),dest=path.join(ROOT,"outputs/nfl/research/correlation-dependence-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({kind:r.kind,
  validPairs:r.groups.reduce((s,x)=>s+x.enough2024to2025Training,0),
  paired2026:r.groups.reduce((s,x)=>s+x.has2026Comparison,0),
  groups:r.groups.map(g=>({id:g.id,devPairs:g.enough2024to2025Training,
   testPairs:g.has2026Comparison,signStable:g.signStableAcrossDev2026,
   meanShrunk:g.shrinkMean})),lineupCorrelationNotValidated:true}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={MIN_DEV_PAIRS,MIN_TEST_PAIRS,TYPES,standardize,pearson,collectPairs,summarize,audit,readPlayerWeekly};
