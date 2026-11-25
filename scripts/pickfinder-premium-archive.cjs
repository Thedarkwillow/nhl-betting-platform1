"use strict";
// Validates a normalized authorized Premium browser export, not a browser/login implementation.
// No network, credentials, wagering, model inputs or first-party offer certification.
const fs=require("node:fs"),crypto=require("node:crypto");
const {pacific,WINDOWS}=require("./pacific-morning-capture-gate.cjs");
const BOOKS=new Set(["prizepicks","underdog"]);
const SPORTS=new Set(["nba","nfl","nhl","mlb","wnba","college-football","college-basketball","tennis","soccer","cs2","valorant","lol","dota2","cod"]);
const text=v=>typeof v==="string"&&v.trim().length>0&&v.length<=512;
const finite=v=>typeof v==="number"&&Number.isFinite(v);
function instant(v){
 if(typeof v!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v))throw Error("timestamp required");
 const t=new Date(v);if(!Number.isFinite(t.getTime()))throw Error("invalid timestamp");return t;
}
function inSlot(t,day,slot){const p=pacific(t);return p.day===day&&WINDOWS[String(p.hour)]===slot;}
// Profile/board metrics remain separate from the offer and never imply model probabilities.
function scopedResearch(fields,first,last,sport){
 if(fields===undefined)return [];
 if(!Array.isArray(fields)||fields.length>500)throw Error("research field contract");
 return fields.map(f=>{
  if(!f||!["board","profile","line_movement","prop_history"].includes(f.origin)||!text(f.tab)||!text(f.metric)||!text(f.scope))throw Error("research provenance required");
  const observed=instant(f.observedAt);
  if(observed<first||observed>last)throw Error("research observation outside attempt");
  const missing=f.value===null||f.value==="N/A";
  if(!missing&&!finite(f.value)&&!text(f.value))throw Error("research value contract");
  return {sport,origin:f.origin,tab:f.tab,metric:f.metric,scope:f.scope,period:text(f.period)?f.period:null,mapRange:text(f.mapRange)?f.mapRange:null,gameMode:text(f.gameMode)?f.gameMode:null,window:text(f.window)?f.window:null,unit:text(f.unit)?f.unit:null,observedAt:observed.toISOString(),value:missing?null:f.value,missingReason:missing?(f.value==="N/A"?"displayed_na":"missing"):null,modelInputsApproved:false};
 });
}
function normalize(input,{now=new Date()}={}){
 if(!input||input.schema!=="pickfinder-premium-export-v1"||!BOOKS.has(input.book)||!SPORTS.has(input.sport))throw Error("partition contract");
 if(!/^\d{4}-\d\d-\d\d$/.test(input.localDay)||!["06:00","09:00","manual"].includes(input.slot))throw Error("slot required");
 if(!Array.isArray(input.pages)||input.pages.length>500||!["populated","empty","disabled","partial"].includes(input.boardState))throw Error("page contract");
 const first=instant(input.startedAt),last=instant(input.endedAt);
 if(first>last||last>now)throw Error("attempt chronology");
 const links=new Set(),offers=new Map(),conflicts=new Set(),pageNumbers=new Set(),researchObservations=[],unpricedTierObservations=new Map();
 let appearances=0,unresolvedRows=0,wrongSport=0,crossHourRows=0;
 const unresolvedEvidence={legacyNoEvidence:0,bookBadgeMissing:0,tierWithoutExplicitPrice:0,bookBadgeWithoutExplicitPrice:0,ambiguousBookGroup:0,lineMissing:0};
 for(const page of input.pages){
  if(!Number.isInteger(page.number)||page.number<1||pageNumbers.has(page.number)||!Array.isArray(page.rows)||page.rows.length>500)throw Error("page shape");
  pageNumbers.add(page.number);
  for(const row of page.rows){
   appearances++;
   if(!row||row.sport!==input.sport){wrongSport++;continue;}
   if(!text(row.detailId)||!text(row.player)||!text(row.market)||!Array.isArray(row.apps)||row.apps.length>100){unresolvedRows++;continue;}
   const observed=instant(row.observedAt);
   if(observed<first||observed>last)throw Error("row outside attempt");
   links.add(row.detailId);
   for(const field of scopedResearch(row.research,first,last,input.sport))researchObservations.push({...field,detailId:row.detailId,player:row.player,market:row.market,eventId:text(row.eventId)?row.eventId:null,boardBook:input.book,startAt:row.startAt?instant(row.startAt).toISOString():null});
   if(input.slot!=="manual"&&!inSlot(observed,input.localDay,input.slot))crossHourRows++;
   // A visible book/tier/line is useful research even when the side and price are absent.
   for(const e of Array.isArray(row.appEvidence)?row.appEvidence:[]){
    if(!e||e.book!==input.book||!finite(e.line)||!['goblin','demon'].includes(e.tier)||!Array.isArray(e.icons)||e.icons.filter(i=>i===input.book).length!==1||e.icons.filter(i=>i===e.tier).length!==1||e.icons.some(i=>![input.book,e.tier].includes(i)))continue;
    if(row.apps.some(a=>a?.book===input.book&&a.line===e.line&&a.tier===e.tier&&['Higher','Lower'].includes(a.side)&&text(a.displayedPrice)))continue;
    const record={book:input.book,sport:input.sport,detailId:row.detailId,player:row.player,eventId:row.eventId||null,market:row.market,period:row.period||null,mapRange:row.mapRange||null,gameMode:row.gameMode||null,line:e.line,tier:e.tier,side:null,displayedPrice:null,observedAt:observed.toISOString(),originalPlatformVerified:false,eligibleForLockedModel:false};
    unpricedTierObservations.set(JSON.stringify([record.detailId,record.eventId,record.market,record.period,record.mapRange,record.gameMode,record.line,record.tier,record.observedAt]),record);
   }
   let matched=0;
   for(const a of row.apps){
    if(!a||a.book!==input.book)continue;
    if(!finite(a.line)||!["Higher","Lower"].includes(a.side)){continue;}
    matched++;
    const offer={source:"pickfinder_premium",book:input.book,sport:input.sport,detailId:row.detailId,player:row.player,eventId:text(row.eventId)?row.eventId:null,market:row.market,period:text(row.period)?row.period:null,mapRange:text(row.mapRange)?row.mapRange:null,gameMode:text(row.gameMode)?row.gameMode:null,line:a.line,tier:text(a.tier)?a.tier:null,side:a.side,displayedPrice:text(a.displayedPrice)?a.displayedPrice:null,observedAt:observed.toISOString(),startAt:row.startAt?instant(row.startAt).toISOString():null,teamMoneylinePercent:finite(row.teamMoneylinePercent)&&row.teamMoneylinePercent>=0&&row.teamMoneylinePercent<=100?row.teamMoneylinePercent:null,originalPlatformVerified:false,eligibleForLockedModel:false};
    const key=JSON.stringify([offer.detailId,offer.eventId,offer.player,offer.market,offer.period,offer.mapRange,offer.gameMode,offer.line,offer.tier,offer.side]);
    const previous=offers.get(key);
    if(previous&&previous.displayedPrice!==offer.displayedPrice)conflicts.add(key);
    if(!previous||offer.observedAt>previous.observedAt)offers.set(key,offer);
   }
   if(!matched){
    unresolvedRows++;
    const evidence=row.appEvidence;
    if(!Array.isArray(evidence))unresolvedEvidence.legacyNoEvidence++;
    else if(!evidence.length)unresolvedEvidence.bookBadgeMissing++;
    else if(evidence.some(e=>!e||!Array.isArray(e.icons)||e.icons.filter(i=>i===input.book).length!==1||e.icons.some(i=>![input.book,'goblin','demon'].includes(i))||e.icons.includes('goblin')&&e.icons.includes('demon')))unresolvedEvidence.ambiguousBookGroup++;
    else if(evidence.every(e=>!finite(e.line)))unresolvedEvidence.lineMissing++;
    else if(evidence.some(e=>e.tier==='goblin'||e.tier==='demon'))unresolvedEvidence.tierWithoutExplicitPrice++;
    else unresolvedEvidence.bookBadgeWithoutExplicitPrice++;
   }
  }
 }
 const declaredPages=input.displayedPageCount;
 const contiguous=Number.isInteger(declaredPages)&&declaredPages>0&&declaredPages===pageNumbers.size&&Array.from({length:pageNumbers.size},(_,i)=>pageNumbers.has(i+1)).every(Boolean);
 const repeatLinks=appearances-wrongSport-links.size;
 const withinSlot=inSlot(first,input.localDay,input.slot)&&inSlot(last,input.localDay,input.slot)&&crossHourRows===0;
 const pageTraversalComplete=input.boardState==="populated"&&contiguous&&input.lastPageReached===true;
 const reasons=[];
 if(input.slot==="manual"&&pacific(first).day!==input.localDay)throw Error("manual date mismatch");
 if(input.slot==="manual")reasons.push("manual_observation");
 else if(!withinSlot)reasons.push("outside_requested_hour");
 if(input.boardState==="populated"&&!pageTraversalComplete)reasons.push("incomplete_page_traversal");
 if(repeatLinks>0)reasons.push("duplicate_or_unresolved_detail_links");
 if(wrongSport||unresolvedRows||conflicts.size)reasons.push("unresolved_rows_or_price_changes");
 if(input.sport==="soccer"&&links.size>=9999)reasons.push("possible_display_cap_requires_partition_reconciliation");
 if(input.boardState==="empty"&&appearances!==0||input.boardState==="disabled"&&appearances!==0)reasons.push("inconsistent_board_state");
 // A mutable UI traversal is not proof of full-board completeness, even when contiguous.
 return {schema:"pickfinder-premium-normalized-v1",book:input.book,sport:input.sport,localDay:input.localDay,slot:input.slot,firstObservedAt:first.toISOString(),lastObservedAt:last.toISOString(),boardState:input.boardState,withinSlot,pageTraversalComplete,fullBoardCertified:false,originalOffersVerified:0,modelInputsApproved:false,health:{pages:pageNumbers.size,appearances,distinctDetailLinks:links.size,repeatOrUnresolvedLinks:repeatLinks,distinctOfferKeys:offers.size,priceConflictKeys:conflicts.size,wrongSport,unresolvedRows,crossHourRows,unresolvedEvidence,researchFields:researchObservations.length,unpricedTierObservations:unpricedTierObservations.size,reasons},offers:[...offers.values()],researchObservations,unpricedTierObservations:[...unpricedTierObservations.values()]};
}
function archive(input,root,attemptId,opts){
 if(process.env.RESTRICTED_DESTINATION_VERIFIED!=="1"||!fs.existsSync(root+"/.git"))throw Error("verified private archive required");
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(attemptId))throw Error("invalid attempt identifier");
 const result=normalize(input,opts),raw=JSON.stringify(input),digest=crypto.createHash("sha256").update(raw).digest("hex");
 const path=require("node:path"),base=path.resolve(root,"research","pickfinder-premium",result.localDay,result.slot.replace(":",""),result.book,result.sport);
 let cur=path.resolve(root);
 for(const part of path.relative(cur,base).split(path.sep)){cur=path.join(cur,part);if(fs.existsSync(cur)){if(fs.lstatSync(cur).isSymbolicLink()||!fs.lstatSync(cur).isDirectory())throw Error("unsafe archive path");}else fs.mkdirSync(cur,{mode:0o700});}
 const dest=path.join(base,attemptId);fs.mkdirSync(dest,{mode:0o700});
 fs.writeFileSync(path.join(dest,"source.json"),raw,{flag:"wx",mode:0o600});
 fs.writeFileSync(path.join(dest,"normalized.json"),JSON.stringify({...result,sourceDigest:digest}),{flag:"wx",mode:0o600});
 const {offers,researchObservations,unpricedTierObservations,...summary}=result;return {...summary,sourceDigest:digest,rawRowsPublished:0};
}
module.exports={normalize,archive};
if(require.main===module){
 try{if(process.argv.length!==5)throw Error("usage: input.json private-root attempt-id");
 const result=archive(JSON.parse(fs.readFileSync(process.argv[2],"utf8")),process.argv[3],process.argv[4]);console.log(JSON.stringify(result));}
 catch(e){console.error("PickFinder export rejected: "+e.name);process.exitCode=1;}
}

