"use strict";
// Read-only sports performance evaluation. No offer lines, directions, payouts or selections.
// Fixed retrospective algorithms; not a prospective or untouched test.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const {readPinned}=require("./nba-archived-three-source-crosswalk.cjs");
const {collectMaps}=require("./esports-prospective-archive.cjs");
const {TITLES,stat}=require("../src/esports-research-v1.cjs");
const NBA=["points","rebounds","assists","threePointersMade","steals","blocks","turnovers"];
const MIN=12,dt=Date.parse,validDate=x=>typeof x==="string"&&Number.isFinite(dt(x));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const finite=x=>Number.isFinite(x)&&x>=0;
const key=x=>JSON.stringify(x);
function nbaRows(d){
 if(!d||!Array.isArray(d.rows)||!validDate(d.capturedAt)||!/^2026-27$/.test(d.season||""))throw Error("NBA history contract");
 const seen=new Set(),out=[];
 for(const x of d.rows){
  if(!Number.isInteger(x.gameId)||!Number.isInteger(x.playerId)||!/^\d{4}-\d{2}-\d{2}$/.test(x.gameDate||"")||!validDate(x.gameDate)||x.gameDate>=d.capturedAt.slice(0,10)||typeof x.team!=="string"||!NBA.every(k=>finite(x[k])))continue;
  const id=key([x.gameId,x.playerId]);if(seen.has(id))throw Error("duplicate NBA player-game");seen.add(id);
  out.push({sport:"NBA",player:key([x.playerId,x.team]),event:String(x.gameId),date:x.gameDate,start:dt(x.gameDate),end:dt(x.gameDate),known:dt(x.gameDate),scope:"full_game",values:Object.fromEntries(NBA.map(k=>[k,x[k]]))});
 }
 return out;
}
function esportsRows(maps){
 return maps.map(x=>({sport:x.title,player:key([x.playerId,x.teamId,x.ruleset,x.edition||null,x.mode||null,x.mapIndex]),event:key([x.seriesId,x.mapIndex]),series:x.seriesId,date:x.startAt.slice(0,10),start:dt(x.startAt),end:dt(x.endAt),known:dt(x.observedAt),scope:"map_"+x.mapIndex,values:Object.fromEntries(TITLES[x.title].stats.filter(k=>k!=="killsPlusAssists"&&stat(x,k)!==null).map(k=>[k,stat(x,k)]))}));
}
// CRPS for the empirical distribution: E|X-y| - 0.5 E|X-X'|.
function empirical(a,y){
 const sorted=[...a].sort((x,z)=>x-z),n=sorted.length,m=mean(sorted);
 const crps=mean(sorted.map(x=>Math.abs(x-y)))-sorted.reduce((s,x,i)=>s+(2*i-n+1)*x,0)/(n*n);
 const lo=sorted[Math.floor(.1*(n-1))],hi=sorted[Math.ceil(.9*(n-1))];
 return {mean:m,mae:Math.abs(m-y),sq:(m-y)**2,crps,covered:Number(y>=lo&&y<=hi),width:hi-lo,residual:y-m};
}
function add(a,m,b,event,date){
 a.n++;a.mae+=m.mae;a.sq+=m.sq;a.crps+=m.crps;a.covered+=m.covered;a.width+=m.width;
 a.recentMAE+=b.mae;a.recentCRPS+=b.crps;a.events.add(event);a.dates.add(date);
}
function correlation(a){
 if(a.length<30)return null;
 const x=mean(a.map(v=>v[0])),y=mean(a.map(v=>v[1]));let xx=0,yy=0,xy=0;
 for(const [u,v] of a){xx+=(u-x)**2;yy+=(v-y)**2;xy+=(u-x)*(v-y);}
 return xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
}
function evaluate(rows){
 const groups=new Map(),summary=new Map(),pairs=new Map(),source={NBA:0,CS2:0,VALORANT:0,LOL:0,DOTA2:0,COD:0};let excluded=0;
 for(const x of rows){
  if(!(x.sport in source)||!Number.isFinite(x.start)||!Number.isFinite(x.end)||!Number.isFinite(x.known))continue;
  source[x.sport]++;const k=key([x.sport,x.player]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);
 }
 for(const list of groups.values()){
  list.sort((a,b)=>a.start-b.start);
  for(let i=0;i<list.length;i++){
   const x=list[i],prior=list.slice(0,i).filter(p=>p.end<x.start&&p.known<x.start&&(!x.series||p.series!==x.series));
   const residuals={};for(const [metric,y] of Object.entries(x.values)){
    if(!finite(y))continue;
    const vals=prior.map(p=>p.values[metric]).filter(finite).slice(-30);
    if(vals.length<MIN){excluded++;continue;}
    const m=empirical(vals,y),recent=empirical(vals.slice(-10),y),k=key([x.sport,x.scope,metric]);
    if(!summary.has(k))summary.set(k,{n:0,mae:0,sq:0,crps:0,covered:0,width:0,recentMAE:0,recentCRPS:0,events:new Set(),dates:new Set()});
    add(summary.get(k),m,recent,x.event,x.date);residuals[metric]=m.residual;
   }
   const keys=Object.keys(residuals).sort();for(let j=0;j<keys.length;j++)for(let l=j+1;l<keys.length;l++){
    const a=keys[j],b=keys[l],k=key([x.sport,x.scope,a,b]);
    if(!pairs.has(k))pairs.set(k,{values:[],events:new Set(),dates:new Set()});
    const p=pairs.get(k);p.values.push([residuals[a],residuals[b]]);p.events.add(x.event);p.dates.add(x.date);
   }
  }
 }
 const groupsOut=Object.fromEntries([...summary].map(([k,a])=>[k,{n:a.n,distinctEvents:a.events.size,distinctDates:a.dates.size,mae:a.mae/a.n,rmse:Math.sqrt(a.sq/a.n),empiricalCRPS:a.crps/a.n,recent10MAE:a.recentMAE/a.n,recent10CRPS:a.recentCRPS/a.n,nominalCentral80Coverage:a.covered/a.n,meanIntervalWidth:a.width/a.n}]));
 const correlations=Object.fromEntries([...pairs].map(([k,a])=>[k,{n:a.values.length,distinctEvents:a.events.size,distinctDates:a.dates.size,pearson:a.events.size>=10?correlation(a.values):null}]));
 return {kind:"chronological_player_stat_audit_v1",sourceRows:source,excludedMetricObservationsInsufficientHistory:excluded,groups:groupsOut,withinPlayerEventResidualCorrelations:correlations,method:"last 30 available same-context prior stats, fixed last-10 comparator; dates and observed clocks strictly prior; empirical distribution CRPS and interval coverage",retrospective:true,sourceContextMayBeRetrospective:true,untouched:false,prospective:false,calibrationApproved:false,rawRowsPublished:0,paidRequests:0};
}
function immutableMaps(root){
 const dir="outputs/esports/authorized-map-statistics",base=path.join(root,dir);if(!fs.existsSync(base))return [];
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]}).trim(),files=[];
 for(const n of fs.readdirSync(base).filter(n=>/^[A-Za-z0-9_-]{1,120}\.json$/.test(n)).sort().slice(-200)){
  const rel=dir+"/"+n,p=path.join(root,rel);
  try{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>8e6||git(["status","--porcelain","--",rel]))continue;
   const commits=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);if(commits.length!==1)continue;
   const first=git(["show","-s","--format=%cI",commits[0]]),raw=git(["show",commits[0]+":"+rel]);if(!validDate(first))continue;
   files.push({first,doc:JSON.parse(raw),digest:crypto.createHash("sha256").update(raw).digest("hex")});
  }catch{}
 }
 return collectMaps(files);
}
if(require.main===module){try{
 const [file,sha,root]=process.argv.slice(2);if(!file||!sha||!root||fs.realpathSync(root)===path.resolve(__dirname,".."))throw Error("restricted archive required");
 const nba=readPinned(file,sha),maps=immutableMaps(root);
 const r=evaluate([...nbaRows(nba),...esportsRows(maps)]);
 r.nbaHistorySourceKind=String(nba.kind||"unknown");r.nbaHistorySourceConditional=true;
 // Print aggregate metrics only, no player IDs, matches, offers or raw source rows.
 console.log(JSON.stringify(r));
}catch{console.error("Chronological player stat audit failed closed");process.exitCode=1}}
module.exports={nbaRows,esportsRows,empirical,correlation,evaluate};
