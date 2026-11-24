"use strict";
/**
 * Direct real-time partner API source collector. Runs INSIDE private checkout,
 * even when compute is borrowed from PUBLIC free GitHub-hosted runners.
 * Do not log, upload, or write any provider records into the public repo.
 * No auth or paid provider key, no wager actions, no original-app entitlement.
 */
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const COLUMNS=require("../src/partner-prizepicks-board.cjs").COLUMNS;
const LEAGUES=[{sport:"NHL",leagueId:8,minimumRows:200},
 {sport:"NFL",leagueId:9,minimumRows:1000}];
function pacificClock(t){
 const ps=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",
  hourCycle:"h23"}).formatToParts(t);
 const p=Object.fromEntries(ps.map(x=>[x.type,x.value]));
 return {day:p.year+"-"+p.month+"-"+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
function serverUrl(id){return "https://partner-api.prizepicks.com/projections?league_id="+id+"&per_page=250&single_stat=true";}
function toRows(doc,{sport,leagueId,minimumRows}){
 if(!doc||doc.meta?.current_page!==1||doc.meta?.total_pages!==1||
   !Array.isArray(doc.data)||doc.data.length<minimumRows||
   !Array.isArray(doc.included))throw Error("Incomplete "+sport+" partner response or unexpected pagination");
 const included=new Map();
 for(const r of doc.included){
  if(r?.id&&r?.type)included.set(r.type+":"+r.id,r.attributes||{});
 }
 const seen=new Set(),out=[];let missingPlayers=0,missingGames=0;
 for(const rec of doc.data){
  const a=rec?.attributes||{},rels=rec?.relationships||{};
  if(rec?.type!=="projection"||!rec.id||seen.has(rec.id))
   throw Error("Invalid repeated or missing "+sport+" projection identity");
  seen.add(rec.id);
  const player=included.get("new_player:"+rels.new_player?.data?.id);
  const game=included.get("game:"+rels.game?.data?.id);
  if(!player)missingPlayers++;
  if(!game)missingGames++;
  const pair=game?.metadata?.game_info?.teams;
  const home=pair?.home?.abbreviation,away=pair?.away?.abbreviation,team=player?.team;
  const opponent=team===home?away:team===away?home:null;
  const durationId=rels.duration?.data?.id;
  const duration=included.get("duration:"+durationId);
  const period=durationId==="11"||["Full","Full Game"].includes(duration?.name)?"Full":
   duration?.name||duration?.label||null;
  const r={
   projectionId:String(rec.id),providerPlayerId:player?.ppid||rels.new_player?.data?.id||null,
   player:player?.display_name||player?.name||null,
   team:team||null,position:player?.position||null,
   providerGameId:a.game_id||null,gameExternalId:game?.external_game_id||null,
   eventStartsAt:a.start_time||game?.start_time||null,
   opponent:opponent||null,market:a.stat_type||a.stat_display_name||null,
   line:Number.isFinite(a.line_score)?a.line_score:null,
   tier:a.odds_type||null,offeredWagerTypes:a.allowed_wager_types||null,
   boardTime:a.board_time||null,lineUpdatedAt:a.updated_at||null,
   status:a.status||null,inGame:a.in_game===true,
   isLive:a.is_live===true||game?.is_live===true,
   eventType:a.event_type||null,period,groupKey:a.group_key||null,
   combo:player?.combo===true||a.event_type==="combo"
  };
  out.push(COLUMNS.map(k=>r[k]));
 }
 if(missingPlayers||missingGames)throw Error(sport+" missing original player/game includes: "+missingPlayers+"/"+missingGames);
 // The endpoint includes older and currently live offers. Preserve the
 // response but restrict original pregame selections in the existing adapter.
 return {sport,leagueId,rows:out,players:doc.included.filter(x=>x.type==="new_player").length,
  games:doc.included.filter(x=>x.type==="game").length};
}
async function fetchLeague(league,{client=fetch,
 pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxAttempts=4}={}){
 const url=serverUrl(league.leagueId);
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const response=await client(url,{headers:{Accept:"application/json",
   "User-Agent":"NHL-NFL-private-research-collector/1.0"},
   signal:AbortSignal.timeout(45000)});
  if(response?.ok){
   const source=await response.json(),receivedAt=new Date().toISOString();
   return {...toRows(source,league),url,receivedAt};
  }
  if(response?.status!==429||attempt===maxAttempts)
   throw Error(league.sport+" partner endpoint HTTP "+response?.status+
    " after "+attempt+" attempts");
  // Don't hammer provider rate limits. The cap protects the 9 AM capture
  // window; the result must still be truly observed at the retry time.
  const hint=Number(response.headers?.get?.("retry-after"));
  const pauseMs=Math.max(15000,Math.min(120000,Number.isFinite(hint)&&hint>0?
   hint*1000:15000*Math.pow(2,attempt-1)));
  console.error(league.sport+" provider rate limited; bounded retry "+attempt+
   "/"+maxAttempts+" after "+Math.ceil(pauseMs/1000)+" seconds");
  await pause(pauseMs);
 }
 throw Error(league.sport+" partner source retries exhausted");
}
function collectionRequirementsFor(league,slot){
 if(slot==="manual"&&league?.sport==="NFL")
  return {...league,minimumRows:1};
 return league;
}
function existingMorningSlot(dir,slot,root=ROOT){
 if(!fs.existsSync(dir))return null;
 for(const name of fs.readdirSync(dir).sort().reverse()){
  const p=path.join(dir,name,"manifest.json");
  if(!fs.existsSync(p))continue;
  try{
   const m=JSON.parse(fs.readFileSync(p,"utf8"));
   const local=pacificClock(new Date(m.captureStartedUTC));
   const finish=pacificClock(new Date(m.captureFinishedUTC));
   if(m.captureSlotPacific===slot&&m.pacificDate===local.day&&
    local.hour===Number(slot.slice(0,2))&&finish.day===local.day&&
    finish.hour===local.hour&&m.actualCaptureInRequestedHour===true&&
    m.completePagination===true&&m.hasBelowMorningMinimumInventory!==true&&
    ["NHL","NFL"].every(s=>m.sports?.some(x=>x.sport===s&&
       Number.isInteger(x.rawCount)&&x.rawCount>0&&
       x.belowMorningMinimumInventory!==true)))
    return {archiveDir:path.relative(root,path.dirname(p)),capturedAt:m.captureFinishedUTC};
  }catch{}
 }
 return null;
}
async function collect({now=new Date(),client=fetch,slot=process.env.PARTNER_CAPTURE_SLOT||"manual",
 root=ROOT}={}){
 const clock=pacificClock(now),started=new Date().toISOString();
 if(!["06:00","09:00","manual"].includes(slot))throw Error("Unknown private partner capture slot");
 if(slot!=="manual"&&clock.hour!==Number(slot.slice(0,2)))throw Error("Actual Pacific time outside requested morning capture hour");
 const dir=path.join(root,"outputs/manual-board-captures",clock.day);
 if(slot!=="manual"){
  const prior=existingMorningSlot(dir,slot,root);
  if(prior)return {status:"already_complete_morning_snapshot",slotPacific:slot,...prior,
   newProviderCalls:0,noRawPublicData:true};
 }
 const results=[];
 for(const league of LEAGUES)results.push(await fetchLeague(
  collectionRequirementsFor(league,slot),{client}));
 const finished=new Date().toISOString(),endClock=pacificClock(new Date(finished));
 if(slot!=="manual"&&(endClock.hour!==Number(slot.slice(0,2))||endClock.day!==clock.day))
  throw Error("Capture completed after 09 Pacific hour; do not certify original 9 AM");
 const stamp=finished.slice(0,19).replace(/[-:]/g,"")+"Z";
 const destination=path.join(dir,stamp);
 if(fs.existsSync(destination))throw Error("Append-only source archive already exists");
 fs.mkdirSync(destination,{recursive:true});
 const sports=[];
 for(const r of results){
  const parts=Math.ceil(r.rows.length/1000);
  sports.push({sport:r.sport,leagueId:r.leagueId,source:r.url,
   rawCount:r.rows.length,normalizedCount:r.rows.length,players:r.players,
   games:r.games,missingPlayers:0,missingGames:0,sourceObservedAt:r.receivedAt,parts,
   belowMorningMinimumInventory:r.sport==="NFL"&&r.rows.length<1000});
  for(let i=0;i<parts;i++){
   const part={sport:r.sport,startIndex:i*1000,observedAtUTC:r.receivedAt,
    rows:r.rows.slice(i*1000,(i+1)*1000)};
   fs.writeFileSync(path.join(destination,r.sport.toLowerCase()+"-"+String(i+1).padStart(2,"0")+".json"),
    JSON.stringify(part)+"\n",{flag:"wx"});
  }
 }
 const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",
  kind:"actual_time_private_partner_offer_observations",captureStartedUTC:started,
  captureFinishedUTC:finished,pacificDate:clock.day,snapshotMode:"direct_live_board",
  sourceAuthenticatedFirstParty:false,officialPlatformSettlementVerified:false,
  notSixOrNineAmSlot:slot==="manual",completePagination:true,originalSourceRawResponseStored:false,
  captureSlotPacific:slot==="manual"?null:slot,
  actualCaptureInRequestedHour:slot!=="manual"&&clock.hour===Number(slot.slice(0,2))&&
   endClock.hour===Number(slot.slice(0,2)),
  noOriginalSixAmObservation:slot!=="06:00",columns:COLUMNS,sports,
  hasBelowMorningMinimumInventory:sports.some(x=>x.belowMorningMinimumInventory),
  note:"HTTP-observed partner data. Public runner processes only inside private checkout. Actual Pacific 06:xx/09:xx if requested; NOT an exact minute, not an authenticated original app offer, and two complete morning archives must exist before valid paired comparison."};
 fs.writeFileSync(path.join(destination,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
 return {status:"saved_private_only",archiveDir:path.relative(root,destination),
  capturedAt:finished,actualCaptureInRequestedHour:manifest.actualCaptureInRequestedHour,
  counts:Object.fromEntries(results.map(r=>[r.sport,r.rows.length])),
  completePagination:true,originalPlatformVerified:false,
  sourceEndpoint:"partner-api.prizepicks.com",rawPublicWrites:0,
  nflInventoryBelowMorningMinimum:results.some(x=>x.sport==="NFL"&&x.rows.length<1000)};
}
async function main(){
 const result=await collect();
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,"status="+result.status+"\n");
  if(result.archiveDir)fs.appendFileSync(process.env.GITHUB_OUTPUT,"archive_dir="+result.archiveDir+"\n");
 }
}
if(require.main===module)main().catch(e=>{console.error("Private capture failed: "+e.message);process.exitCode=1;});
module.exports={LEAGUES,pacificClock,toRows,fetchLeague,collect,collectionRequirementsFor,existingMorningSlot};
