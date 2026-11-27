'use strict';
// Conservative shadow cache: only explicitly dated, prior-season, structured game-log facts.
// Never substitutes for source offer, current context, or complete profile collection.
const {sha}=require('./pickfinder-public-archive.cjs');
const {VERSION}=require('./pickfinder-research-coverage.cjs');
const norm=x=>String(x??'').trim().toLowerCase();
function day(s){
 const m=String(s??'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!m)return null;
 const d=new Date(s+'T00:00:00Z');
 return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null;
}
// Decode only unambiguous full dates. Do not assign a year to month/day-only rows.
function fullDate(v){
 const iso=day(v);if(iso)return iso;
 const t=String(v??'').trim(),numeric=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 const format=(y,m,d)=>day(y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'));
 if(numeric){const a=Number(numeric[1]),b=Number(numeric[2]);if(a>12&&b<=12)return format(numeric[3],b,a);if(b>12&&a<=12||a===b)return format(numeric[3],a,b);return null;}
 const names=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const month=t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
 if(month){const i=names.indexOf(month[1].slice(0,3).toLowerCase());const full=['january','february','march','april','may','june','july','august','september','october','november','december'];if(i>=0&&[names[i],full[i]].includes(month[1].toLowerCase()))return format(month[3],i+1,Number(month[2]));}
 return null;
}
function priorSeason(selection,now){
 if(!Array.isArray(selection))return null;
 const seasons=selection.filter(x=>norm(x.label)==='season');
 if(seasons.length!==1||typeof seasons[0].display!=='string')return null;
 const v=seasons[0].display.trim(),m=v.replace(/^season\s+/i,'').replace(/\s+season$/i,'').match(/^(\d{4})(?:\s*[-–/]\s*(\d{4}|\d{2}))?$/);
 if(!m)return null;
 const start=Number(m[1]),end=m[2]?(m[2].length===2?Math.floor(start/100)*100+Number(m[2]):Number(m[2])):start;
 if(start<1900||end<start||end-start>1||end>=now.getUTCFullYear())return null;
 return {start,end,label:v};
}
function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));return x;}
function candidate(record,f,now,diagnostic){
 const reject=reason=>{if(diagnostic)diagnostic(reason);return null;};
 if(record.coverageVersion!==VERSION)return reject('coverage_version');
 if(record.truncated!==false)return reject('truncated_profile');
 if(record.status!=='sampled')return reject('profile_status');
 if(f.origin!=='profile'||!/^row \d+$/.test(f.metric||''))return reject('not_profile_row');
 if(!record.sport||!record.market||!record.player)return reject('missing_scope');
 const seen=Date.parse(f.observedAt);if(!Number.isFinite(seen)||seen>+now)return reject('observation_clock');
 let u;try{u=new URL(record.detailId,'https://www.pickfinder.app');}catch{return reject('profile_route');}
 if(u.origin!=='https://www.pickfinder.app'||!/^\/players\/[^/]+\/[^/]+$/.test(u.pathname))return reject('profile_route');
 const season=priorSeason(f.filterSelection,now);if(!season)return reject('prior_season_unverified');
 if(!/game\s*log|player stats|historical stats/i.test(f.tab||'')||/line|odds|payout|hit rate|projection|average|result/i.test(f.scope||''))return reject('not_game_log_scope');
 const headers=String(f.scope||'').split(' | ');if(headers.filter(h=>norm(h)==='date').length!==1||headers.length<2||new Set(headers).size!==headers.length)return reject('date_header_or_columns');
 let cells;try{cells=JSON.parse(f.value);}catch{return reject('row_json');}
 if(!Array.isArray(cells)||cells.length!==headers.length||cells.some(c=>!c||typeof c.value!=='string'))return reject('row_shape');
 const date=fullDate(cells[headers.findIndex(h=>norm(h)==='date')].value);
 if(!date||+new Date(date+'T23:59:59Z')>=seen||+date.slice(0,4)<season.start||+date.slice(0,4)>season.end)return reject('game_date_unverified');
 // Do not conflate different filters, period, map, mode, or market. Exact cells are compared.
 const identity={sport:record.sport,profile:u.pathname,player:record.player,market:record.market,period:f.period??record.period??null,mapRange:f.mapRange??record.mapRange??null,gameMode:f.gameMode??record.gameMode??null,season:season.label,date,tab:f.tab,headers,window:f.window??null,filters:stable(f.filterSelection)};
 return {key:sha(JSON.stringify(stable(identity))),digest:sha(JSON.stringify(stable(cells))),seen,sport:record.sport};
}
// Count only bounded, allowlisted shape categories; never emit account text or raw rows.
function seasonShape(selection,now){
 if(selection==null)return 'absent';
 if(!Array.isArray(selection))return 'non_array';
 const seasons=selection.filter(x=>x&&norm(x.label)==='season');
 if(!seasons.length)return 'no_season_label';
 if(seasons.length!==1)return 'multiple_season_labels';
 const x=seasons[0];
 if(typeof x.display!=='string')return typeof x.value==='string'?'value_only':'missing_display';
 const v=x.display.trim();
 if(priorSeason(selection,now))return 'explicit_prior';
 if(/^(?:current|this|all|last|previous)(?:\s+seasons?)?$/i.test(v))return 'relative_or_all';
 if(/^\d{4}(?:\s*[-–/]\s*(?:\d{4}|\d{2}))?$/.test(v))return 'year_or_range_not_prior';
 if(/^(?:season\s+)?\d{4}(?:\s*[-–/]\s*(?:\d{4}|\d{2}))?\s+season$/i.test(v)||/^season\s+\d{4}/i.test(v))return 'year_with_season_label';
 return 'other_display';
}
function dateShape(f){
 const h=String(f.scope||'').split(' | ').map(norm),i=h.indexOf('date');
 if(i<0||h.lastIndexOf('date')!==i)return 'no_unique_date_header';
 let cells;try{cells=JSON.parse(f.value);}catch{return 'invalid_json';}
 const v=cells?.[i]?.value;
 if(!Array.isArray(cells)||typeof v!=='string')return 'missing_date_cell';
 if(day(v))return 'iso_day';
 if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v))return 'numeric_with_year';
 if(/^\d{1,2}\/\d{1,2}$/.test(v))return 'numeric_without_year';
 if(/\b\d{4}\b/.test(v))return 'other_with_year';
 return 'other_or_relative';
}
function buildIndex(documents,now=new Date()){
 const index=new Map();let fields=0,candidates=0,duplicates=0,conflicts=0,profiles=0;
 const bySport={},rejectionReasons={},seasonShapes={},dateShapes={};
 for(const doc of documents)for(const r of doc.records||[]){
  profiles++;
  for(const f of r.research||[]){
   fields++;const c=candidate(r,f,now,reason=>{rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;if(reason==='prior_season_unverified'){const a=seasonShape(f.filterSelection,now),b=dateShape(f);seasonShapes[a]=(seasonShapes[a]||0)+1;dateShapes[b]=(dateShapes[b]||0)+1;}});if(!c)continue;candidates++;
   const sport=bySport[c.sport]??={candidates:0,duplicateObservations:0,conflictedKeys:0};sport.candidates++;
   const prev=index.get(c.key);
   if(!prev){index.set(c.key,{digest:c.digest,seen:c.seen,conflict:false,sport:c.sport,field:f});continue;}
   if(prev.digest===c.digest){duplicates++;sport.duplicateObservations++;if(c.seen>prev.seen){prev.seen=c.seen;prev.field=f;}}
   else if(!prev.conflict){prev.conflict=true;conflicts++;sport.conflictedKeys++;}
  }
 }
 return {index,summary:{state:'historical_cache_shadow_audit',generatedAt:now.toISOString(),profiles,fields,candidates,duplicateObservations:duplicates,distinctKeys:index.size,conflictedKeys:conflicts,nonconflictingKeys:index.size-conflicts,bySport,rejectionReasons,seasonShapes,dateShapes,requestsSkipped:0,completeSeasonCertified:false,modelInputsApproved:false}};
}
function audit(documents,now=new Date()){return buildIndex(documents,now).summary;}
// Consumers can reuse only an exact previously observed historical fact. No collection scope is skipped.
function lookup(index,key){const row=index.get(key);return row&&!row.conflict?{field:row.field,digest:row.digest,observedAt:new Date(row.seen).toISOString()}:null;}
module.exports={day,fullDate,priorSeason,seasonShape,dateShape,candidate,audit,buildIndex,lookup};
if(require.main===module){
 try{
  const {iterate,archiveRevision}=require('./pickfinder-public-archive.cjs');
  const {queue}=require('./pickfinder-public-runner.cjs');
  const root=process.argv[2]||'.',revision=archiveRevision(root);
  // Both reports must describe exactly the same input snapshot as the hosted queue.
  const profiles=()=>iterate(root,'profiles',revision);
  const history=audit(profiles());
  const q=queue(iterate(root,'board-parts',revision),profiles());
  const profileQueue={
   distinctScopes:q.total,completedCheckpointScopes:q.done,pendingScopes:q.pending.length,
   malformedHistoryPending:q.malformedHistoryPending,offerReferences:q.offerReferences,
   sharedAcrossBooks:q.sharedAcrossBooks
  };
  console.log(JSON.stringify({...history,archiveRevision:revision,profileQueue},null,2));
 }catch{console.error('Historical cache audit failed closed');process.exitCode=1;}
}
