"use strict";
// Preserve allowlisted, bounded source observations in the restricted archive.
// A quarantined observation is neither a verified identity nor a recommendation.
const {underdog}=require("./independent-provider-export-v1.cjs");
const str=x=>typeof x==="string"&&x.length<=256?x:null;
const num=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const bool=x=>typeof x==="boolean"?x:null;
const field=(r,k)=>str(r?.[k]);
function snapshot(r){
 return {id:field(r,"id"),line_id:field(r,"line_id"),source_projection_id:field(r,"source_projection_id"),market_id:field(r,"market_id"),source:field(r,"source"),sport:field(r,"sport"),league:field(r,"league"),status:field(r,"status"),is_demo:bool(r.is_demo),observed_at:field(r,"observed_at"),line:num(r.line),player:{id:field(r.player,"id"),name:field(r.player,"name"),team:field(r.player,"team")},event:{id:field(r.event,"id"),opponent:field(r.event,"opponent"),starts_at:field(r.event,"starts_at")},market:{id:field(r.market,"id"),stat:field(r.market,"stat"),period:field(r.market,"period")},selections:Array.isArray(r.selections)&&r.selections.length<=8?r.selections.map(s=>({side:field(s,"side"),available:bool(s?.available),payout_multiplier:num(s?.payout_multiplier),tier:field(s,"tier"),payout_tier:field(s,"payout_tier"),multiplier_scale:field(s,"multiplier_scale")})):null};
}
const isLive=r=>r&&r.is_demo===false&&r.source==="underdog";
function reconcile(doc,receivedAt){
 if(doc?.meta?.mode!=="live"||doc.meta.is_demo===true||!Array.isArray(doc.data)||doc.data.length>5||doc.meta.count!==doc.data.length)throw Error("live bounded envelope");
 const observations=doc.data.filter(isLive).map(snapshot);
 const fields=["id","line_id","source_projection_id","sport","league","player.id","player.name","event.id","event.starts_at","market.id","market.stat","market.period","line","observed_at","selections"];
 const schema=Object.fromEntries(fields.map(k=>[k,{}]));
 for(const r of doc.data){for(const k of fields){const v=k.split(".").reduce((o,p)=>o?.[p],r);const t=v===null?"null":Array.isArray(v)?"array":typeof v;schema[k][t]=(schema[k][t]||0)+1;}}
 let normalized={rows:[],excluded:{envelope_not_fresh_or_invalid:doc.data.length},completePage:false};
 try{normalized=underdog(doc,receivedAt);}catch{}
 const rows=[],postFilter={};
 for(const r of normalized.rows){
  const reason=r.sport!=="CS2"?"league_mismatch":!r.providerEventId?"missing_provider_event_id":!r.providerPlayerId?"missing_provider_player_id":null;
  if(reason){postFilter[reason]=(postFilter[reason]||0)+1;continue;}rows.push(r);
 }
 const excluded={...normalized.excluded,...postFilter};
 const count=Object.values(excluded).reduce((a,b)=>a+b,0);
 if(rows.length+count!==doc.data.length)throw Error("row accounting mismatch");
 return {rows,observations,report:{received:doc.data.length,explicitNonDemo:doc.data.filter(r=>r?.is_demo===false).length,expectedSource:doc.data.filter(r=>r?.source==="underdog").length,normalizedBeforeIdentityGate:normalized.rows.length,accepted:rows.length,excluded,fieldTypeCounts:schema,restrictedObservationsRetained:observations.length,completePage:normalized.completePage}};
}
module.exports={reconcile};
