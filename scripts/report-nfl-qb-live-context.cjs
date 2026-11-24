"use strict";
// Read only independently proven first-Git snapshots. No mutable latest
// pointers, invented starters, or extra metered provider requests.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {context}=require("../src/nfl-qb-live-context-v1.cjs"),{dataset}=require("./build-nfl-partner-board-research.cjs"),{kickoff}=require("./collect-nfl-nws-weather.cjs");
const {firstGitOfficialRosters}=require("./report-nfl-live-prop-readiness.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const names=Object.fromEntries("ARI:Arizona Cardinals|ATL:Atlanta Falcons|BAL:Baltimore Ravens|BUF:Buffalo Bills|CAR:Carolina Panthers|CHI:Chicago Bears|CIN:Cincinnati Bengals|CLE:Cleveland Browns|DAL:Dallas Cowboys|DEN:Denver Broncos|DET:Detroit Lions|GB:Green Bay Packers|HOU:Houston Texans|IND:Indianapolis Colts|JAX:Jacksonville Jaguars|KC:Kansas City Chiefs|LV:Las Vegas Raiders|LAC:Los Angeles Chargers|LA:Los Angeles Rams|MIA:Miami Dolphins|MIN:Minnesota Vikings|NE:New England Patriots|NO:New Orleans Saints|NYG:New York Giants|NYJ:New York Jets|PHI:Philadelphia Eagles|PIT:Pittsburgh Steelers|SEA:Seattle Seahawks|SF:San Francisco 49ers|TB:Tampa Bay Buccaneers|TEN:Tennessee Titans|WAS:Washington Commanders".split("|").map(x=>x.split(":")));
const git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:32*1024*1024}).trim();
function archives(dir,pattern,now){
 try{return fs.readdirSync(path.join(root,dir)).filter(n=>pattern.test(n)).sort().reverse().slice(0,30).flatMap(n=>{
  try{const p=dir+"/"+n,commits=git(["log","--format=%H","HEAD","--",p]).split("\n").filter(Boolean);if(commits.length!==1)return [];
   const firstGitAt=git(["show","-s","--format=%cI",commits[0]]),doc=JSON.parse(git(["show",commits[0]+":"+p]));
   if(dt(firstGitAt)>dt(now)||!Number.isFinite(dt(firstGitAt))||JSON.stringify(doc)!==JSON.stringify(read(p)))return [];
   return [{doc,firstGitAt}];}catch{return [];}
 });}catch{return [];}
}
function main(){
 const now=new Date().toISOString(),schedule=dataset(2026,"schedule");
 let preview,injury;try{preview=read("outputs/nfl/independent-source/research-preview-latest.json");}catch{}try{injury=read("outputs/nfl/availability/official-report-latest.json");}catch{}
 const starters=archives("outputs/nfl/availability/official-starting-lineup-snapshots",/^\d{8}T\d{6}Z__[A-Z0-9_]+\.json$/,now).flatMap(({doc,firstGitAt})=>doc.kind==="nfl_official_explicit_starting_lineup_v1"?[{...doc,firstGitAt,firstGitVerified:true}]:[]);
 const weather=archives("outputs/nfl/research/weather",/^20.*\.json$/,now).flatMap(({doc,firstGitAt})=>doc.kind==="nfl_nws_pregame_forecast_archive_v1"?(doc.rows||[]).map(x=>({...x,firstGitAt,firstGitVerified:true})):[]);
 const quotes=archives("outputs/sportsbooks/bounded-live",/^capture-receipt-\d{8}T\d{9}Z\.json$/,now).flatMap(({doc,firstGitAt})=>(doc.gameMarkets||[]).flatMap(q=>{
  const found=schedule.filter(g=>g.game_type==="REG"&&names[g.home_team]===q.homeTeam&&names[g.away_team]===q.awayTeam&&dt(kickoff(g))===dt(q.commenceTime));
  if(found.length!==1)return [];const g=found[0];return [[g.home_team,g.away_team,q.homeSpread],[g.away_team,g.home_team,q.awaySpread]].map(([team,opponent,teamSpread])=>({...q,team,opponent,teamSpread,gameId:g.game_id,eventStartsAt:kickoff(g),firstGitAt,firstGitVerified:true}));
 }));
 const roster=firstGitOfficialRosters(now),seen=new Set(),rows=[];
 for(const p of preview?.rows||[]){
  if(p.market!=="passing_attempts"||seen.has(p.gameId+"|"+p.historicalPlayerId)||dt(p.eventStartsAt)<=dt(now)+900000)continue;
  seen.add(p.gameId+"|"+p.historicalPlayerId);const g=schedule.find(x=>x.game_id===p.gameId&&dt(kickoff(x))===dt(p.eventStartsAt));if(!g)continue;
  const newest=a=>a.sort((x,y)=>dt(y.observedAt)-dt(x.observedAt)),wx=newest(weather.filter(x=>x.gameId===p.gameId)).slice(0,1);
  const q=[];for(const book of new Set(quotes.map(x=>x.book))){const x=newest(quotes.filter(x=>x.book===book&&x.gameId===p.gameId&&x.team===p.team))[0];if(x)q.push(x);}
  const s=newest(starters.filter(x=>x.gameId===p.gameId&&x.team===p.team)).slice(0,1);
  rows.push({gameId:p.gameId,team:p.team,historicalPlayerId:p.historicalPlayerId,...context({...p,season:Number(g.season),week:Number(g.week)},{now,roster:roster.find(x=>x.gameId===p.gameId),injury,starters:s,quotes:q,weather:wx})});
 }
 const out={kind:"nfl_qb_live_context_private_audit_v1",generatedAt:now,rows,coverage:{qbs:rows.length,startingQB:rows.filter(x=>x.startingQBVerified).length,offensiveLine:rows.filter(x=>x.offensiveLineStartingFiveVerified).length,spreadTotal:rows.filter(x=>x.market).length,weather:rows.filter(x=>x.weather).length},modelPromoted:false,calibrated:false,sourceCalls:0};
 const dest=path.join(root,"outputs/nfl/research/qb-live-context-latest.json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+"\n");console.log(JSON.stringify({coverage:out.coverage,modelPromoted:false}));return out;
}
if(require.main===module)main();
module.exports={main,archives};
