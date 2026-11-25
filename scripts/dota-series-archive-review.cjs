"use strict";
// Source-native history; no original platform offer, independently verified ordinal or settlement claims.
const fs=require("node:fs"),path=require("node:path");
const at=Date.parse,id=x=>typeof x==="string"&&/^[1-9][0-9]{0,15}$/.test(x),key=x=>x.leagueId+"|"+x.providerSeriesId;
function validIndex(x){
 return x?.provider==="opendota"&&x.title==="DOTA2"&&id(x.providerGameId)&&id(x.leagueId)&&Array.isArray(x.teamIds)&&x.teamIds.length===2&&x.teamIds.every(id)&&new Set(x.teamIds).size===2&&x.teamIds.includes(x.winnerTeamId)&&Number.isFinite(at(x.startAt))&&at(x.endAt)>at(x.startAt)&&x.providerReportedFinal===true;
}
function archive(root){
 const dir=path.join(root,"research/esports-free-providers"),index=new Map(),details=new Map(),bad=new Set();let files=0;
 if(fs.existsSync(dir))for(const n of fs.readdirSync(dir).filter(x=>/^\d+-\d+\.json$/.test(x)).sort().slice(-90)){
  try{
   const p=path.join(dir,n);if(fs.lstatSync(p).isSymbolicLink()||fs.statSync(p).size>8_000_000)continue;
   const d=JSON.parse(fs.readFileSync(p,"utf8"));if(d.kind!=="restricted_esports_free_provider_observations_v1")continue;files++;
   for(const r of d.opendota?.index||[])if(validIndex(r)){
    const prev=index.get(r.providerGameId);if(prev&&JSON.stringify(prev)!==JSON.stringify(r)){bad.add(r.providerGameId);continue;}index.set(r.providerGameId,r);
   }
   for(const g of d.opendota?.games||[])if(validIndex(g.game)&&Array.isArray(g.players)&&g.players.length===10&&new Set(g.players.map(x=>x.providerPlayerId)).size===10&&g.players.every(x=>x.providerMatchId===g.game.providerGameId&&id(x.providerPlayerId)))details.set(g.game.providerGameId,g);
  }catch{}
 }
 for(const k of bad){index.delete(k);details.delete(k);}
 for(const [k,g] of details)if(!index.has(k)||JSON.stringify(g.game)!==JSON.stringify(index.get(k)))details.delete(k);
 return {files,index,details,bad};
}
function groups(rows){
 const out=new Map();
 for(const x of rows)if(validIndex(x)&&id(x.providerSeriesId)){
  const k=key(x);if(!out.has(k))out.set(k,[]);out.get(k).push(x);
 }
 return [...out.values()].filter(a=>a.length>=2&&a.length<=7&&new Set(a.map(x=>x.providerGameId)).size===a.length&&new Set(a.map(x=>JSON.stringify([...x.teamIds].sort()))).size===1&&new Set(a.map(x=>x.providerSeriesType)).size===1).map(a=>a.sort((x,y)=>at(x.startAt)-at(y.startAt))).filter(a=>a.every((x,i)=>!i||at(a[i-1].endAt)<=at(x.startAt)));
}
function choose(rows,prior,limit=8){
 const unique=new Map();for(const x of rows)if(validIndex(x))unique.set(x.providerGameId,x);
 const selected=[],seen=new Set();
 const take=x=>{if(selected.length<limit&&!prior.has(x.providerGameId)&&!seen.has(x.providerGameId)){seen.add(x.providerGameId);selected.push(x);}};
 const candidates=groups(unique.values()).map(a=>({a,have:a.filter(x=>prior.has(x.providerGameId)).length,need:a.filter(x=>!prior.has(x.providerGameId)).length})).filter(x=>x.need&&x.have).sort((x,y)=>x.need-y.need||y.have-x.have||at(y.a[0].startAt)-at(x.a[0].startAt));
 for(const x of candidates)if(x.need<=limit-selected.length)for(const r of x.a)take(r);
 for(const x of [...unique.values()].sort((a,b)=>at(b.startAt)-at(a.startAt)))take(x);
 return selected;
}
function summary(root){
 const a=archive(root),g=groups(a.index.values()),full=g.filter(s=>s.every(x=>a.details.has(x.providerGameId)));
 return {kind:"opendota_native_series_archive_review_v1",files:a.files,indexGames:a.index.size,completeGameDetails:a.details.size,playerRecords:[...a.details.values()].reduce((n,g)=>n+g.players.length,0),conflictingGameIds:a.bad.size,chronologicalGroups:g.length,groupsWithEveryListedDetail:full.length,groupsWithAllDetailsAndStableRoster:full.filter(s=>new Set(s.map(x=>JSON.stringify(a.details.get(x.providerGameId).players.map(p=>p.providerPlayerId).sort()))).size===1).length,verifiedMapOrdinals:0,completeSeriesIndependentlyVerified:false,originalOfferMatched:false,rawRowsPublished:0,paidRequests:0};
}
if(require.main===module)console.log(JSON.stringify(summary(process.argv[2])));
module.exports={archive,choose,groups,summary};
