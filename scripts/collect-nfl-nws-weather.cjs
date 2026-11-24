"use strict";
const fs=require("node:fs"),path=require("node:path");
const {dataset}=require("./build-nfl-partner-board-research.cjs"),{collect}=require("../src/nfl-nws-pregame-weather-v1.cjs");
const registry=require("../config/nfl-weather-venue-registry-v1.json");
const ROOT=path.resolve(__dirname,".."),dt=x=>typeof x==="string"?Date.parse(x):NaN;
// nflverse kickoff clock is Eastern. Match a UTC instant to the source
// Eastern calendar and clock; reject missing or ambiguous time.
function kickoff(game){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(game.gameday)||!/^\d{2}:\d{2}$/.test(game.gametime))return null;
 const local=game.gameday+"T"+game.gametime;
 const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const candidates=["-04:00","-05:00"].map(offset=>new Date(local+offset));
 const valid=candidates.filter(d=>{if(!Number.isFinite(+d))return false;const x=Object.fromEntries(fmt.formatToParts(d).map(x=>[x.type,x.value]));return x.year+"-"+x.month+"-"+x.day+"T"+x.hour+":"+x.minute===local;});
 return valid.length===1?valid[0].toISOString():null;
}
async function main(){
 const now=new Date().toISOString(),rows=[],status={eligible:0,unmapped:0,failed:0,collected:0};
 const schedule=dataset(2026,"schedule");
 for(const g of schedule){
  if(g.game_type!=="REG"||Number.isFinite(g.home_score)||Number.isFinite(g.away_score)||g.roof!=="outdoors")continue;
  const eventStartsAt=kickoff(g);
  if(!eventStartsAt||dt(eventStartsAt)-dt(now)<=900000||dt(eventStartsAt)-dt(now)>6*86400000)continue;
  status.eligible++;
  const venues=registry.venues.filter(x=>x.stadiumId===g.stadium_id&&x.stadiumName===g.stadium&&x.verified===true);
  if(venues.length!==1){status.unmapped++;continue;}
  try{
   const v=await collect({stadiumId:g.stadium_id,stadiumName:g.stadium,team:g.home_team,opponent:g.away_team,eventStartsAt,roof:g.roof},venues[0]);
   if(!v){status.failed++;continue;}
   rows.push({...v,gameId:g.game_id});status.collected++;
  }catch{status.failed++;}
 }
 const out={kind:"nfl_nws_pregame_forecast_archive_v1",generatedAt:now,coverage:status,rows,allVenuesVerified:false,modelPromoted:false,calibrated:false};
 const f=path.join(ROOT,"outputs/nfl/research/weather",now.replace(/[:.]/g,"-")+".json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({kind:out.kind,coverage:status,modelPromoted:false}));
}
if(require.main===module)main().catch(()=>{console.error("Weather collection unavailable");process.exitCode=1;});
module.exports={kickoff,main};
