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
function priorSeason(selection,now){
 if(!Array.isArray(selection))return null;
 const seasons=selection.filter(x=>norm(x.label)==='season');
 if(seasons.length!==1||typeof seasons[0].display!=='string')return null;
 const v=seasons[0].display.trim(),m=v.match(/^(\d{4})(?:\s*[-–/]\s*(\d{4}|\d{2}))?$/);
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
 const date=day(cells[headers.findIndex(h=>norm(h)==='date')].value);
 if(!date||+new Date(date+'T23:59:59Z')>=seen||+date.slice(0,4)<season.start||+date.slice(0,4)>season.end)return reject('game_date_unverified');
 // Do not conflate different filters, period, map, mode, or market. Exact cells are compared.
 const identity={sport:record.sport,profile:u.pathname,player:record.player,market:record.market,period:f.period??record.period??null,mapRange:f.mapRange??record.mapRange??null,gameMode:f.gameMode??record.gameMode??null,season:season.label,date,tab:f.tab,headers,window:f.window??null,filters:stable(f.filterSelection)};
 return {key:sha(JSON.stringify(stable(identity))),digest:sha(JSON.stringify(stable(cells))),seen,sport:record.sport};
}
function buildIndex(documents,now=new Date()){
 const index=new Map();let fields=0,candidates=0,duplicates=0,conflicts=0,profiles=0;
 const bySport={},rejectionReasons={};
 for(const doc of documents)for(const r of doc.records||[]){
  profiles++;
  for(const f of r.research||[]){
   fields++;const c=candidate(r,f,now,reason=>{rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;});if(!c)continue;candidates++;
   const sport=bySport[c.sport]??={candidates:0,duplicateObservations:0,conflictedKeys:0};sport.candidates++;
   const prev=index.get(c.key);
   if(!prev){index.set(c.key,{digest:c.digest,seen:c.seen,conflict:false,sport:c.sport,field:f});continue;}
   if(prev.digest===c.digest){duplicates++;sport.duplicateObservations++;if(c.seen>prev.seen){prev.seen=c.seen;prev.field=f;}}
   else if(!prev.conflict){prev.conflict=true;conflicts++;sport.conflictedKeys++;}
  }
 }
 return {index,summary:{state:'historical_cache_shadow_audit',generatedAt:now.toISOString(),profiles,fields,candidates,duplicateObservations:duplicates,distinctKeys:index.size,conflictedKeys:conflicts,nonconflictingKeys:index.size-conflicts,bySport,rejectionReasons,requestsSkipped:0,completeSeasonCertified:false,modelInputsApproved:false}};
}
function audit(documents,now=new Date()){return buildIndex(documents,now).summary;}
// Consumers can reuse only an exact previously observed historical fact. No collection scope is skipped.
function lookup(index,key){const row=index.get(key);return row&&!row.conflict?{field:row.field,digest:row.digest,observedAt:new Date(row.seen).toISOString()}:null;}
module.exports={day,priorSeason,candidate,audit,buildIndex,lookup};
if(require.main===module){try{const {read}=require('./pickfinder-public-archive.cjs');console.log(JSON.stringify(audit(read(process.argv[2]||'.','profiles'))));}catch{console.error('Historical cache audit failed closed');process.exitCode=1;}}
