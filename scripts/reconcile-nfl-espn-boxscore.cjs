"use strict";
/**
 * Independent ESPN final NFL box-score comparison for event-derived totals.
 * ESPN is a secondary published final stat source, NOT the NFL Game Book
 * and NOT PrizePicks/Underdog settlement. Only validated matches count.
 * No sportsbook lines or wagers. Never use postgame data as a pregame feature.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const ROOT=path.resolve(__dirname,"..");
const YEARS=[2025,2026];
function load(root,year,dataset){
 const p=path.join(root,"outputs/nfl/history",String(year),dataset+".json.gz");
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
 if(d.sport!=="NFL"||d.dataset!==dataset||d.recordCount!==d.rows?.length)
  throw Error("Invalid nflverse archived "+year+"/"+dataset);
 return d.rows;
}
function asID(v){if(v==null)return null;const s=String(v).trim();return /^\d+$/.test(s)?String(Number(s)):null;}
function safeNum(s){if(typeof s==="number"&&Number.isFinite(s))return s;
 if(typeof s==="string"&&/^-?\d+(?:\.\d+)?$/.test(s.trim()))return Number(s);
 return null;}
function offerGames(schedule,year,limit=3){
 return schedule.filter(g=>g.season===year&&g.game_type==="REG"&&
  Number.isInteger(Number(g.week))&&Number(g.week)>=1&&Number(g.week)<=8&&
  asID(g.espn)&&typeof g.game_id==="string"&&
  safeNum(g.home_score)!==null&&safeNum(g.away_score)!==null)
 .sort((a,b)=>Number(a.week)-Number(b.week)||a.game_id.localeCompare(b.game_id)).slice(0,limit);
}
function derive(events){
 const result=new Map(),seen=new Set();
 const make=(id)=>{if(!result.has(id))result.set(id,{rushing_attempts:0,rushing_yards:0,
  longest_rush:null,receptions:0,receiving_yards:0,longest_reception:null,
  punt_attempts:0,punt_gross_yards:0,longest_gross_punt:null,punt_inside_20:0});return result.get(id);};
 for(const p of events){
  if(p.play_id==null||!p.game_id)continue;
  const id=p.game_id+"|"+p.play_id;
  if(seen.has(id))throw Error("Duplicate game/play identity");
  seen.add(id);
  if(p.play_type==="run"&&Number(p.rush_attempt)===1&&typeof p.rusher_player_id==="string"){
   const v=make(p.rusher_player_id),yards=safeNum(p.rushing_yards);
   if(yards!==null){v.rushing_attempts++;v.rushing_yards+=yards;
    v.longest_rush=Math.max(v.longest_rush??yards,yards);}
  }
  if(p.play_type==="pass"&&Number(p.complete_pass)===1&&typeof p.receiver_player_id==="string"){
   const v=make(p.receiver_player_id),yards=safeNum(p.receiving_yards);
   if(yards!==null){v.receptions++;v.receiving_yards+=yards;
    v.longest_reception=Math.max(v.longest_reception??yards,yards);}
  }
  if(p.play_type==="punt"&&Number(p.punt_attempt)===1&&
     Number(p.punt_blocked)!==1&&typeof p.punter_player_id==="string"){
   const v=make(p.punter_player_id),yards=safeNum(p.punt_yards);
   if(yards!==null){v.punt_attempts++;v.punt_gross_yards+=yards;
    v.longest_gross_punt=Math.max(v.longest_gross_punt??yards,yards);}
   if(Number(p.punt_inside_twenty)===1)v.punt_inside_20++;
  }
 }
 return result;
}
const ESPN_ALIASES=Object.freeze({
 rushing:{rushing_attempts:["CAR","ATT"],rushing_yards:["YDS","YARDS"],
  longest_rush:["LONG","LG"]},
 receiving:{receptions:["REC","RECS"],receiving_yards:["YDS","YARDS"],
  longest_reception:["LONG","LG"]},
 punting:{punt_attempts:["PUNTS","NO","ATT"],punt_gross_yards:["YDS","YARDS"],
  longest_gross_punt:["LONG","LG"],punt_inside_20:["IN20","IN 20","I20","IN-20"]},
});
function espnMetrics(summary){
 const list=[];
 for(const side of summary?.boxscore?.players||[]){
  const team=side.team?.abbreviation;
  if(!team)continue;
  for(const block of side.statistics||[]){
   const category=String(block.name||"").toLowerCase();
   const alias=ESPN_ALIASES[category];if(!alias)continue;
   const labels=(block.labels||[]).map(x=>String(x).toUpperCase().replace(/\s+/g," ").trim());
   for(const athlete of block.athletes||[]){
    const espnId=asID(athlete.athlete?.id||athlete.id);
    if(!espnId)continue;
    const stats={};
    for(const [market,keys] of Object.entries(alias)){
     const col=labels.findIndex(x=>keys.includes(x));
     if(col>=0){const v=safeNum(athlete.stats?.[col]);if(v!==null)stats[market]=v;}
    }
    if(Object.keys(stats).length)list.push({team,espnId,category,stats});
   }
  }
 }
 return list;
}
function reconcileGame({game,specialty,roster,summary}){
 const complete=summary?.header?.competitions?.[0]?.status?.type?.completed===true||
   summary?.header?.competitions?.[0]?.status?.type?.name==="STATUS_FINAL"||
   summary?.header?.competitions?.[0]?.status?.type?.state==="post";
 if(!complete)throw Error("ESPN did not confirm final match "+game.game_id);
 const byId=derive(specialty.filter(x=>x.game_id===game.game_id));
 const lookup=new Map();
 for(const r of roster.filter(x=>Number(x.season)===game.season&&
  Number(x.week)===Number(game.week)&&
  [game.home_team,game.away_team].includes(x.team))){
  const gsis=String(r.gsis_id||""),espn=asID(r.espn_id);
  if(!gsis||!espn)continue;
  const key=r.team+"|"+espn;
  if(lookup.has(key)&&lookup.get(key)!==gsis)throw Error("Conflicting roster cross-ID "+key);
  lookup.set(key,gsis);
 }
 const report={gameId:game.game_id,espnId:asID(game.espn),week:game.week,
  boxscoreRows:0,compared:0,matched:0,disagreed:0,
  missingRosterCrossId:0,missingEventIdentity:0,unknownComparisonColumns:0,
  byMarket:{},mismatchTypes:{}};
 for(const row of espnMetrics(summary)){
  report.boxscoreRows++;
  const gsis=lookup.get(row.team+"|"+row.espnId);
  if(!gsis){report.missingRosterCrossId++;continue;}
  const actual=byId.get(gsis);
  if(!actual){report.missingEventIdentity++;continue;}
  for(const [market,truth] of Object.entries(row.stats)){
   const pred=actual[market];
   if(pred===null||!Number.isFinite(pred)){report.unknownComparisonColumns++;continue;}
   const ok=Math.abs(pred-truth)<0.0001;
   const r=report.byMarket[market]||(report.byMarket[market]={compared:0,matched:0,disagreed:0});
   report.compared++;r.compared++;
   if(ok){report.matched++;r.matched++;}
   else {report.disagreed++;r.disagreed++;report.mismatchTypes[market]=(report.mismatchTypes[market]||0)+1;}
  }
 }
 return report;
}
async function fetchSummary(espnId,{fetcher=fetch}={}){
 const uri="https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event="+encodeURIComponent(espnId);
 const response=await fetcher(uri,{headers:{"User-Agent":"NFL-Research-Audit/1.0"},
  signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("ESPN final boxscore request failed HTTP "+response.status);
 const data=await response.json();
 if(!data?.boxscore?.players)throw Error("ESPN summary without final boxscore player stats");
 return data;
}
async function run({root=ROOT,fetcher=fetch,limitPerSeason=3}={}){
 const games=[],skipped=[];
 for(const year of YEARS){
  const s=load(root,year,"schedule"),ev=load(root,year,"pbp_specialty_events"),
   roster=load(root,year,"weekly_rosters");
  for(const game of offerGames(s,year,limitPerSeason)){
   try{
    const summary=await fetchSummary(game.espn,{fetcher});
    games.push(reconcileGame({game,specialty:ev,roster,summary}));
   }catch(e){skipped.push({season:year,gameId:game.game_id,
    reason:String(e.message||e).slice(0,150)});}
  }
 }
 const markets={};
 for(const game of games)for(const [name,v] of Object.entries(game.byMarket)){
  const r=markets[name]||(markets[name]={compared:0,matched:0,disagreed:0});
  for(const key of ["compared","matched","disagreed"])r[key]+=v[key];
 }
 const total=Object.values(markets).reduce((s,r)=>s+r.compared,0);
 return {schemaVersion:1,kind:"nfl_espn_secondary_final_boxscore_crosscheck_v1",
  generatedAt:new Date().toISOString(),seasons:YEARS,
  nflOfficialGamebookIndependentlyReconciled:false,
  ESPNSecondaryBoxscoreCrosscheckOnly:true,
  originalPrizePicksOrUnderdogSettlementVerified:false,
  noSportsbookLineOrFrozenPickMatched:true,autoPickEligible:false,
  totalGamesChecked:games.length,gamesAttempted:YEARS.length*limitPerSeason,
  totalPlayerMarketComparisons:total,anyDisagreements:Object.values(markets).some(x=>x.disagreed>0),
  byMarket:markets,perGame:games,skipped,
  limitations:"Comparison against ESPN final box scores only; field/ID mismatches quarantined, source-specific NFL gamebook grading and PrizePicks/Underdog void rules not yet validated."};
}
async function main(){
 const result=await run();
 const target=path.join(ROOT,"outputs/nfl/research/secondary-boxscore-reconciliation-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({kind:result.kind,games:result.totalGamesChecked,
  compared:result.totalPlayerMarketComparisons,byMarket:result.byMarket,
  skipped:result.skipped.length,officialNFLGamebookVerified:false}));
 if(result.totalGamesChecked<2||result.totalPlayerMarketComparisons<5)
  throw Error("Too few verified independent final ESPN comparisons");
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={asID,safeNum,derive,espnMetrics,reconcileGame,offerGames,run,fetchSummary};
