'use strict';
// Read committed, hash-verified PickFinder boards. No network, no predictions or raw publication.
const fs=require('node:fs'),{load,list,read}=require('./pickfinder-public-evidence-audit.cjs'),{groupOffers,match}=require('./pickfinder-public-identity.cjs');
const {displayedClockAt,indexReviews,matchesReview,teamCode}=require('./pickfinder-reviewed-game-context.cjs');
const {aliases}=require('./pickfinder-public-model-validation.cjs');
const dt=Date.parse,dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const et=t=>dayFormat.format(new Date(t));
const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function audit(archive,payload,clock,receipts=[]){
 if(payload?.kind!=='nba_offer_history_candidate_input_v1'||!Array.isArray(payload.history)||!Array.isArray(payload.crosswalk)||!Array.isArray(payload.facts?.events)||!Array.isArray(payload.facts?.roster)||!Number.isFinite(dt(clock)))throw Error('input');
 const id=new Map(),reverse=new Map(),h=new Map();
 for(const [e,n] of payload.crosswalk){if(!id.has(e))id.set(e,new Set());id.get(e).add(n);if(!reverse.has(n))reverse.set(n,new Set());reverse.get(n).add(e);}
 for(const x of payload.history){const k=String(x.playerId),a=h.get(k)||[];a.push(x);h.set(k,a);}
 const by=new Map(groupOffers(archive).filter(g=>g.sport==='nba').map(g=>[g.eventId,match(g,payload.facts.events,payload.facts.roster,clock)]));
 const reviewIndex=indexReviews(receipts,clock);let reviewedOfferMatches=0;
 const sourceContexts=new Map();for(const b of receipts)if(b.schema==='pickfinder-public-nba-context-v1')for(const x of b.records||[]){if(x.state!=='explicit_context_observed'||!Number.isFinite(dt(x.observedAt))||dt(x.observedAt)>dt(clock)||dt(clock)-dt(x.observedAt)>6*3600000||!Number.isFinite(dt(x.startAt))||dt(x.startAt)<=dt(clock)||x.routeVerified!==true||x.playerLabelVerified!==true)continue;const k=JSON.stringify([x.eventId,x.player,x.playerPath]),v=sourceContexts.get(k)||new Map();v.set(JSON.stringify([x.team,x.opponent,x.startAt]),x);sourceContexts.set(k,v);}
 const dialogEvents=new Map();
 for(const receipt of receipts.filter(b=>b.schema==='pickfinder-public-game-dialog-v1'))for(const row of receipt.records||[]){
  if(row.sport!=='NBA'||row.sourceUrl!=='https://www.pickfinder.app/game-lines?game='+row.eventId||!Array.isArray(row.teams)||row.teams.length!==2||!Number.isFinite(dt(row.observedAt))||dt(row.observedAt)>dt(clock)||dt(clock)-dt(row.observedAt)>6*3600000)continue;
  const seen=dialogEvents.get(row.eventId)||new Map();
  seen.set(JSON.stringify([row.displayedClock,row.browserTimeZone,row.teams]),row);dialogEvents.set(row.eventId,seen);
 }
 const out={};let total=0,candidate=0,context=0,profileContextCandidates=0;
 for(const b of archive.latest.filter(b=>b.m.sport==='nba')){
  const z=out[b.m.book]??={offers:0,historyCandidates:0,sourceContextCorroborated:0,excluded:{},byMarket:{}};
  const reject=k=>z.excluded[k]=(z.excluded[k]||0)+1;
  for(const o of b.offers){
   total++;z.offers++;
   const metric=aliases[o.market];if(!metric||o.period||o.mapRange||o.gameMode||!['Higher','Lower'].includes(o.side)||!Number.isFinite(o.line)){reject('unsupported_market_scope');continue;}
   if(!Number.isFinite(dt(o.observedAt))||dt(o.observedAt)>dt(clock)||!Number.isFinite(dt(b.first))||dt(b.first)>dt(clock)||dt(b.first)+999<dt(o.observedAt)){reject('archive_time');continue;}
   const g=by.get(o.eventId),p=g?.players.filter(p=>p.sourcePlayer===o.player&&p.sourceDetailIds.includes(o.detailId))||[];
   if(p.length!==1||p[0].candidates.length!==1||g.possibleEvents.length!==1){reject('ambiguous_player_or_event');continue;}
   const e=p[0].candidates[0],ns=id.get(String(e.playerId)),event=g.possibleEvents[0];
   if(ns?.size!==1){reject('unmatched_native_id');continue;}
   const native=[...ns][0];
   if(reverse.get(native)?.size!==1){reject('conflicting_native_id');continue;}
   const offerDay=et(o.observedAt);
   const prior=(h.get(String(native))||[]).filter(x=>x.gameDate<offerDay&&norm(x.player)===norm(o.player)&&norm(x.team)===norm(e.team)&&Number.isFinite(x[metric]));
   if(prior.length<12){reject('insufficient_prior_history');continue;}
   candidate++;z.historyCandidates++;
   const cards=dialogEvents.get(o.eventId);
   if(cards?.size===1){
    const card=[...cards.values()][0],player=p[0],home=event.teams.find(t=>t.homeAway==='home'),away=event.teams.find(t=>t.homeAway==='away');
    const other=event.teams.find(t=>t.id!==e.teamId);
    if(home&&away&&other&&dt(o.observedAt)<dt(event.startAt)&&dt(card.observedAt)<dt(event.startAt)&&
     card.teams[0]===teamCode(away.abbr)&&card.teams[1]===teamCode(home.abbr)&&
     player.sourceTeams.length===1&&player.sourceTeams[0]===norm(teamCode(e.team))&&
     player.sourceOpponents.length===1&&player.sourceOpponents[0]===norm(teamCode(other.abbr))&&
     displayedClockAt(event.startAt,card.browserTimeZone)===card.displayedClock)
      z.dashboardAndRosterCorroborated=(z.dashboardAndRosterCorroborated||0)+1;
   }
   if(matchesReview(reviewIndex,o,native,e,event)){reviewedOfferMatches++;z.independentlyReviewedOfferMatches=(z.independentlyReviewedOfferMatches||0)+1;}
   let playerPath=null;try{playerPath=new URL(o.detailId,'https://www.pickfinder.app').pathname;}catch{}
   const receiptsForPlayer=sourceContexts.get(JSON.stringify([o.eventId,o.player,playerPath]));
   if(receiptsForPlayer?.size===1){const source=[...receiptsForPlayer.values()][0],team=event.teams.find(t=>t.id===e.teamId),opp=event.teams.find(t=>t.id!==e.teamId);if(team&&opp&&norm(team.abbr)===norm(source.team)&&norm(opp.abbr)===norm(source.opponent)&&Math.abs(dt(source.startAt)-dt(event.startAt))<=300000&&dt(o.observedAt)<dt(source.startAt)){profileContextCandidates++;z.profileContextCandidates=(z.profileContextCandidates||0)+1;}}
   const m=z.byMarket[metric]??={historyCandidates:0,sourceContextCorroborated:0};m.historyCandidates++;
   // Candidate links are never verified merely because name, historical ID and schedule align.
   if(p[0].sourceContextCorroborated!==true||!Number.isFinite(dt(o.startAt))||Math.abs(dt(o.startAt)-dt(event.startAt))>300000||dt(o.observedAt)>=dt(event.startAt)){reject('missing_or_unverified_offer_context');continue;}
   context++;z.sourceContextCorroborated++;m.sourceContextCorroborated++;
  }
 }
 return {kind:'nba_pickfinder_offer_history_candidate_audit_v1',status:'observed',archiveInvalidManifests:archive.invalid.length,totalOffers:total,historyCandidates:candidate,independentlyReviewedOfferMatches:reviewedOfferMatches,unresolvedHistoryCandidates:candidate-reviewedOfferMatches,sourceContextCorroborated:context,profileContextCandidates,profileContextPlayerEventKeys:sourceContexts.size,byBook:out,independentlyReviewedPickfinderCrosswalks:0,originalPlatformVerified:false,modelApproved:false,rawRowsPublished:0};
}
if(require.main===module)try{const payload=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(audit(load(process.argv[2],'nba'),payload,new Date().toISOString(),['directory','dashboards'].flatMap(kind=>list(process.argv[2],kind).map(d=>read(process.argv[2],kind,d))))));}catch{console.error('NBA offer candidate audit failed closed');process.exitCode=1;}
module.exports={audit};
