"use strict";
const fs=require("node:fs"),path=require("node:path");
const {mergeHistory,ppRows}=require("../src/nhl-specialist-history-recovery.cjs");
const special=require("../src/nhl-specialist-matchup-ablation.cjs"),challengers=require("../src/nhl-specialist-challengers-v2.cjs"),learned=require("../src/nhl-learned-matchup-v1.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const dir="outputs/research/nhl-pp-history",shDir="outputs/research/nhl-sh-history",exists=p=>fs.existsSync(path.join(root,p)),files=(d)=>exists(d)?fs.readdirSync(path.join(root,d)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort():[];
function write(p,x){const d=path.join(root,p);fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,JSON.stringify(x,null,2)+"\n");}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchDay(day,{client=fetch,pause=sleep,maxPages=20}={}){
 const rows=[],limit=500;let total=null;
 for(let i=0;i<maxPages;i++){
  const query=new URLSearchParams({isAggregate:"false",isGame:"true",start:String(rows.length),limit:String(limit),sort:JSON.stringify([{property:"gameId",direction:"ASC"},{property:"playerId",direction:"ASC"}]),cayenneExp:'gameDate>="'+day+'" and gameDate<="'+day+' 23:59:59" and gameTypeId=2'});
  const r=await client("https://api.nhle.com/stats/rest/en/skater/timeonice?"+query,{signal:AbortSignal.timeout(25000),redirect:"error"});
  if(!r.ok)throw Error("official_http_"+r.status);
  const d=await r.json();if(!Array.isArray(d.data)||!Number.isInteger(d.total)||total!==null&&total!==d.total)throw Error("incomplete_pagination");total=d.total;if(total>800)throw Error('unexpected_daily_inventory');const ids=new Set(rows.map(x=>x.gameId+'|'+x.playerId));for(const x of d.data){const k=x.gameId+'|'+x.playerId;if(ids.has(k))throw Error('duplicate_pagination_identity');ids.add(k);}rows.push(...d.data);if(rows.length===total)return {data:rows,total};if(rows.length>total||!d.data.length)throw Error("invalid_pagination");await pause(1300);
 }
 throw Error("bounded_pagination_exceeded");
}
function source(){
 const h=read("outputs/history/players.json"),prior=files("outputs/period-stats/training-source").map(x=>read("outputs/period-stats/training-source/"+x));
 return {h,prior};
}
function rawOfferInventory(now){
 const rootDir="outputs/manual-board-captures";
 if(!exists(rootDir))return {status:"no_archive"};
 const dates=fs.readdirSync(path.join(root,rootDir)).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
 for(const day of dates.slice(0,2)){
  const parent=rootDir+"/"+day;
  for(const n of fs.readdirSync(path.join(root,parent)).sort().reverse()){
   const sub=parent+"/"+n;
   try{
    const m=read(sub+"/manifest.json"),info=m.sports?.find(x=>x.sport==="NHL");
    if(m.source!=="partner-api.prizepicks.com"||m.completePagination!==true||!info||info.completePagination===false||!Number.isInteger(info.parts)||info.parts<1||info.parts>20)continue;
    const stored=[];for(let i=1;i<=info.parts;i++){const p=read(sub+"/nhl-"+String(i).padStart(2,"0")+".json");if(Array.isArray(p))stored.push(...p);else if(Array.isArray(p.rows))stored.push(...p.rows);}
    if(stored.length!==info.rawCount||info.normalizedCount!==info.rawCount)continue;
    const cols=m.columns||require("../src/partner-prizepicks-board.cjs").COLUMNS;
    const out={status:"archived_source_inventory",sourceCapturedAt:info.sourceObservedAt,ageMinutes:(Date.parse(now)-Date.parse(info.sourceObservedAt))/60000,rawOffers:stored.length,periodOffers:0,comboOffers:0,structuredComboMemberOffers:0,periodLabels:{},comboLabels:{},fantasyLabels:{},unknownSpecialtyRules:true,originalRawResponseStored:m.originalSourceRawResponseStored===true,comboIdentitySource:"structured metadata only; flattened archive labels are not participant identity"};
    for(const v of stored){const x=Array.isArray(v)?Object.fromEntries(cols.map((k,i)=>[k,v[i]])):v;if(!x||typeof x.market!=="string")continue;
     const label=x.market,period=String(x.period||"").trim(),combo=x.combo===true||x.eventType==="combo"||/\bcombo\b/i.test(label)||String(x.player||"").includes(" + ");
     if(combo){out.comboOffers++;out.comboLabels[label]=(out.comboLabels[label]||0)+1;if(Array.isArray(x.members)&&x.members.length>=2&&x.members.every(y=>Number.isInteger(y.playerId)&&Number.isInteger(y.officialGameId)))out.structuredComboMemberOffers++;}
     if(/^(?:[123](?:st|nd|rd)?\s*(?:p|period)|(?:first|second|third)\s+period)$/i.test(period)){out.periodOffers++;out.periodLabels[period]=(out.periodLabels[period]||0)+1;}
     if(/fantasy/i.test(label))out.fantasyLabels[label]=(out.fantasyLabels[label]||0)+1;
    }
    return out;
   }catch{}
  }
 }
 return {status:"complete_archive_not_found"};
}
function schedule(){const s=read("outputs/official-nhl/season-schedules/2026-27.json"),p=read("outputs/official-nhl/season-schedules/2025-26.json");if(!s.complete||!p.complete)throw Error("complete schedule required");return {...s,games:[...p.games,...s.games]};}
async function main(){
 const now=new Date().toISOString(),{h,prior}=source(),base=mergeHistory(h,prior),days=new Map();
 for(const p of Object.values(base.history.players))for(const g of p.games){if(g.type!=="skater"||String(g.gameId).slice(4,6)!=="02")continue;const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 const sorted=[...days.keys()].sort(),today=now.slice(0,10),missing=sorted.filter(d=>d<today&&!exists(dir+"/"+d+".json"));
 const recent=missing.filter(d=>d>="2026-07-01").slice(-8),historical=missing.filter(d=>d<"2026-07-01").slice(0,8),todo=process.argv.includes("--offline")?[]:[...recent,...historical].slice(0,16),attempts=[];
 for(const d of todo){
  try{const data=await fetchDay(d),x=ppRows(data,days.get(d),d);if(x.rows.length<.90*x.expected||!x.rows.length)throw Error("coverage_or_schema_unverified_"+x.rows.length+"_of_"+x.expected);
   write(dir+"/"+d+".json",{kind:"official_nhl_exact_game_pp_time_v1",date:d,observedAt:new Date().toISOString(),...x,source:"NHL Stats REST skater/timeonice, game rows",paidProviderRequests:0});attempts.push({date:d,status:"archived",matched:x.rows.length,expected:x.expected,mismatch:x.mismatch});
  }catch(e){attempts.push({date:d,status:"unverified",reason:String(e.message).slice(0,150)});if(/official_http_(403|429)/.test(e.message))break;}
  await sleep(1400);
 }
 // SH is separately archived; original PP first-Git source records stay immutable.
 // Eight daily no-credit requests maximum, subject to official NHL rate limits.
 const candidateSH=files(dir).filter(n=>!exists(shDir+"/"+n)&&
   days.has(n.slice(0,10))&&
   read(dir+"/"+n).kind==="official_nhl_exact_game_pp_time_v1"&&
   (read(dir+"/"+n).rows||[]).some(x=>!Number.isInteger(x.shortHandedTimeOnIceSeconds)));
 const shRecent=candidateSH.filter(n=>n>="2026-07-01").slice(-4);
 const shOlder=candidateSH.filter(n=>n<"2026-07-01").slice(0,4);
 const shTodo=process.argv.includes("--offline")?[]:[...shRecent,...shOlder],shAttempts=[];
 for(const file of shTodo){
  const d=file.slice(0,10);
  try{
   const raw=await fetchDay(d),parsed=ppRows(raw,days.get(d),d);
   const sh=parsed.rows.filter(x=>Number.isInteger(x.shortHandedTimeOnIceSeconds));
   if(sh.length<.90*parsed.expected||parsed.rows.length<.90*parsed.expected||
      !sh.length)throw Error("sh_coverage_or_schema_unverified_"+
       sh.length+"_of_"+parsed.expected);
   write(shDir+"/"+file,{
    kind:"official_nhl_exact_game_sh_time_v1",date:d,
    observedAt:new Date().toISOString(),rows:sh,expected:parsed.expected,
    mismatch:parsed.mismatch,
    originalPPArchive:dir+"/"+file,
    source:"NHL Stats REST skater/timeonice, exact game rows",
    originalPPArchiveNeverRewritten:true,paidProviderRequests:0
   });
   shAttempts.push({date:d,status:"archived",matched:sh.length,expected:parsed.expected});
  }catch(e){
   shAttempts.push({date:d,status:"unverified",reason:String(e.message).slice(0,150)});
   if(/official_http_(403|429)/.test(e.message))break;
  }
  await sleep(1400);
 }
 const pp=files(dir).flatMap(n=>{const x=read(dir+"/"+n);return x.kind==="official_nhl_exact_game_pp_time_v1"?x.rows:[];});
 const sh=files(shDir).flatMap(n=>{const x=read(shDir+"/"+n);
  return x.kind==="official_nhl_exact_game_sh_time_v1"?x.rows:[];});
 const merged=mergeHistory(h,prior,pp,sh),s=schedule(),period=read("outputs/period-stats/history.json"),periodReport=special.study(merged.history,s,period);
 // Train on true earlier games only; aggregate specialist research never
 // changes production history or retroactively registers bets.
 const challengerPeriod=challengers.periodBoth(period,s,require("../src/nhl-fixed-ensemble-research.cjs").uniqueRows(merged.history)),challengerGoalies=challengers.goalies(merged.history,s);
 const backtest=learned.study(merged.history,s,{cutoff:today,evaluationFrom:"2026-07-01"});
 const out={kind:"private_nhl_specialist_source_recovery_v1",generatedAt:new Date().toISOString(),counts:merged.counts,historicalPriorDateFiles:prior.length,boardInventory:rawOfferInventory(now),powerPlay:{eligibleDays:sorted.length,archivedDays:files(dir).length,attempts,matchedRows:merged.counts.ppMatched,source:"exact official per-game total power-play ice time"},shorthanded:{archivedDays:files(shDir).length,attempts:shAttempts,matchedRows:merged.counts.shBackfillMatched,priorPPArchivesUnchanged:true,source:"exact official shTimeOnIce when present"},period:periodReport.period,combo:periodReport.combo,fantasy:periodReport.fantasy,challengers:{period:challengerPeriod,...challengerGoalies},learned:{byMarket:backtest.byMarket},modelPromoted:false,productionHistoryChanged:false,paidProviderRequests:0};
 write("outputs/health/nhl-specialist-source-recovery-latest.json",out);console.log(JSON.stringify({counts:out.counts,ppDays:out.powerPlay.archivedDays,periodMarkets:Object.keys(out.period.byPeriodMarket).length,comboMarkets:Object.keys(out.combo.byMarket).length,fantasyMarkets:Object.keys(out.fantasy.byMarket).length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={source,fetchDay,rawOfferInventory};
