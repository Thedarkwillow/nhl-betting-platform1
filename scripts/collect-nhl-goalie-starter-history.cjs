"use strict";
// Independent official game-level goalie stats. Never infer starts from TOI.
const fs=require("node:fs"),path=require("node:path"),{load}=require("./report-nhl-position-multiseason-v3.cjs"),{uniqueRows,scheduleIndex,scheduledOpponent}=require("../src/nhl-fixed-ensemble-research.cjs");
const root=path.resolve(__dirname,".."),dest=path.join(root,"outputs/nhl-usage/goalie-starts-rest-latest.json"),canonical=x=>({SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD",VEG:"VGK",UTAH:"UTA"}[x]||x),key=(g,p)=>g+"|"+p;
function reconcile(data,history,schedule,usage=null){
 const idx=scheduleIndex(schedule),own=new Map(uniqueRows(history).filter(x=>x.type==="goalie").map(x=>[key(x.gameId,x.playerId),x])),seen=new Set(),players={},counts={received:data.length,matched:0,starts:0,relief:0,unmatched:0,conflicts:0,corrected:0,conflictReasons:{},samples:[]};
 for(const x of data){const k=key(x.gameId,x.playerId);if(seen.has(k))throw Error("duplicate game-level goalie identity");seen.add(k);const g=own.get(k);
 if(!g){counts.unmatched++;continue;}
 const club=x.teamAbbrevs??x.teamAbbrev,toi=x.timeOnIce,checks={schedule:!!scheduledOpponent(g,idx),appearance:x.gamesPlayed===1,starter:[0,1].includes(x.gamesStarted),team:canonical(club)===canonical(g.team),saves:x.saves===g.saves,toi:toi===g.timeOnIceSeconds,date:!x.gameDate||x.gameDate===g.gameDate,shots:Number.isInteger(x.saves)&&x.saves>=0&&Number.isInteger(x.shotsAgainst)&&x.shotsAgainst>=x.saves&&(!Number.isInteger(g.shotsAgainst)||g.shotsAgainst===x.shotsAgainst)};
 const failed=Object.keys(checks).filter(k=>!checks[k]);let correction=null;
 // Only accept a correction if an independently archived official final boxscore agrees with REST in every relevant field, while historical identity and TOI remain exact.
 if(failed.length&&failed.every(k=>k==='saves'||k==='shots')&&usage?.source==='official_NHL_final_gamecenter_boxscore'){
 const a=(usage.players?.[String(g.playerId)]||[]).filter(z=>z.gameId===g.gameId&&z.playerId===g.playerId&&z.gameDate===g.gameDate&&z.team===g.team&&z.type==='goalie'&&z.provenance===usage.source&&z.timeOnIceSeconds===g.timeOnIceSeconds&&z.saves===x.saves&&z.shotsAgainst===x.shotsAgainst&&z.started===(x.gamesStarted===1));
 if(a.length===1&&Number.isInteger(x.saves)&&x.saves>=0&&Number.isInteger(x.shotsAgainst)&&x.shotsAgainst>=x.saves&&Number.isInteger(g.saves)&&Number.isInteger(g.shotsAgainst)){correction={oldSaves:g.saves,oldShotsAgainst:g.shotsAgainst,confirmedBy:'official_NHL_final_gamecenter_boxscore',restAndFinalBoxscoreAgree:true};counts.corrected++;}}
 if(failed.length&&!correction){counts.conflicts++;for(const k of failed)counts.conflictReasons[k]=(counts.conflictReasons[k]||0)+1;if(counts.samples.length<3)counts.samples.push({failed,raw:{gameId:x.gameId,playerId:x.playerId,teamAbbrevs:x.teamAbbrevs,teamAbbrev:x.teamAbbrev,gamesPlayed:x.gamesPlayed,gamesStarted:x.gamesStarted,timeOnIce:x.timeOnIce,saves:x.saves,shotsAgainst:x.shotsAgainst,gameDate:x.gameDate,keys:Object.keys(x)},history:{team:g.team,timeOnIceSeconds:g.timeOnIceSeconds,saves:g.saves,shotsAgainst:g.shotsAgainst,gameDate:g.gameDate}});continue;}
 const row={gameId:g.gameId,playerId:g.playerId,gameDate:g.gameDate,team:g.team,type:"goalie",timeOnIceSeconds:g.timeOnIceSeconds,saves:correction?x.saves:g.saves,shotsAgainst:x.shotsAgainst,started:x.gamesStarted===1,...(correction?{correction}:{}),provenance:"official_NHL_stats_rest_goalie_summary_exact_game"};
 (players[g.playerId]??=[]).push(row);counts.matched++;counts.starts+=Number(row.started);counts.relief+=Number(!row.started);
 }
 return {players,counts};
}
async function collect(season){
 const rows=[];let total=null;for(let start=0;start<10000;start+=100){
 const u=new URL("https://api.nhle.com/stats/rest/en/goalie/summary");for(const [k,v] of Object.entries({isGame:"true",isAggregate:"false",start:String(start),limit:"100",sort:JSON.stringify([{property:"gameId",direction:"ASC"},{property:"playerId",direction:"ASC"}]),cayenneExp:"seasonId="+season+" and gameTypeId=2"}))u.searchParams.set(k,v);
 let d;for(let i=0;i<3;i++){try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error("HTTP "+r.status);d=await r.json();break;}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)));}}
 if(!Array.isArray(d?.data)||!Number.isInteger(d.total)||d.total<=0||total!==null&&total!==d.total)throw Error("incomplete or changing goalie source");
 total=d.total;rows.push(...d.data);if(rows.length===total)return rows;if(!d.data.length||rows.length>total||d.data.length!==100)throw Error("incomplete pagination");await new Promise(r=>setTimeout(r,200));
 }throw Error("pagination bound exceeded");
}
async function main(){
 const {history,schedules}=load(),results=[],players={};let usage=null;try{usage=JSON.parse(fs.readFileSync(path.join(root,'outputs/nhl-usage/latest.json'),'utf8'));}catch{}
 for(const season of ["20252026","20262027"]){const schedule=schedules.find(s=>s.season===season.slice(0,4)+"-"+season.slice(6));if(!schedule?.complete)throw Error("missing complete season schedule");const raw=await collect(season);const r=reconcile(raw,history,schedule,usage);results.push({season,...r.counts});if(!r.counts.starts)throw Error("no verified starter observations: "+JSON.stringify(results));for(const [id,a] of Object.entries(r.players))(players[id]??=[]).push(...a);}
 const d={kind:"official_nhl_game_level_goalie_start_history_v1",source:"official_NHL_stats_rest_goalie_summary_exact_game",generatedAt:new Date().toISOString(),results,players,pregameStarterConfirmed:false,researchOnly:true};
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(d)+"\n");console.log(JSON.stringify({results,researchOnly:true}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});module.exports={reconcile,collect,main};
