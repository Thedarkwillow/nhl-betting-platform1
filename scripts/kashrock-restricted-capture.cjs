"use strict";
// Owner reports permission; restricted research archive, never public raw publication.
// Sandbox only, no tier changes. Two book-filtered pages and one schedule request per run.
const fs=require("node:fs"),path=require("node:path"),{read}=require("./kashrock-sandbox-prop-check.cjs");
const id=(x,p)=>typeof x==="string"&&x.startsWith(p)&&x.length<200;
const str=x=>typeof x==="string"&&x.trim()&&x.length<300;
const at=x=>typeof x==="string"&&/(Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const norm=x=>String(x||"").trim().toLowerCase().replace(/\s+/g," ");
const book=x=>String(x||"").toLowerCase().replace(/[^a-z]/g,"");
const count=x=>Number.isInteger(x)&&x>=0;
function marketScope(r){
 const m=/^CS2_(KILLS|HEADSHOTS|HEADSHOT_KILLS|DEATHS|ASSISTS|KILLS_ASSISTS|KILLS_PLUS_ASSISTS)_MAP(?:S)?_([1-5](?:_[1-5])*)$/.exec(r.stat_type||"");
 if(!m)return null;
 const map={KILLS:"kills",HEADSHOTS:"headshotKills",HEADSHOT_KILLS:"headshotKills",DEATHS:"deaths",ASSISTS:"assists",KILLS_ASSISTS:"killsPlusAssists",KILLS_PLUS_ASSISTS:"killsPlusAssists"},maps=m[2].split("_").map(Number);
 if(maps.some((x,i)=>i&&x<=maps[i-1]))return null;
 return {market:map[m[1]],maps};
}
const {parseProjectionToken}=require("./prizepicks-projection-token.cjs");
function selectionLink(r,k){
 if(k!=="prizepicks"||r.deeplink_level!=="selection"||typeof r.deeplink!=="string")return null;
 try{const u=new URL(r.deeplink);if(u.protocol!=="https:"||u.hostname!=="app.prizepicks.com"||u.username||u.password||u.port||u.searchParams.getAll("projections").length!==1)return null;const q=u.searchParams.get("projections");const side=["over","higher"].includes(r.direction)?"Higher":["under","lower"].includes(r.direction)?"Lower":null;return parseProjectionToken(q,side,r.line)?q:null;}catch{return null;}
}
function fixtureRows(doc,diagnostics={}){
 const a=Array.isArray(doc)?doc:Array.isArray(doc.matches)?doc.matches:Array.isArray(doc.data)?doc.data:Array.isArray(doc.data?.matches)?doc.data.matches:doc.kr_match_id?[doc]:doc.data?.kr_match_id?[doc.data]:doc.match?.kr_match_id?[doc.match]:[];
 if(a.length>100)throw Error("fixture bound");
 const map=new Map(),bad=new Set();
 const reject=k=>{diagnostics[k]=(diagnostics[k]||0)+1;};
 if(!a.length)reject("empty_or_unrecognized_envelope");
 for(const x0 of a){
  if(!x0||typeof x0!=="object"){reject("invalid_row");continue;}
  const x={...x0,team1:typeof x0.team1==="object"?x0.team1?.name:x0.team1,team2:typeof x0.team2==="object"?x0.team2?.name:x0.team2};
  if(!id(x.kr_match_id,"kr_cs2_")){reject("native_id_missing");continue;}
  if(!Number.isFinite(at(x.event_time))){reject("start_missing_or_invalid");continue;}
  if(!["not_started","upcoming","scheduled"].includes(x.status)){reject("not_verified_upcoming");continue;}
  if(!str(x.team1)||!str(x.team2)||norm(x.team1)===norm(x.team2)){reject("team_pair_missing_or_invalid");continue;}
  if(map.has(x.kr_match_id)){bad.add(x.kr_match_id);reject("duplicate_native_id");continue;}
  map.set(x.kr_match_id,{matchId:x.kr_match_id,team1:x.team1,team2:x.team2,team1Id:id(x.team1_id,"kr_tm_")?x.team1_id:null,team2Id:id(x.team2_id,"kr_tm_")?x.team2_id:null,startAt:x.event_time,bestOf:Number.isInteger(x.best_of)?x.best_of:null});
 }
 for(const k of bad)map.delete(k);return map;
}
function normalize(doc,target,fixtures,observedAt){
 if(doc?.sport!=="cs2"||doc.source!=="kashrock"||doc.is_demo===true)throw Error("source envelope");
 const now=at(observedAt),groups=doc.groups;
 if(!Array.isArray(groups)||groups.length>100)throw Error("group bound");
 const ages=new Map((Array.isArray(doc.books)?doc.books:[]).filter(x=>count(x.age_s)).map(x=>[book(x.book),x.age_s]));
 const out=[],seen=new Set(),reasons={};let raw=0;
 const reject=k=>{reasons[k]=(reasons[k]||0)+1;};
 for(const g of groups){
  if(!Array.isArray(g.dfs)||g.dfs.length>200)continue;
  for(const r of g.dfs){
   if(book(r.book_name||r.book)!==target)continue;raw++;
   const age=count(r.age_s)?r.age_s:ages.get(target);
   const sc=marketScope(r),dir=["over","higher"].includes(r.direction)?"Higher":["under","lower"].includes(r.direction)?"Lower":null;
   const pid=g.canonical_player_id??r.canonical_player_id,ev=g.event_id??r.event_id,mid=g.kr_match_id??r.kr_match_id;
   const clock=g.event_time??r.event_time,team=g.team??r.team,opp=g.opponent??r.opponent;
   if(!count(age)||age>900||!Number.isFinite(now)||at(clock)<=now+900000||!Number.isFinite(at(clock))||!str(g.player_name)||!str(team)||!str(opp)||norm(team)===norm(opp)||!id(r.propId,"kr_prop_")||!id(pid,"kr_pl_")||!str(ev)||!sc||!dir||!Number.isFinite(r.line)||r.line<0||!Number.isInteger(r.line*2)||g.stat_type!==r.stat_type){reject("stale_or_missing_contract");continue;}
   if((r.event_id&&r.event_id!==ev)||(r.canonical_player_id&&r.canonical_player_id!==pid)||(r.kr_match_id&&r.kr_match_id!==mid)){reject("group_conflict");continue;}
   const key=JSON.stringify([target,ev,pid,r.stat_type,r.line,dir]);if(seen.has(key)){reject("duplicate");continue;}seen.add(key);
   const f=fixtures.get(mid),fixtureMatch=!!f&&at(f.startAt)===at(clock)&&JSON.stringify([norm(f.team1),norm(f.team2)].sort())===JSON.stringify([norm(team),norm(opp)].sort());
   out.push({provider:"KashRock",book:target,providerPropId:r.propId,providerOfferId:str(r.offerId)?r.offerId:null,providerPlayerId:pid,providerEventId:ev,providerMatchId:id(mid,"kr_cs2_")?mid:null,player:g.player_name,team,opponent:opp,...sc,line:r.line,side:dir,startAt:clock,observedAt,sourceAgeSeconds:age,originalSelectionIdCandidate:selectionLink(r,target),sourceFixtureMatched:fixtureMatch,originalOfferVerified:false,independentPlayerIdentityVerified:false,scoringRulesVerified:false,bettingEligible:false});
  }
 }
 return {rows:out,raw,reasons,hasMore:doc.has_more===true};
}
async function main(){
 const dest=process.argv[2],temp=process.env.RUNNER_TEMP;
 if(!dest||!temp||path.dirname(path.resolve(dest))!==path.resolve(temp)||process.env.RESTRICTED_DESTINATION_VERIFIED!=="1")throw Error("restricted output");
 const key=process.env.KASHROCK_API_KEY,report={kind:"kashrock_restricted_capture_v1",credentialConfigured:!!key,ownerPermissionReported:true,metaRequests:0,matchRequests:0,propRequests:0,documentedSandboxCredits:0,rows:0,byBook:{},sourceFixtureMatched:0,originalOffersVerified:0,rawRowsPublished:0,paidPlanRequests:0,platformSettlementVerified:false};
 if(!key){console.log(JSON.stringify(report));return;}
 try{
  report.metaRequests++;const m=await read("/v7/meta",key);
  if(String(m.doc.plan?.name??m.doc.plan).toLowerCase()!=="sandbox"){report.status="sandbox_not_verified";console.log(JSON.stringify(report));return;}
  const digests=[],rows=[];let fixtures=new Map(),refused=false;
  report.matchRequests++;report.documentedSandboxCredits+=2;report.fixtureSchemaReasons={};
  try{const q=await read("/v7/cs2/matches?status=upcoming&limit=100",key);fixtures=fixtureRows(q.doc,report.fixtureSchemaReasons);digests.push({endpoint:"matches",sha256:q.digest});}catch(e){report.fixtureError=e.status??"contract";if([401,402,403,429].includes(e.status)){console.log(JSON.stringify(report));return;}}
  report.fixtureRows=fixtures.size;
  for(const k of ["prizepicks","underdog"]){
   await new Promise(r=>setTimeout(r,6500));report.propRequests++;report.documentedSandboxCredits+=5;
   try{const q=await read("/v7/cs2/props?board=dfs&view=groups&book="+k+"&limit=100",key),observedAt=new Date().toISOString(),n=normalize(q.doc,k,fixtures,observedAt);rows.push(...n.rows);digests.push({endpoint:"props",book:k,sha256:q.digest,observedAt});report.byBook[k]={raw:n.raw,accepted:n.rows.length,sourceFixtureMatched:n.rows.filter(x=>x.sourceFixtureMatched).length,selectionIdCandidates:n.rows.filter(x=>x.originalSelectionIdCandidate).length,hasMore:n.hasMore,reasons:n.reasons};}
   catch(e){report.byBook[k]={error:e.status??"contract"};if([401,402,403,429].includes(e.status)){refused=true;break;}}
  }
  // Resolve at most six already-observed exact native match IDs when the list has no match.
  // Sandbox documented schedule endpoint; stop on any auth/quota/plan refusal.
  report.detailRequests=0;report.detailErrors={};
  const need=refused?[]:[...new Set(rows.filter(x=>!x.sourceFixtureMatched&&x.providerMatchId).map(x=>x.providerMatchId))].slice(0,6);
  for(const mid of need){
   await new Promise(r=>setTimeout(r,6500));report.detailRequests++;report.documentedSandboxCredits+=2;
   try{
    const q=await read("/v7/cs2/matches/"+encodeURIComponent(mid),key);
    const f=fixtureRows(q.doc,report.fixtureSchemaReasons).get(mid);
    digests.push({endpoint:"match_detail",sha256:q.digest});
    if(f)fixtures.set(mid,f);else {report.detailErrors.schema=(report.detailErrors.schema||0)+1;continue;}
   }catch(e){const k=e.status??"contract";report.detailErrors[k]=(report.detailErrors[k]||0)+1;if([401,402,403,429].includes(e.status))break;}
  }
  for(const x of rows){
   const f=fixtures.get(x.providerMatchId);
   x.sourceFixtureMatched=!!f&&at(f.startAt)===at(x.startAt)&&JSON.stringify([norm(f.team1),norm(f.team2)].sort())===JSON.stringify([norm(x.team),norm(x.opponent)].sort());
  }
  for(const k of Object.keys(report.byBook))if(Number.isInteger(report.byBook[k].accepted))report.byBook[k].sourceFixtureMatched=rows.filter(x=>x.book===k&&x.sourceFixtureMatched).length;
  report.fixtureRows=fixtures.size;
  report.rows=rows.length;report.sourceFixtureMatched=rows.filter(x=>x.sourceFixtureMatched).length;report.status=rows.length?"restricted_observations_collected":"no_accepted_rows";
  if(rows.length)fs.writeFileSync(dest,JSON.stringify({kind:"restricted_kashrock_source_observations_v1",ownerPermissionReported:true,publicationRightsIndependentlyVerified:false,observedAt:new Date().toISOString(),sourceDigests:digests,fixtures:[...fixtures.values()],rows,originalOffersVerified:false,platformSettlementVerified:false})+"\n",{flag:"wx",mode:0o600});
 }catch(e){report.status=e.status?"http_"+e.status:"contract_or_transport_failure";}
 console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{console.error("Restricted capture failed closed");process.exitCode=1;});
module.exports={normalize,fixtureRows,marketScope,selectionLink};
