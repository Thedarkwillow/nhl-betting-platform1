'use strict';
// Visible, explicitly scoped sporting facts only. Do not infer a clock from an ID,
// a historical game log, a line movement timestamp or a local time without zone.
const ORIGIN='https://www.pickfinder.app',iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const routes={nba:['nba'],nhl:['nhl'],nfl:['nfl'],mlb:['mlb'],wnba:['wnba'],'college-basketball':['cbb','college-basketball'],'college-football':['cfb','college-football']};
const key=x=>JSON.stringify([x.sport,x.eventId,x.player,x.playerPath]);
function target(o){
 if(!Object.hasOwn(routes,o.sport)||!o.eventId||!o.player||!o.detailId)return null;
 let u;try{u=new URL(o.detailId,ORIGIN);}catch{return null;}
 const p=u.searchParams.get('prop')?.split(':')||[];
 if(u.origin!==ORIGIN||!new RegExp('^/players/(?:'+routes[o.sport].join('|')+')/[a-zA-Z0-9_-]+$').test(u.pathname)||u.searchParams.getAll('prop').length!==1||[...u.searchParams.keys()].some(k=>k!=='prop')||p.length!==4||p[2]!==o.eventId||p[1]!==o.market)return null;
 return {sport:o.sport,eventId:o.eventId,player:o.player,playerPath:u.pathname,detailId:u.pathname+'?'+u.searchParams.toString()};
}
function queue(archive,receipts,at){
 const cutoff=Date.parse(at),fresh=x=>iso(x.observedAt)&&Date.parse(x.observedAt)<=cutoff&&cutoff-Date.parse(x.observedAt)<6*3600000;
 const records=receipts.filter(x=>x.schema==='pickfinder-public-nba-context-v1').flatMap(x=>x.records||[]).filter(fresh);
 const completed=new Set(records.filter(x=>x.state==='explicit_context_observed'&&iso(x.startAt)&&Date.parse(x.startAt)>cutoff+900000).map(key));
 const attempted=new Map();
 for(const x of records)if(x.state==='context_incomplete'&&x.routeVerified===true&&x.playerLabelVerified===true&&
   ['missing_clock','local_clock_zone_unverified'].includes(x.clockEvidenceState)){
  const k=JSON.stringify([key(x),x.detailId]),seenAt=Date.parse(x.observedAt);
  attempted.set(k,Math.max(attempted.get(k)??0,seenAt));
 }
 const seen=new Map(),clocks=new Map();
 for(const b of archive.latest)for(const o of b.offers||[]){
  const t=target(o);if(!t||!['nba','nhl','nfl'].includes(t.sport))continue;
  const k=key(t),old=seen.get(k);
  if(!old)seen.set(k,{...t,offerReferences:1});else old.offerReferences++;
  const last=b.m?.lastObservedAt,clock=clocks.get(k)??0;
  clocks.set(k,iso(last)?Math.max(clock,Date.parse(last)):Infinity);
 }
 const groups=new Map();let deferredUnchangedContext=0;
 for(const x of seen.values()){
  const k=key(x);if(completed.has(k))continue;
  // This is a temporary collection deferral, never a fact or model input.
  // Allow new committed board observations, expired attempts, and uncertain reads.
  if((attempted.get(JSON.stringify([k,x.detailId]))??-Infinity)>=clocks.get(k)){
   deferredUnchangedContext++;continue;
  }
  const a=groups.get(x.sport+'/'+x.eventId)||[];a.push(x);groups.set(x.sport+'/'+x.eventId,a);
 }
 const pending=[];for(let i=0;[...groups.values()].some(a=>i<a.length);i++)for(const a of groups.values())if(a[i])pending.push(a[i]);
 return {total:seen.size,pending,deferredUnchangedContext,offerReferences:[...seen.values()].reduce((n,x)=>n+x.offerReferences,0)};
}
function readVisible({player,detailId}){
 const u=new URL(location.href),expected=new URL(detailId,location.origin),norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLowerCase();
 if(u.origin!==expected.origin||u.pathname!==expected.pathname||u.searchParams.get('prop')!==expected.searchParams.get('prop'))return {routeVerified:false};
 const visible=e=>e&&e.getClientRects().length>0,clean=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,160);
 const main=document.querySelector('main')||document.body;
 const names=[...main.querySelectorAll('h1,h1 span,h2,h3,h4,[role=heading],p')].filter(e=>visible(e)&&norm(e.innerText)===norm(player));
 if(!names.length)return {routeVerified:true,playerLabelVerified:false};
 // Restrict to a small header ancestor; never traverse historical tables or all body text.
 let scope=names[0];for(let i=0;i<4;i++){const parent=scope.parentElement;if(!parent||parent===main||parent===document.body||parent.querySelector('table,[role=tabpanel]')||parent.innerText.length>1600)break;scope=parent;}
 const entries=[];
 const add=(label,value)=>{label=clean(label);value=clean(value);if(/^(?:team|opponent|matchup|game date utc|event date utc|game time|game start|game start time|match start|event start|scheduled start)$/i.test(label)&&value&&value.length<=100)entries.push({label,value});};
 for(const dt of scope.querySelectorAll('dt'))if(visible(dt)&&dt.nextElementSibling?.tagName==='DD'&&visible(dt.nextElementSibling))add(dt.innerText,dt.nextElementSibling.innerText);
 for(const el of scope.querySelectorAll('[aria-label],[title]'))if(visible(el))for(const label of [el.getAttribute('aria-label'),el.getAttribute('title')]){
  const m=String(label||'').match(/^(Team|Opponent|Matchup|Game date UTC|Event date UTC|Game time|Game start(?: time)?|Event start|Scheduled start)\s*:\s*(.+)$/i);if(m)add(m[1],m[2]);
 }
 for(const el of scope.querySelectorAll('p,span,div'))if(visible(el)&&el.children.length===0){const m=clean(el.innerText).match(/^(Team|Opponent|Matchup|Game date UTC|Event date UTC|Game time|Game start(?: time)?|Event start|Scheduled start)\s*:\s*(.+)$/i);if(m)add(m[1],m[2]);}
 // The profile's identity header precedes a separate current-matchup heading.
 for(const el of new Set([...main.querySelectorAll('h2'),...scope.querySelectorAll('p,span,div')])){
  if(!visible(el))continue;
  const m=clean(el.innerText).match(/^([A-Z]{2,4})\s+(?:vs\.?|@)\s+([A-Z]{2,4})\s*[•·]\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*@\s*\d{1,2}:\d{2}\s*[AP]M)$/);
  if(m){add('Team',m[1]);add('Opponent',m[2]);add('Matchup',m[0]);}
 }
 const clocks=[...scope.querySelectorAll('time[datetime]')].filter(visible).flatMap(t=>{const label=clean(t.getAttribute('aria-label')||t.getAttribute('title'));return /^(?:game|match|event|scheduled)\s*(?:start|time)/i.test(label)?[{label,value:clean(t.getAttribute('datetime'))}]:[];});
 const browserClock={zone:Intl.DateTimeFormat().resolvedOptions().timeZone,offsetMinutes:-new Date().getTimezoneOffset()};
 return {routeVerified:true,playerLabelVerified:true,browserClock,entries:[...new Map(entries.map(x=>[JSON.stringify(x),x])).values()].slice(0,30),clocks:[...new Map(clocks.map(x=>[JSON.stringify(x),x])).values()].slice(0,10)};
}
// Local clock labels are evidence, never UTC timestamps. Require a separately
// established display zone before using them to corroborate a native schedule.
function localMatchup(entries){
 const values=[...new Set(entries.filter(x=>x.label.toLowerCase()==='matchup').map(x=>x.value.trim()))];
 if(values.length!==1)return null;
 const m=values[0].match(/^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})\s*[•·]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*@\s*(1[0-2]|[1-9]):([0-5]\d)\s*([AP]M)$/);
 return m?{team:m[1],opponent:m[3],homeAway:m[2]==='@'?'away':'home',weekday:m[4],hour:Number(m[5]),minute:Number(m[6]),dayPeriod:m[7]}:null;
}
// Browser configuration is contextual evidence only, not the provider's display zone.
function browserClockEvidence(s){
 const c=s.browserClock;if(!c||typeof c.zone!=='string'||c.zone.length>64||!Number.isInteger(c.offsetMinutes)||c.offsetMinutes< -720||c.offsetMinutes>840)return null;
 try{new Intl.DateTimeFormat('en-US',{timeZone:c.zone});}catch{return null;}
 return {zone:c.zone,offsetMinutes:c.offsetMinutes,providerDisplayZoneVerified:false};
}
function normalize(t,s,at){
 const entries=(s.entries||[]).filter(x=>typeof x.label==='string'&&typeof x.value==='string'),one=label=>{const a=[...new Set(entries.filter(x=>x.label.toLowerCase()===label).map(x=>x.value.trim().toUpperCase()))];return a.length===1?a[0]:null;};
 const teams=new Set(({nba:'ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS',nhl:'ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH',nfl:'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX JAC KC LAC LAR LA LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS WSH'}[t.sport]||'').split(' '));
 const team=one('team'),opponent=one('opponent'),clocks=[...new Set([...(s.clocks||[]).map(x=>x.value),...entries.filter(x=>/^(?:game|match|event|scheduled)\s*(?:start|time)/i.test(x.label)).map(x=>x.value)].filter(iso).map(x=>new Date(x).toISOString()))];
 const startAt=clocks.length===1?clocks[0]:null;
 const validTeam=x=>teams.has(x)||(!['nba','nhl','nfl'].includes(t.sport)&&/^[A-Z]{2,4}$/.test(x||''));
 const explicit=s.routeVerified===true&&s.playerLabelVerified===true&&validTeam(team)&&validTeam(opponent)&&team!==opponent&&startAt&&iso(at)&&Date.parse(startAt)>Date.parse(at);
 const local=localMatchup(entries);
 return {...t,observedAt:at,browserClock:browserClockEvidence(s),localMatchup:local,clockEvidenceState:startAt?'explicit_iso':local?'local_clock_zone_unverified':'missing_clock',state:explicit?'explicit_context_observed':'context_incomplete',routeVerified:s.routeVerified===true,playerLabelVerified:s.playerLabelVerified===true,team:validTeam(team)?team:null,opponent:validTeam(opponent)?opponent:null,startAt,displayedEvidence:entries,displayedClocks:s.clocks||[],independentReviewVerified:false,originalPlatformVerified:false};
}
module.exports={queue,readVisible,normalize,target,key,localMatchup,browserClockEvidence};
