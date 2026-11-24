"use strict";
/**
 * Pre-registered, source-faithful SOG line-movement evidence.
 * Two independently observed, COMPLETE private partner boards; no updated_at
 * reconstruction, no alternative ID stitching, no claims of platform execution.
 */
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {verifiedSlot,normalizeArchive}=require("./partner-prizepicks-board.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");

const ROOT=path.resolve(__dirname,".."),SOURCE="partner-api.prizepicks.com";
const dt=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const cap=(v,l,h)=>Math.max(l,Math.min(h,v));
const tag=p=>String(p?.projectionId||"");
const offered=a=>[...a].sort().join("|");
const clean=x=>String(x??"").trim().toLowerCase();
const minutes=72*60*60000;
function eligibleManifest(m){
 return m?.schemaVersion===1&&m.source===SOURCE&&
  m.snapshotMode==="direct_live_board"&&m.completePagination===true&&
  verifiedSlot(m)&&m.sports?.some(x=>x.sport==="NHL"&&x.rawCount>0&&
   x.parts>0&&x.source?.startsWith("https://partner-api.prizepicks.com/projections?"))&&
  Number.isFinite(dt(m.captureFinishedUTC));
}
function candidateArchives(currentRel,currentManifest,{root=ROOT,maxHours=72}={}){
 if(!eligibleManifest(currentManifest)||!Number.isFinite(maxHours)||maxHours>72||
  maxHours<1)throw Error("Current source archive is not a complete originally observed partner board");
 const currentAt=dt(currentManifest.sports.find(x=>x.sport==="NHL").sourceObservedAt),
  parent=path.join(root,"outputs/manual-board-captures"),out=[];
 const boundary=path.resolve(root,currentRel);
 if(!boundary.startsWith(parent+path.sep))throw Error("Source must be private archive");
 if(!fs.existsSync(parent))return [];
 for(const day of fs.readdirSync(parent)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  const fullDay=path.join(parent,day);
  if(!fs.statSync(fullDay).isDirectory())continue;
  for(const stamp of fs.readdirSync(fullDay)){
   if(!/^\d{8}T\d{6}Z$/.test(stamp))continue;
   const folder=path.join(fullDay,stamp);
   if(path.resolve(folder)===boundary)continue;
   const manifestPath=path.join(folder,"manifest.json");
   if(!fs.existsSync(manifestPath))continue;
   try{
    const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    if(!eligibleManifest(m))continue;
    const priorAt=dt(m.sports.find(x=>x.sport==="NHL").sourceObservedAt);
    if(!Number.isFinite(priorAt)||priorAt>=currentAt||
     currentAt-priorAt>maxHours*3600000||
     dt(m.captureFinishedUTC)>dt(currentManifest.captureStartedUTC))continue;
    out.push({rel:path.relative(root,folder),manifest:m,observedAt:priorAt});
   }catch{}
  }
 }
 // Pick THE latest complete preceding source observation independent of player;
 // no cherry-picking an earlier archive because its line happens to match.
 return out.sort((a,b)=>b.observedAt-a.observedAt||b.rel.localeCompare(a.rel));
}
function loadStoredNhl(rel,{root=ROOT,now}={}){
 const base=path.resolve(root,rel),prefix=path.join(root,"outputs/manual-board-captures")+path.sep;
 if(!base.startsWith(prefix))throw Error("Private source outside archive root");
 const manifest=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8"));
 if(!eligibleManifest(manifest))throw Error("Untrusted archived source");
 const entry=manifest.sports.find(x=>x.sport==="NHL"),parts=[];
 for(let i=1;i<=entry.parts;i++){
  parts.push(JSON.parse(fs.readFileSync(path.join(base,
   "nhl-"+String(i).padStart(2,"0")+".json"),"utf8")));
 }
 return normalizeArchive(manifest,parts,{sport:"NHL",now});
}
function firstGitAddition(rel,{root=ROOT}={}){
 const file=path.posix.join(rel.replaceAll(path.sep,"/"),"manifest.json");
 const args=["log","--diff-filter=A","-1","--format=%cI","--",file];
 try{return execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:12000}).trim();}
 catch{return "";}
}
function rowsById(rows){
 const map=new Map();
 for(const row of rows||[]){
  const id=tag(row);
  if(!id)continue;
  const group=map.get(id)||[];
  group.push(row);map.set(id,group);
 }
 return map;
}
function exactPair(p,currentRows,priorRows){
 if(!p||p.market!=="shotsOnGoal"||p.tier!=="Standard"||
   !tag(p)||!p.providerPlayerId||!p.gameId||!p.gameStartAt)
  return {status:"missing_exact_source_offer_identity"};
 if(!currentRows?.length)return {status:"current_offer_not_recovered_from_source"};
 if(!priorRows?.length)return {status:"same_provider_offer_id_absent_in_previous_observation"};
 const inspect=rows=>{
  const sides=new Set(rows.map(x=>x.side));
  if(rows.length!==sides.size||!rows.length||
    [...sides].some(s=>!["Higher","Lower"].includes(s))||
    rows.some(x=>x.tier!=="Standard"||x.period!=="Full game"||
      x.provider!==SOURCE||x.source!=="prizepicks_partner_direct"||
      !Number.isFinite(x.line)||!Number.isFinite(dt(x.capturedAt))||
      !Number.isFinite(dt(x.observedAt))||dt(x.observedAt)>dt(x.capturedAt)+60000||
      x.isLive!==false||Math.abs(dt(x.eventStartsAt)-dt(p.gameStartAt))>300000||
      clean(x.player)!==clean(p.player)||canonical(x.team)!==canonical(p.team)||
      canonical(x.matchup)!==canonical(p.opponent)||
      String(x.providerPlayerId||"")!==String(p.providerPlayerId)||
      tag(x)!==tag(p)||x.market!==rows[0].market||x.eventStartsAt!==rows[0].eventStartsAt||
      x.providerGameId!==rows[0].providerGameId||
      x.line!==rows[0].line))return null;
  return {sides:offered(sides),row:rows[0],line:rows[0].line};
 };
 const c=inspect(currentRows),a=inspect(priorRows);
 if(!a||!c||a.sides!==c.sides||c.row.market!==a.row.market||
   c.row.eventStartsAt!==a.row.eventStartsAt||
   c.row.providerGameId!==a.row.providerGameId||
   String(c.row.providerPlayerId)!==String(a.row.providerPlayerId)||
   c.row.team!==a.row.team||c.row.matchup!==a.row.matchup||
   clean(c.row.player)!==clean(a.row.player)||
   !["Higher","Lower"].includes(p.lean)||!c.sides.split("|").includes(p.lean)||
   c.line!==p.line)
   return {status:"ambiguous_or_changed_offer_identity_or_side_availability"};
 const delta=Number((c.line-a.line).toFixed(5));
 if(!Number.isFinite(delta)||Math.abs(delta)>10)
  return {status:"unsupported_line_delta"};
 return {status:"exact_pregame_same_offer_quote",sourceOfferId:tag(p),
  earlierLine:a.line,currentLine:c.line,deltaLine:delta,
  direction:delta>0?"increased":delta<0?"decreased":"unchanged",
  originalSides:c.sides.split("|"),
  currentSourceUpdatedAt:c.row.observedAt,earlierSourceUpdatedAt:a.row.observedAt,
  sourceUpdatedAtIsNotObservationTime:true};
}
function buildMovementContext(currentRel,currentBoard,{asOf,root=ROOT,firstCommit=firstGitAddition}={}){
 if(!Number.isFinite(dt(asOf))||currentBoard?.provider!==SOURCE||
   currentBoard?.snapshotMode!=="direct_live_board"||
   currentBoard?.completePagination!==true||currentBoard?.sourceStatus!=="fresh"||
   currentBoard?.sourceScope!=="full_provider_board")
  throw Error("Verified fresh full partner source required for movement");
 const currentRoot=path.resolve(root,currentRel),prefix=path.join(root,"outputs/manual-board-captures")+path.sep;
 if(!currentRoot.startsWith(prefix))throw Error("Archive outside private directory");
 const m=JSON.parse(fs.readFileSync(path.join(currentRoot,"manifest.json"),"utf8"));
 const options=candidateArchives(currentRel,m,{root});
 const now=dt(asOf),currentAt=dt(currentBoard.boardAsOfAt);
 const currentGit=firstCommit(currentRel,{root});
 const basic={kind:"nhl_standard_sog_exact_partner_source_movement_v1",
  source:SOURCE,currentArchive:currentRel,
  currentObservedAt:currentBoard.boardAsOfAt,firstGitCurrentAt:currentGit,
  sourceMovementIsPlatformAppAuthenticated:false,modelPromoted:false};
 const failed=status=>({...basic,status,matchFor:()=>({status})});
 if(!eligibleManifest(m)||currentAt!==dt(m.sports.find(x=>x.sport==="NHL").sourceObservedAt)||
   !Number.isFinite(dt(currentGit))||dt(currentGit)>now||dt(currentGit)<dt(m.captureFinishedUTC)-1500||
   currentAt>now||now-currentAt>30*60000)
  return failed("current_source_not_original_git_archived_before_freeze");
 if(!options.length)return failed("no_previous_complete_pregame_source_observation");
 const prior=options[0],priorGit=firstCommit(prior.rel,{root});
 if(!Number.isFinite(dt(priorGit))||dt(priorGit)>now||
   dt(priorGit)<dt(prior.manifest.captureFinishedUTC)-1500)
  return failed("previous_source_not_original_git_archived_before_freeze");
 let previousBoard;
 try{previousBoard=loadStoredNhl(prior.rel,{root,now:prior.manifest.captureFinishedUTC});}
 catch{return failed("prior_normalized_source_untrusted");}
 if(previousBoard.provider!==SOURCE||previousBoard.completePagination!==true||
   previousBoard.sourceScope!=="full_provider_board"||previousBoard.sourceStatus!=="fresh")
  return failed("prior_normalized_source_untrusted");
 const prevId=rowsById(previousBoard.rows),nextId=rowsById(currentBoard.rows);
 const meta={...basic,status:"ready_exact_match_only",previousArchive:prior.rel,
  previousObservedAt:prior.manifest.sports.find(x=>x.sport==="NHL").sourceObservedAt,
  firstGitPreviousAt:priorGit};
 return {...meta,matchFor:p=>{
  const start=dt(p?.gameStartAt);
  if(!Number.isFinite(start)||start-now<15*60000||
   start<=dt(currentGit)||start<=dt(priorGit)||
   dt(p?.capturedAt)!==currentAt)
   return {status:"not_future_original_pregame_selected_quote"};
  const quote=exactPair(p,nextId.get(tag(p)),prevId.get(tag(p)));
  if(quote.status!=="exact_pregame_same_offer_quote")return quote;
  return {...quote,provider:SOURCE,
   currentArchive:currentRel,previousArchive:prior.rel,
   currentObservedAt:meta.currentObservedAt,previousObservedAt:meta.previousObservedAt,
   currentFirstGitAt:currentGit,previousFirstGitAt:priorGit,
   latestPriorCompleteSourceChosen:true,notAppExecutionEvidence:true};
 }};
}
module.exports={eligibleManifest,candidateArchives,firstGitAddition,loadStoredNhl,rowsById,exactPair,buildMovementContext};
