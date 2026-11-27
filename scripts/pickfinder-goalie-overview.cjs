'use strict';
// An authenticated, untargeted goalie game log has no original offer ID.
// Validate only full-game saves/GA against official final appearances.
const schema='pickfinder-current-goalie-overview-v1';
const columns=['Date','Opponent','TOI','Save','GA','Shots-Faced'];
const route=/^\/players\/nhl\/[A-Za-z0-9_-]+$/;
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const dt=Date.parse,norm=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const key=(...x)=>JSON.stringify(x);
const opp=x=>({SJ:'SJS',NJ:'NJD',TB:'TBL'}[x]||x);
const count=x=>typeof x==='string'&&/^\d{1,3}$/.test(x)?Number(x):null;
function sourceDay(v,dates){
 const m=typeof v==='string'&&/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}))?$/.exec(v);
 if(!m)return false;
 const suffix='-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
 return dates.some(d=>m[3]?d==='20'+m[3]+suffix:d.endsWith(suffix));
}
function reconcile(documents,index,facts,finals,durable,clock){
 const at=dt(clock),roles=new Map(),schedule=new Map(),profiles=new Map(),out=new Map(),conflicts=new Set();
 let rows=0,matched=0,mismatches=0,noGame=0;
 if(!Number.isFinite(at))return {statistics:[],rows,matched,mismatches,noGame};
 for(const h of facts)if(h.doc.source==='nhl:official'&&h.doc.sport==='nhl'&&hash(h.digest)&&Number.isFinite(dt(h.first))&&dt(h.first)<=at)
  for(const r of h.doc.roster||[])if(r.position==='G'&&r.team&&r.playerId){
   const k=key(norm(r.name),r.team),a=roles.get(k)||new Map(),id=String(r.playerId),prev=a.get(id);
   if(!prev||dt(h.first)<dt(prev.first))a.set(id,h);
   roles.set(k,a);
  }
 for(const h of finals)for(const g of h.doc.games||[]){
  const e=g.event;if(e?.namespace!=='nhl:official'||e.completed!==true||e.status!=='post'||!hash(g.sourceDigest)||!hash(h.digest)||!Number.isFinite(dt(h.first))||dt(h.first)>at)continue;
  for(const t of e.teams||[]){const k=key(String(e.eventId),t.abbr),venue=t.homeAway;
   if(!['home','away'].includes(venue))continue;
   if(!schedule.has(k))schedule.set(k,venue);
   else if(schedule.get(k)!==venue)schedule.set(k,null);
  }
 }
 for(const {doc,digest,first} of documents){
  if(doc.schema!==schema||!hash(digest)||!Number.isFinite(dt(first))||dt(first)>at||!Array.isArray(doc.records))continue;
  for(const p of doc.records){
   if(p.authenticated!==true||p.position!=='G'||!route.test(p.playerPath)||p.gameLogLabel!=='Gamelog - Last 15 Games'||!Array.isArray(p.headers)||p.headers.slice(0,6).join('|')!==columns.join('|')||p.headers.filter(x=>x==='Save'||x==='GA').length!==2||
     !Array.isArray(p.rows)||p.rows.length>15||!Number.isFinite(dt(p.observedAt))||dt(p.observedAt)>dt(first)+999)continue;
   const roster=roles.get(key(norm(p.player),p.team)),ids=index.names.get(key('nhl',norm(p.player)));
   if(roster?.size!==1||ids?.size!==1)continue;
   const [id,identity]=[...roster.entries()][0];if(!ids.has(id))continue;
   if([...durable.rows,...(durable.reviewedStatIdentities||[])].some(x=>x.sourcePlayerPath===p.playerPath&&String(x.playerId)!==id))continue;
   const group=profiles.get(p.playerPath)||{id,facts:[]};
   if(group.id!==id){group.id=null;continue;}
   for(const r of p.rows){
    rows++;
    if(!Array.isArray(r)||r.length!==6||r.some(x=>typeof x!=='string'))continue;
    const [day,side,,save,ga]=r,m=/^(@?)([A-Z]{2,3})$/.exec(side),saves=count(save),goalsAgainst=count(ga);
    if(!m||saves===null||goalsAgainst===null)continue;
    const games=(index.byPlayer.get(key('nhl',id))||[]).filter(g=>g.team===p.team&&g.opp===opp(m[2])&&
     schedule.get(key(g.event,g.team))===(m[1]?'away':'home')&&sourceDay(day,g.dates)&&dt(g.start)<dt(p.observedAt)&&hash(g.digest)&&Number.isFinite(dt(g.first))&&dt(g.first)<=at);
    if(games.length!==1){noGame++;continue;}
    const g=games[0];
    if(g.stats.saves!==saves||g.stats.goalsAgainst!==goalsAgainst){mismatches++;continue;}
    matched++;
    group.facts.push({sport:'nhl',playerId:id,eventId:g.event,officialStartAt:g.start,
     availableAt:new Date(Math.max(dt(first),dt(g.first),dt(identity.first))).toISOString(),
     profileDigest:digest,nativeDigest:g.digest,identityReceiptDigest:identity.digest,timezoneReceiptDigests:[],
     evidenceKind:'authenticated_goalie_overview_and_official_final',shadowResearchEligible:true,
     productionModelEligible:false,operatorOfferVerified:false,settlementVerified:false,saves,goalsAgainst});
   }
   profiles.set(p.playerPath,group);
  }
 }
 for(const g of profiles.values()){
  // A route identity needs multiple distinct, independently matched completed
  // game appearances with exact venue, opponent, saves and goals against.
  if(!g.id||new Set(g.facts.map(x=>x.eventId)).size<2)continue;
  for(const {saves,goalsAgainst,...fact} of g.facts)for(const [market,value] of Object.entries({saves,goalsAgainst})){
   const k=key(fact.playerId,fact.eventId,market),prior=out.get(k);
   if(prior&&prior.value!==value)conflicts.add(k);
   if(!prior||dt(fact.availableAt)<dt(prior.availableAt))out.set(k,{...fact,market,value});
  }
 }
 for(const k of conflicts)out.delete(k);
 return {statistics:[...out.values()],rows,matched,mismatches,noGame};
}
module.exports={schema,reconcile};
