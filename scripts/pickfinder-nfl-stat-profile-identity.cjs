'use strict';
// Historical statistics only. A weekly roster plus matching completed logs can
// link a player path without certifying its displayed kickoff, status or offer.
const {sourceScope}=require('./pickfinder-current-identity.cjs');
const dt=Date.parse,k=(...x)=>JSON.stringify(x), H=36e5;
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const name=x=>String(x||'').normalize('NFKC').trim().toLowerCase();
const team=x=>({WSH:'WAS',JAC:'JAX',AZ:'ARI',LA:'LAR'}[x]||x);
const signatures={passing:['passing_yards','attempts','completions'],kicking:['fg_made','pat_made'],receiving:['receiving_yards','receptions','targets'],rushing:['rushing_yards','carries']};
function verify({documents,audit,seasons,durable,clock}){
 const at=dt(clock),profiles=new Map(),facts=new Map(),accepted=new Map(),blocked=new Set();
 const prior=[...durable.rows,...durable.statisticalCrosswalks,...durable.reviewedStatIdentities];
 for(const x of audit.rows.values()){
  if(x.sport!=='nfl'||!Number.isFinite(dt(x.officialStartAt))||!hash(x.nativeDigest)||
     !Number.isFinite(dt(x.nativeAvailableAt))||dt(x.nativeAvailableAt)>at)continue;
  const key=k(x.sourceDetailId,x.profileDigest),rows=facts.get(key)||[];
  rows.push(x);facts.set(key,rows);
 }
 for(const {doc,digest,first} of documents){
  if(!hash(digest)||!Number.isFinite(dt(first))||dt(first)>at)continue;
  for(const r of doc.records||[]){
   const t=dt(r.currentProfileAttemptedAt),scope=r.sport==='nfl'?sourceScope(r):null,c=r.independentReconciliationContext,local=c?.displayedLocalMatchup;
   if(!scope||r.status!=='sampled'||r.truncated!==false||!Number.isFinite(t)||t>dt(first)+999||t>at||!local||c.conflictingClock||
     !Number.isFinite(dt(c.observedAt))||dt(c.observedAt)>t||t-dt(c.observedAt)>15*60000||
     !['away','home'].includes(local.homeAway)||team(local.team)!==team(c.team)||team(local.opponent)!==team(c.opponent)||
     !/^[A-Z]{2,3}$/.test(team(c.team))||!/^[A-Z]{2,3}$/.test(team(c.opponent))||team(c.team)===team(c.opponent)||
     !/^\d{8}[A-F0-9]{8}$/.test(r.eventId))continue;
   const own=team(c.team),opp=team(c.opponent),p=scope.playerPath;
   for(const h of seasons){
    if(!hash(h.digest)||!Number.isFinite(dt(h.first))||dt(h.first)>at||h.doc.kind!=='nflverse_public_native_history_v1')continue;
    const games=(h.doc.games||[]).filter(g=>dt(g.startAt)>t&&dt(g.startAt)-t<8*24*H&&g[local.homeAway]===own&&
     g[local.homeAway==='home'?'away':'home']===opp&&new Date(dt(g.startAt)).toISOString().slice(0,10).replace(/-/g,'')===r.eventId.slice(0,8));
    if(games.length!==1)continue;
    const rosters=(h.doc.rosters||[]).filter(x=>x.week===games[0].week&&x.team===own&&name(x.name)===name(r.player));
    const ids=new Set(rosters.map(x=>x.gsisId));if(ids.size!==1)continue;
    const [id]=ids;if(!/^00-\d{7}$/.test(id))continue;
    if(prior.some(x=>x.sport==='nfl'&&x.namespace==='nfl:gsis'&&x.sourcePlayerPath===p&&x.playerId!==id)){blocked.add(p);continue;}
    const group=profiles.get(p)??new Set();group.add(id);profiles.set(p,group);
    const byGame=new Map();
    for(const x of facts.get(k(r.detailId,digest))||[]){
     if(x.playerId!==id||name(x.sourcePlayer)!==name(r.player)||!Number.isFinite(dt(x.profileObservedAt))||
       dt(x.profileObservedAt)>dt(first)+999||dt(x.profileObservedAt)<dt(r.currentProfileAttemptedAt)-10*60000||
       dt(x.officialStartAt)>=dt(x.profileObservedAt))continue;
     const row=byGame.get(x.eventId)||new Map();row.set(x.market,x.value);byGame.set(x.eventId,row);
    }
    const supported=[...byGame].filter(([,m])=>Object.values(signatures).some(keys=>keys.every(x=>m.has(x))&&keys.some(x=>m.get(x)>0))).map(([g])=>g).sort();
    if(supported.length<2)continue;
    const proof={sport:'nfl',namespace:'nfl:gsis',sourcePlayer:r.player,sourcePlayerPath:p,playerId:id,
     team:own,opponent:opp,profileDigest:digest,nativeReceiptDigest:h.digest,matchedCompletedGames:supported,
     proofAvailableAt:new Date(Math.max(dt(first),dt(h.first),t,...(facts.get(k(r.detailId,digest))||[]).filter(x=>x.playerId===id&&supported.includes(x.eventId)).map(x=>dt(x.nativeAvailableAt)))).toISOString(),
     evidenceKind:'nfl_weekly_roster_and_exact_completed_logs',eventTimeVerified:false,activeStatusVerified:false};
    const old=accepted.get(p);if(!old||dt(proof.proofAvailableAt)<dt(old.proofAvailableAt))accepted.set(p,proof);
   }
  }
 }
 const reverse=new Map();for(const [p,x] of accepted){const paths=reverse.get(x.playerId)||new Set();paths.add(p);reverse.set(x.playerId,paths);}
 return [...accepted].filter(([p,x])=>!blocked.has(p)&&profiles.get(p).size===1&&reverse.get(x.playerId).size===1&&
  !prior.some(y=>y.sport==='nfl'&&y.namespace==='nfl:gsis'&&y.playerId===x.playerId&&y.sourcePlayerPath!==p)).map(([,p])=>p);
}
module.exports={verify};
