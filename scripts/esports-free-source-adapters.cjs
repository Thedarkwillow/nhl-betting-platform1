"use strict";
// Source-native evidence only. No guessing player identity, map ordinal, original prop line or platform settlement.
// OpenDota: https://opendota.apidocumentation.com/
// PandaScore: https://developers.pandascore.co/docs/plan-reference
// GRID: https://grid.helpjuice.com/how-do-i-use-the-central-data-api
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {decodeOpenDota}=require("../src/esports-research-v1.cjs");
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const id=x=>Number.isSafeInteger(x)&&x>0;
const cnt=x=>Number.isSafeInteger(x)&&x>=0;
const text=x=>typeof x==="string"&&x.length>0&&x.length<=200;
const at=x=>typeof x==="string"&&/(Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const iso=x=>new Date(x).toISOString();
const pause=()=>new Promise(r=>setTimeout(r,1100));
const prefixes={CS2:"csgo",VALORANT:"valorant",LOL:"lol",DOTA2:"dota2",COD:"codmw"};
const slug={CS2:["cs-go","csgo","counter-strike","counter-strike-2","cs2"],VALORANT:["valorant"],LOL:["league-of-legends","lol"],DOTA2:["dota-2","dota2"],COD:["cod-mw","codmw","call-of-duty-modern-warfare","call-of-duty"]};
async function request(url,options={},client=fetch){
 const r=await client(url,{...options,redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!r.ok){const e=Error("http");e.status=r.status;throw e;}
 if(!r.body||!(r.headers.get("content-type")||"").toLowerCase().includes("json"))throw Error("not JSON");
 const reader=r.body.getReader(),parts=[];let n=0;
 try{for(;;){const q=await reader.read();if(q.done)break;n+=q.value.length;if(n>6_000_000){await reader.cancel();throw Error("response bound");}parts.push(Buffer.from(q.value));}}finally{reader.releaseLock();}
 const raw=Buffer.concat(parts);return {data:JSON.parse(raw.toString("utf8")),digest:sha(raw)};
}
const failure=e=>Number.isInteger(e.status)?"http_"+e.status:"contract_or_network_failure";
function dotaIndex(x,now){
 if(!id(x?.match_id)||!id(x.start_time)||!id(x.duration)||x.duration<600||x.duration>14400||!id(x.leagueid)||!id(x.radiant_team_id)||!id(x.dire_team_id)||x.radiant_team_id===x.dire_team_id||typeof x.radiant_win!=="boolean"||!cnt(x.radiant_score)||!cnt(x.dire_score)||x.radiant_score+x.dire_score<=0||1000*(x.start_time+x.duration)>now)return null;
 return {provider:"opendota",title:"DOTA2",providerGameId:String(x.match_id),providerSeriesId:id(x.series_id)?String(x.series_id):null,providerSeriesType:cnt(x.series_type)?x.series_type:null,leagueId:String(x.leagueid),startAt:iso(x.start_time*1000),endAt:iso((x.start_time+x.duration)*1000),durationSeconds:x.duration,teamIds:[String(x.radiant_team_id),String(x.dire_team_id)],teamScores:[x.radiant_score,x.dire_score],winnerTeamId:String(x.radiant_win?x.radiant_team_id:x.dire_team_id),providerReportedFinal:true,mapOrdinal:null,originalOfferMatched:false};
}
function dotaDetail(x,index,now){
 const actual=dotaIndex(x,now);
 if(!actual||actual.providerGameId!==index.providerGameId||actual.providerSeriesId!==index.providerSeriesId||actual.leagueId!==index.leagueId||actual.startAt!==index.startAt||actual.endAt!==index.endAt||JSON.stringify(actual.teamIds)!==JSON.stringify(index.teamIds)||JSON.stringify(actual.teamScores)!==JSON.stringify(index.teamScores)||actual.winnerTeamId!==index.winnerTeamId)throw Error("index/detail disagreement");
 const rows=decodeOpenDota(x);
 if(rows.length!==10||!x.players.every(p=>id(p.hero_id)&&[0,1,2,3,4,128,129,130,131,132].includes(p.player_slot)&&p.account_id!==4294967295))throw Error("player roster");
 return {game:index,players:rows.map(r=>({...r,providerSeriesId:index.providerSeriesId,providerSeriesType:index.providerSeriesType,providerReportedFinal:true,observedAt:iso(now),sourceRef:"https://api.opendota.com/api/matches/"+index.providerGameId,identityVerified:false,mapIndex:null,propMatchEligible:false}))};
}
function pandaFixture(x,title,now){
 if(!id(x?.id)||!prefixes[title]||!Array.isArray(x.opponents)||x.opponents.length!==2||x.opponents.some(t=>t?.type!=="Team"||!id(t.opponent?.id))||x.opponents[0].opponent.id===x.opponents[1].opponent.id)return null;
 if(x.videogame?.slug&&!slug[title].includes(x.videogame.slug))return null;
 if(!["not_started","running","finished","canceled","postponed"].includes(x.status))return null;
 const teams=x.opponents.map(t=>String(t.opponent.id)),start=at(x.begin_at||x.scheduled_at),end=at(x.end_at);
 if(start===null)return null;
 const score=Array.isArray(x.results)?x.results.filter(q=>id(q.team_id)&&teams.includes(String(q.team_id))&&cnt(q.score)).map(q=>({teamId:String(q.team_id),score:q.score})):[],winner=id(x.winner_id)&&teams.includes(String(x.winner_id))?String(x.winner_id):null;
 const final=x.status==="finished"&&end!==null&&end>=start&&end<=now&&winner!==null&&score.length===2&&new Set(score.map(q=>q.teamId)).size===2&&score.find(q=>q.teamId===winner).score>score.find(q=>q.teamId!==winner).score&&x.forfeit===false;
 return {provider:"pandascore",title,providerSeriesId:String(x.id),scheduledStartAt:iso(start),endAt:end===null?null:iso(end),teamIds:teams,tournamentId:id(x.tournament_id)?String(x.tournament_id):null,status:x.status,bestOf:id(x.number_of_games)?x.number_of_games:null,results:score,winnerTeamId:winner,providerReportedFinal:final,mapPlayerStatsAvailable:false,originalOfferMatched:false};
}
function gridSeries(x){
 const title=x?.title?.nameShortened?.trim().toLowerCase(),sport=Object.keys(slug).filter(k=>k!=="COD").find(k=>slug[k].includes(title)|| (k==="CS2"&&["counter-strike 2","counter strike 2","cs:go"].includes(title))||(k==="LOL"&&title==="league of legends")||(k==="DOTA2"&&["dota 2","dota"].includes(title)))||null;
 if(!sport||!text(x.id)||at(x.startTimeScheduled)===null||!Array.isArray(x.teams)||x.teams.length!==2||x.teams.some(t=>!text(t.baseInfo?.id))||x.teams[0].baseInfo.id===x.teams[1].baseInfo.id)return null;
 return {provider:["LOL","VALORANT"].includes(sport)?"riot_grid":"grid",title:sport,providerSeriesId:x.id,scheduledStartAt:iso(at(x.startTimeScheduled)),teamIds:x.teams.map(t=>t.baseInfo.id),teamNames:x.teams.map(t=>text(t.baseInfo.name)?t.baseInfo.name:null),providerTitleId:text(x.title.id)?x.title.id:null,tournamentId:text(x.tournament?.id)?x.tournament.id:null,originalOfferMatched:false};
}
function gridState(x,fixture){
 if(x?.id!==fixture.providerSeriesId||x.valid===false||x.started!==true||x.finished!==true||!Array.isArray(x.teams)||x.teams.length!==2||!Array.isArray(x.games)||!x.games.length||x.games.length>7)throw Error("series not final");
 if(JSON.stringify(x.teams.map(t=>t.id).sort())!==JSON.stringify([...fixture.teamIds].sort())||x.teams.filter(t=>t.won===true).length!==1)throw Error("series team mismatch");
 const games=[],ordinals=new Set(),gameIds=new Set();
 for(const g of x.games){
  if(!Array.isArray(g.teams)||g.teams.length!==2||JSON.stringify(g.teams.map(t=>t.id).sort())!==JSON.stringify([...fixture.teamIds].sort()))throw Error("game team mismatch");
  const players=g.teams.flatMap(t=>{
   if(!Array.isArray(t.players)||t.players.length!==5)throw Error("roster");
   return t.players.map(p=>{
    if(!text(p.id)||!cnt(p.kills)||!cnt(p.deaths))throw Error("stats");
    return {providerPlayerId:p.id,providerPlayerName:text(p.name)?p.name:null,providerTeamId:t.id,kills:p.kills,deaths:p.deaths};
   });
  });
  if(new Set(players.map(p=>p.providerPlayerId)).size!==10)throw Error("player conflict");
  const ordinal=g.sequenceNumber,gameId=text(g.id)?g.id:null;
  if(ordinal!==undefined&&(!id(ordinal)||ordinal>7||ordinals.has(ordinal)))throw Error("native map ordinal conflict");
  if(ordinal!==undefined)ordinals.add(ordinal);
  if(gameId&&gameIds.has(gameId))throw Error("native game ID conflict");
  if(gameId)gameIds.add(gameId);
  const winners=g.teams.filter(t=>t.won===true);
  const nativeFinal=x.valid===true&&g.started===true&&g.finished===true&&winners.length===1&&g.teams.every(t=>typeof t.won==="boolean")&&!!gameId&&id(ordinal);
  // Keep source-native ordinal and final distinct from independent platform/identity verification.
  games.push({providerGameId:gameId,providerMapOrdinal:id(ordinal)?ordinal:null,providerReportedGameFinal:nativeFinal,providerWinnerTeamId:nativeFinal?winners[0].id:null,mapOrdinal:null,individualGameFinalVerified:false,players});
 }
 if(ordinals.size&& (ordinals.size!==games.length||games.some((_,i)=>!ordinals.has(i+1))))throw Error("incomplete native map ordinal sequence");
 return {fixture,providerReportedSeriesFinal:true,winnerTeamId:x.teams.find(t=>t.won===true).id,games,originalOfferMatched:false};
}
function previousIds(root){
 const ids=new Set(),d=path.join(root,"research/esports-free-providers");
 if(!fs.existsSync(d))return ids;
 for(const f of fs.readdirSync(d).filter(s=>/^\d+-\d+\.json$/.test(s)).sort().slice(-90)){
  try{const p=path.join(d,f);if(fs.statSync(p).size>8_000_000||fs.lstatSync(p).isSymbolicLink())continue;const x=JSON.parse(fs.readFileSync(p,"utf8"));if(x.kind!=="restricted_esports_free_provider_observations_v1")continue;
   for(const g of x.opendota?.games||[])if(text(g.game?.providerGameId))ids.add(g.game.providerGameId);
  }catch{}
 }
 return ids;
}
async function collectDota(root,client=fetch){
 const report={provider:"OpenDota",requests:0,indexRecords:0,seriesIdRecords:0,completeGames:0,playerRecords:0,skippedArchived:0,failedDetails:0,verifiedMapOrdinals:0,status:"unavailable"},data={index:[],games:[],sourceDigests:[]};
 try{
  report.requests++;const q=await request("https://api.opendota.com/api/proMatches",{},client);
  if(!Array.isArray(q.data)||q.data.length>100)throw Error("index");
  const now=Date.now(),seen=new Set();
  for(const x of q.data){const r=dotaIndex(x,now);if(!r||seen.has(r.providerGameId))continue;seen.add(r.providerGameId);data.index.push(r);}
  // One bounded backward index page; do not infer map order from an incomplete listing.
  if(q.data.length&&q.data.every(x=>id(x.match_id))){
   const cursor=Math.min(...q.data.map(x=>x.match_id));await pause();report.requests++;
   try{const z=await request("https://api.opendota.com/api/proMatches?less_than_match_id="+cursor,{},client);
    if(!Array.isArray(z.data)||z.data.length>100||z.data.some(x=>!id(x.match_id)||x.match_id>=cursor))throw Error("pagination");
    for(const x of z.data){const r=dotaIndex(x,now);if(!r||seen.has(r.providerGameId))continue;seen.add(r.providerGameId);data.index.push(r);}
    data.sourceDigests.push({endpoint:"proMatches_backfill",sha256:z.digest});report.backfillIndex="read";
   }catch(e){report.backfillIndex=failure(e);if([401,403,429].includes(e.status)){report.status=failure(e);return {report,data};}}
  }
  const groups=new Map();
  for(const x of data.index)if(x.providerSeriesId){const k=x.leagueId+"|"+x.providerSeriesId;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
  let ordered=0,ambiguous=0;
  for(const a of groups.values()){
   a.sort((x,y)=>Date.parse(x.startAt)-Date.parse(y.startAt));
   const teams=new Set(a.map(x=>JSON.stringify([...x.teamIds].sort())));
   if(a.length<2)continue;
   if(teams.size!==1||new Set(a.map(x=>x.providerSeriesType)).size!==1||a.some((x,i)=>i&&Date.parse(a[i-1].endAt)>Date.parse(x.startAt))){ambiguous++;continue;}
   ordered++;
  }
  report.chronologicalSeriesCandidates=ordered;report.ambiguousSeries=ambiguous;
  report.indexRecords=data.index.length;report.seriesIdRecords=data.index.filter(r=>r.providerSeriesId).length;data.sourceDigests.push({endpoint:"proMatches",sha256:q.digest});
  const {archive:reviewArchive,choose}=require("./dota-series-archive-review.cjs");
  const prior=previousIds(root),review=reviewArchive(root);
  report.skippedArchived=data.index.filter(x=>prior.has(x.providerGameId)).length;
  const union=new Map(review.index);
  for(const x of data.index){
   const old=union.get(x.providerGameId);
   if(!review.bad.has(x.providerGameId)&&(!old||JSON.stringify(old)===JSON.stringify(x)))union.set(x.providerGameId,x);
   else union.delete(x.providerGameId);
  }
  const selected=choose(union.values(),prior,8);
  report.selectedOlderSeriesGames=selected.filter(x=>!data.index.some(y=>x.providerGameId===y.providerGameId)).length;
  for(const x of selected){
   if(!data.index.some(y=>y.providerGameId===x.providerGameId))data.index.push(x);
   await pause();report.requests++;
   try{
    const r=await request("https://api.opendota.com/api/matches/"+x.providerGameId,{},client);
    const game=dotaDetail(r.data,x,Date.now());data.games.push({...game,sourceDocumentSha256:r.digest});
   }catch(e){report.failedDetails++;if([401,403,429].includes(e.status)){report.status=failure(e);return {report,data};}}
  }
  report.status=data.games.length?"completed_native_statistics":data.index.length?"index_only":"no_valid_index_records";
 }catch(e){report.status=failure(e);}
 finally{report.completeGames=data.games.length;report.playerRecords=data.games.reduce((n,g)=>n+g.players.length,0);}
 return {report,data};
}
async function collectPanda(env,client=fetch){
 const key=env.PANDASCORE_API_KEY||env.PANDASCORE_TOKEN||env.PANDASCORE,allowed=env.PANDASCORE_BETTING_DATA_AUTHORIZED==="1"&&env.PANDASCORE_NO_CHARGE_CONFIRMED==="1";
 const report={provider:"PandaScore",credentialConfigured:!!key,authorizedNoCharge:allowed,requests:0,fixtures:0,providerReportedFinals:0,bySport:{},status:"not_called"};
 const data={fixtures:[],sourceDigests:[]};
 if(!key||!allowed){report.status=!key?"missing_credential":"awaiting_permitted_no_charge_access";return {report,data};}
 for(const [title,prefix] of Object.entries(prefixes)){
  const counts={upcoming:0,past:0,providerReportedFinals:0};report.bySport[title]=counts;
  for(const phase of ["upcoming","past"]){
   if(report.requests)await pause();report.requests++;
   try{
    const q=await request("https://api.pandascore.co/"+prefix+"/matches/"+phase+"?per_page=20",{headers:{Authorization:"Bearer "+key,Accept:"application/json"}},client);
    if(!Array.isArray(q.data)||q.data.length>20)throw Error("fixture list");
    const seen=new Set();for(const x of q.data){const f=pandaFixture(x,title,Date.now());if(!f||seen.has(f.providerSeriesId))continue;seen.add(f.providerSeriesId);data.fixtures.push(f);counts[phase]++;counts.providerReportedFinals+=Number(f.providerReportedFinal);}
    data.sourceDigests.push({title,phase,sha256:q.digest});
   }catch(e){counts[phase+"Error"]=failure(e);if([401,403,429].includes(e.status)){report.status=failure(e);report.fixtures=data.fixtures.length;report.providerReportedFinals=data.fixtures.filter(f=>f.providerReportedFinal).length;return {report,data};}}
  }
 }
 report.fixtures=data.fixtures.length;report.providerReportedFinals=data.fixtures.filter(f=>f.providerReportedFinal).length;report.status=report.fixtures?"fixtures_collected":"no_verified_fixtures";
 return {report,data};
}
// Official title IDs: https://grid.helpjuice.com/what-are-the-ids-that-we-can-use-for-the-test-loop-series
const gridTitles=[["CS2","28"],["DOTA2","2"],["VALORANT","6"],["LOL","3"]];
function gridHistoryPlan(root,now){
 let last=null;const done=new Set(),attempted=new Set();
 if(root){
  const dir=path.join(root,"research/esports-free-providers");
  if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(s=>/^\d+-\d+\.json$/.test(s)).sort((a,b)=>{const [ar,aa]=a.split("-").map(parseFloat),[br,ba]=b.split("-").map(parseFloat);return ar-br||aa-ba;}).slice(-90)){
   try{const file=path.join(dir,name);if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>8_000_000)continue;
    const x=JSON.parse(fs.readFileSync(file,"utf8"));if(x.kind!=="restricted_esports_free_provider_observations_v1")continue;
    const g=x.grid||{},p=g.queryPlan;
    if(p&&gridTitles.some(([t,i])=>t===p.title&&i===p.titleId)&&Number.isInteger(p.week)&&p.week>=0&&p.week<52)last=p;
    for(const f of g.finals||[])if(f.providerReportedSeriesFinal===true&&text(f.fixture?.providerSeriesId))done.add(f.fixture.providerSeriesId);
    for(const s of g.attemptedSeriesIds||[])if(text(s))attempted.add(s);
   }catch{}
  }
 }
 const pos=last?gridTitles.findIndex(([t])=>t===last.title):-1,next=(pos+1)%gridTitles.length,week=last?(next===0?(last.week+1)%52:last.week):0,[title,titleId]=gridTitles[next],end=now-6*3600000-week*7*86400000;
 return {queryPlan:{title,titleId,week,from:iso(end-7*86400000),to:iso(end)},done,attempted};
}
async function collectGrid(env,client=fetch,root=null){
 const key=env.GRID_API_KEY||env.RIOT_GRID_API_KEY||env.GRID,allowed=env.GRID_BETTING_DATA_AUTHORIZED==="1"&&env.GRID_NO_CHARGE_CONFIRMED==="1";
 const report={provider:"GRID",credentialConfigured:!!key,authorizedNoCharge:allowed,requests:0,fixtures:0,finalSeries:0,playerGameRows:0,providerFinalMaps:0,bySport:{},status:"not_called"},data={fixtures:[],finals:[],sourceDigests:[]};
 if(!key||!allowed){report.status=!key?"missing_credential":"awaiting_permitted_no_charge_access";return {report,data};}
 const headers={"x-api-key":key,"Content-Type":"application/json",Accept:"application/json"};
 const query=async (url,query)=>{report.requests++;const q=await request(url,{method:"POST",headers,body:JSON.stringify({query})},client);if(q.data?.errors?.length||!q.data?.data)throw Error("graphql");return {data:q.data.data,digest:q.digest};};
 try{
  const now=Date.now(),{queryPlan,done,attempted}=gridHistoryPlan(root,now),{titleId,from,to}=queryPlan;
  data.queryPlan=queryPlan;data.attemptedSeriesIds=[];report.queryPlan=queryPlan;
  const q=await query("https://api-op.grid.gg/central-data/graphql",`query { allSeries(first:20,filter:{titleId:"${titleId}",startTimeScheduled:{gte:"${from}",lte:"${to}"}},orderBy:StartTimeScheduled){ edges { node { id startTimeScheduled title { id nameShortened } teams { baseInfo { id name } } tournament { id name } } } } }`);
  if(!Array.isArray(q.data.allSeries?.edges)||q.data.allSeries.edges.length>20)throw Error("fixture list");
  const seen=new Set();for(const e of q.data.allSeries.edges){const f=gridSeries(e.node);if(f&&f.title===queryPlan.title&&f.providerTitleId===titleId&&f.providerSeriesId!==titleId&&at(f.scheduledStartAt)>=at(from)&&at(f.scheduledStartAt)<=at(to)&&!seen.has(f.providerSeriesId)){seen.add(f.providerSeriesId);data.fixtures.push(f);}}
  data.sourceDigests.push({endpoint:"central-data",sha256:q.digest});
  const past=data.fixtures.filter(x=>!done.has(x.providerSeriesId)).sort((a,b)=>Number(attempted.has(a.providerSeriesId))-Number(attempted.has(b.providerSeriesId))||Date.parse(b.scheduledStartAt)-Date.parse(a.scheduledStartAt));
  for(const f of past.slice(0,2)){
   data.attemptedSeriesIds.push(f.providerSeriesId);
   await pause();
   const s=await query("https://api-op.grid.gg/live-data-feed/series-state/graphql",`query { seriesState(id:${JSON.stringify(f.providerSeriesId)}) { id valid started finished teams { id name won } games { id sequenceNumber started finished teams { id won players { id name kills deaths } } } } }`);
   if(s.data.seriesState?.finished!==true)continue;
   const final=gridState(s.data.seriesState,f);data.finals.push({...final,sourceDocumentSha256:s.digest});
  }
  report.status=data.fixtures.length?"fixture_and_state_check_completed":"no_supported_series";
 }catch(e){report.status=failure(e);}
 finally{report.fixtures=data.fixtures.length;report.finalSeries=data.finals.length;report.playerGameRows=data.finals.reduce((n,f)=>n+f.games.reduce((s,g)=>s+g.players.length,0),0);report.providerFinalMaps=data.finals.flatMap(f=>f.games).filter(g=>g.providerReportedGameFinal).length;for(const title of ["CS2","DOTA2","LOL","VALORANT"]){const finals=data.finals.filter(f=>f.fixture.title===title);report.bySport[title]={fixtures:data.fixtures.filter(f=>f.title===title).length,finalSeries:finals.length,providerFinalMaps:finals.flatMap(f=>f.games).filter(g=>g.providerReportedGameFinal).length};}}
 return {report,data};
}
async function main(){
 const root=fs.realpathSync(process.argv[2]),dest=process.argv[3];
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git"))||process.env.RESTRICTED_DESTINATION_VERIFIED!=="1"||!dest||path.dirname(path.resolve(dest))!==path.resolve(process.env.RUNNER_TEMP||"."))throw Error("private destination required");
 // Independent providers may run concurrently; each provider retains its own bounded rate and refusal gates.
 const [d,p,g]=await Promise.all([collectDota(root),collectPanda(process.env),collectGrid(process.env,fetch,root)]);
 const report={kind:"esports_free_provider_collection_v1",observedAt:iso(Date.now()),providers:[d.report,p.report,g.report],paidProviderEndpointsCalled:0,rawRowsPublished:0,originalOffersVerified:0,platformSettlementVerified:false,modelPromoted:false};
 if(d.data.index.length||p.data.fixtures.length||g.data.fixtures.length||g.data.queryPlan)fs.writeFileSync(dest,JSON.stringify({kind:"restricted_esports_free_provider_observations_v1",observedAt:report.observedAt,opendota:d.data,pandascore:p.data,grid:g.data,independentReviewVerified:false,propGradeEligible:false,publicationRightsVerified:false})+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{console.error("Free provider research failed closed");process.exitCode=1;});
module.exports={dotaIndex,dotaDetail,pandaFixture,gridSeries,gridState,collectPanda,collectGrid,gridHistoryPlan};
