"use strict";
// UnderdogAPI.com (independent): manual, bounded, private coverage check.
// Never treat a small response, demo or delayed board as complete platform data.
const fs=require("node:fs"),path=require("node:path"),dt=Date.parse;
function shapeDiagnostics(doc){const m=doc?.meta,rows=doc?.data;return {dataIsArray:Array.isArray(rows),rowCount:Array.isArray(rows)?rows.length:null,metaPresent:!!m,metaCountType:typeof m?.count,metaCountMatches:Array.isArray(rows)&&m?.count===rows.length,metaDemoFlag:m?.is_demo===true?"true":m?.is_demo===false?"false":"missing_or_other",modeDemo:m?.mode==="demo",rowExplicitLiveCount:Array.isArray(rows)?rows.filter(r=>r?.is_demo===false).length:null};}
function summarize(doc,league,now){const m=doc?.meta,rows=doc?.data;if(!m||(m.is_demo!==undefined&&m.is_demo!==false)||m.mode==="demo"||m.source_status==="demo"||!Array.isArray(rows)||m.count!==rows.length||rows.length===0||rows.length>5||!rows.every(r=>r?.is_demo===false&&r.source!=="demo"))throw Error("Source preview did not verify a non-demo bounded response");
 let usable=0,availableSides=0,knownMultipliers=0;const ids=new Set(),rejected={};
 const bad=k=>{rejected[k]=(rejected[k]||0)+1;};
 for(const r of rows){
   if(r.league!==league){bad("league_mismatch");continue;}
   if(typeof r.line_id!=="string"||!r.line_id){bad("missing_line_id");continue;}
   if(ids.has(r.line_id)){bad("duplicate_line_id");continue;}ids.add(r.line_id);
   if(!r.player?.id){bad("missing_player_id");continue;}
   if(!r.event?.id){bad("missing_event_id");continue;}
   if(!r.market?.stat||!r.market?.period){bad("missing_market_or_period");continue;}
   if(!Number.isFinite(r.line)){bad("invalid_threshold");continue;}
   if(!Array.isArray(r.selections)){bad("missing_selections");continue;}
   const observed=dt(r.observed_at),game=dt(r.event.starts_at),clock=dt(now);
   if(!Number.isFinite(observed)||observed>clock){bad("invalid_observation_clock");continue;}
   if(!Number.isFinite(game)){bad("missing_event_start");continue;}
   if(game<=clock){bad("event_already_started");continue;}
   if(clock-observed>1800000){bad("stale_observation");continue;}
   if(r.status!==undefined&&r.status!=="active"){bad("inactive_market");continue;}
   const s=r.selections.filter(x=>x&&["higher","lower"].includes(x.side)&&x.available===true);
   if(!s.length){bad("no_available_side");continue;}
   if(new Set(s.map(x=>x.side)).size!==s.length){bad("duplicate_side");continue;}
   usable++;availableSides+=s.length;knownMultipliers+=s.filter(x=>Number.isFinite(x.payout_multiplier)&&x.payout_multiplier>0).length;
 }
 return {league,returned:rows.length,usableRecentPregameRows:usable,rejectionCounts:rejected,availableSides,knownMultipliers,sourceStatus:["fresh","stale","aging","unavailable","live"].includes(m.source_status)?m.source_status:null,provenance:"explicit_non_demo_on_every_row",morePages:m.next_cursor!=null,completeBoardVerified:false,authenticatedAppAvailability:false};
}
function loadSchedule(league,root=path.resolve(__dirname,"..")){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
 try{
  if(league==="NHL"){
   const a=read("outputs/official-nhl/season-schedules/2026-27.json");
   return {league,complete:a.source==="Official NHL Web API"&&a.complete===true,observedAt:a.generatedAt,games:a.games};
  }
  const manifest=read("outputs/nfl/history/manifest.json"),d=(manifest.datasets||[]).filter(x=>x.season===2026&&x.dataset==="schedule"&&x.status==="saved");
  const p="outputs/nfl/history/2026/schedule.json.gz";
  if(d.length!==1||d[0].path!==p)return null;
  const doc=JSON.parse(require("node:zlib").gunzipSync(fs.readFileSync(path.join(root,p))).toString("utf8")),games=doc.rows;
  return {league,complete:doc.sport==="NFL"&&doc.dataset==="schedule"&&doc.retrospectivePlayerStatsNotPregameLines===true&&Array.isArray(games)&&doc.recordCount===games.length&&games.length===d[0].records&&games.length>=272,observedAt:doc.collectedAt||manifest.last2026CoreRefreshAt||manifest.collectedAt,games};
 }catch{return null;}
}
function loadRoster(league,root=path.resolve(__dirname,"..")){
 try{
  if(league==="NHL"){
   const a=JSON.parse(fs.readFileSync(path.join(root,"outputs/pregame-availability/official-roster-crosswalk-latest.json"),"utf8"));
   return a.kind==="official_nhl_current_roster_crosswalk_v1"&&a.failedTeams===0?{league,observedAt:a.capturedAt,rows:a.rows}:null;
  }
  const normalizeRows=rows=>rows.map(x=>({name:x.full_name||x.player_display_name||x.player_name||(x.first_name&&x.last_name?x.first_name+" "+x.last_name:null),team:x.team||x.recent_team,playerId:x.gsis_id||x.player_id,season:x.season,week:x.week}));
  const freshPath=path.join(root,"outputs/nfl/availability/weekly-roster-research-latest.json.gz");
  if(fs.existsSync(freshPath)){
   const v=JSON.parse(require("node:zlib").gunzipSync(fs.readFileSync(freshPath)).toString("utf8"));
   if(v.kind==="private_nflverse_weekly_roster_observation_v1"&&v.sport==="NFL"&&v.dataset==="weekly_rosters"&&v.source==="nflverse.load_rosters_weekly"&&v.currentActiveRosterVerified===false&&v.retrospectivePlayerStatsNotPregameLines===true&&Array.isArray(v.rows)&&v.recordCount===v.rows.length&&v.rows.length>=1000&&Number.isFinite(dt(v.collectedAt)))
    return {league,observedAt:v.collectedAt,archiveOnly:true,rows:normalizeRows(v.rows)};
  }
  const a=JSON.parse(require("node:zlib").gunzipSync(fs.readFileSync(path.join(root,"outputs/nfl/history/2026/weekly_rosters.json.gz"))).toString("utf8"));
  if(a.sport!=="NFL"||a.dataset!=="weekly_rosters"||a.retrospectivePlayerStatsNotPregameLines!==true||!Array.isArray(a.rows)||a.recordCount!==a.rows.length)return null;
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"outputs/nfl/history/manifest.json"),"utf8"));
  const entry=(manifest.datasets||[]).filter(x=>x.season===2026&&x.dataset==="weekly_rosters"&&x.status==="saved"&&x.path==="outputs/nfl/history/2026/weekly_rosters.json.gz"&&x.records===a.recordCount);
  if(entry.length!==1||a.source!=="nflverse.load_rosters_weekly")return null;
  // The latest core refresh is NOT a roster observation timestamp.
  const observedAt=a.collectedAt||manifest.collectedAt;
  if(!Number.isFinite(dt(observedAt)))return null;
  return {league,observedAt,archiveOnly:true,rows:normalizeRows(a.rows)};
 }catch{return null;}
}
async function main(){const token=process.env.UNDERDOG_API_KEY;if(!token||process.env.UNDERDOG_READ_ONLY_PROBE!=="explicit_manual")throw Error("Missing key or explicit manual test flag; no requests");
 const league=process.argv[2];if(!["NHL","NFL"].includes(league))throw Error("One league only");
 const url=new URL("https://underdogapi.com/api/v1/projections");url.search=new URLSearchParams({league,view:"full",limit:"5"}).toString();
 const r=await fetch(url,{headers:{Authorization:"Bearer "+token,"X-User-Request":"Private data integration coverage check"},signal:AbortSignal.timeout(20000),redirect:"error"});if(!r.ok)throw Error("Provider HTTP "+r.status+"; no retry");
 const now=new Date().toISOString(),doc=await r.json(),usage=r.headers.get("X-Credits-Charged")??r.headers.get("X-Credits-Cost"),remaining=r.headers.get("X-Credits-Remaining");const numberHeader=v=>v!==null&&/^\d+$/.test(v)?Number(v):null;console.log(JSON.stringify({kind:"underdog_response_shape_only",league,httpStatus:r.status,reportedCredits:numberHeader(usage),remainingCredits:numberHeader(remaining),...shapeDiagnostics(doc)}));const summary=summarize(doc,league,now);const crosswalk=require("../src/underdog-event-crosswalk.cjs").summarizeCrosswalk(doc,league,now,loadSchedule(league));const identityMarket=require("../src/underdog-identity-market-research.cjs").audit(doc,league,now,loadSchedule(league),loadRoster(league));const intake=require("../src/underdog-private-research-intake.cjs"),candidates=intake.normalize(doc,league,now,loadSchedule(league),loadRoster(league)),modelCoverage=intake.modelCoverage(candidates);const report={kind:"independent_underdog_private_coverage_probe_v1",generatedAt:now,...summary,scheduleCrosswalk:crosswalk,identityMarketResearch:identityMarket,modelCoverage,reportedCredits:numberHeader(usage),remainingCredits:numberHeader(remaining),requests:1,publicRedistribution:false};const dir=path.resolve(__dirname,"../outputs/health");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"underdog-coverage-probe-latest.json"),JSON.stringify(report,null,2)+"\n");if(process.env.UNDERDOG_PRIVATE_ARCHIVE==="explicit_private_research"){const stamp=now.replace(/[-:.]/g,""),target=path.resolve(__dirname,"../outputs/research/underdog-bounded-candidates");fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,stamp+"-"+league+".json"),JSON.stringify({kind:"private_underdog_bounded_candidate_observation_v1",generatedAt:now,league,report,candidates,completeBoardVerified:false,productionEligible:false,publicRedistribution:false},null,2)+"\n",{flag:"wx",mode:0o600});}console.log(JSON.stringify(report));}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={summarize,shapeDiagnostics,loadSchedule,loadRoster};
