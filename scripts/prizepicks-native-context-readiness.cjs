'use strict';
// Zero-metered committed public evidence only. Native context is not operator identity,
// human review, active-status verification or permission to retain restricted API data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {git,load}=require('./pickfinder-public-evidence-audit.cjs');
const dt=Date.parse,hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),rev=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const fresh=(x,t,age)=>Number.isFinite(dt(x))&&dt(x)<=t&&t-dt(x)<=age;
const team=x=>({JAC:'JAX',WSH:'WAS',LA:'LAR',AZ:'ARI'}[x]||x);
const name=x=>typeof x==='string'?x.trim().toLowerCase():'';
function receipts(root,rel,kind,clock){
 const dir=path.join(root,rel),out=[];if(!fs.existsSync(dir))return out;
 for(const n of fs.readdirSync(dir).filter(x=>/^[a-f0-9]{64}\.json$/.test(x))){
  try{
   const file=path.join(dir,n),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>32e6)continue;
   const raw=fs.readFileSync(file),digest=crypto.createHash('sha256').update(raw).digest('hex');
   if(digest!==n.slice(0,-5))continue;
   const relFile=rel+'/'+n;
   if(git(root,['status','--porcelain','--',relFile]))continue;
   const commits=git(root,['log','--format=%H','--',relFile]).split('\n');if(commits.length!==1||!rev(commits[0]))continue;
   const first=git(root,['show','-s','--format=%cI',commits[0]]),doc=JSON.parse(raw);
   if(doc.kind!==kind||!Number.isFinite(dt(doc.observedAt))||!Number.isFinite(dt(first))||dt(doc.observedAt)>dt(first)+999||dt(first)>dt(clock))continue;
   out.push({doc,digest,first,commit:commits[0]});
  }catch{}
 }
 return out;
}
const newest=a=>[...a].sort((x,y)=>dt(y.doc.observedAt)-dt(x.doc.observedAt))[0];
function unique(rows,key){const m=new Map(),bad=new Set();for(const x of rows){const k=key(x);if(m.has(k)&&JSON.stringify(m.get(k))!==JSON.stringify(x))bad.add(k);else m.set(k,x);}return [...m].filter(([k])=>!bad.has(k)).map(([,v])=>v);}
function baseScope(sport,receipt,historyReceipts,g,p,opponent,clock){
 const proofs=[receipt,...historyReceipts],latest=[...proofs].sort((a,b)=>dt(b.first)-dt(a.first))[0];
 if(dt(latest.first)>dt(clock)||dt(latest.first)+900000>=dt(g.startAt))return null;
 // These flags mean automated native schedule/roster checks, NOT reviewed PickFinder identity.
 return {sport,name:p.name,team:p.team,opponent,startAt:g.startAt,playerId:p.playerId,gameId:g.eventId,identityReviewed:true,eventReviewed:true,rosterReviewed:true,evidenceKind:'automated_native_schedule_roster_history',receiptDigest:receipt.digest,receiptCommit:receipt.commit,observedAt:receipt.doc.observedAt,firstGitAt:latest.first,historyDigests:[...new Set(proofs.map(x=>x.digest))]};
}
const validProof=(d,pattern)=>Array.isArray(d.proofs)&&d.proofs.some(p=>typeof p.url==='string'&&pattern.test(p.url)&&hash(p.digest)&&fresh(p.observedAt,dt(d.observedAt),3600000));
function build({facts,nhlFinals,nflSeasons,archive,clock,revision}){
 const at=dt(clock),scopes=[],status={};
 if(!Number.isFinite(at)||!rev(revision)||archive.invalid.length)throw Error('context_archive');
 for(const sport of ['NHL','NFL']){
  const lower=sport.toLowerCase(),expected=sport==='NHL'?'nhl:official':'espn:nfl';
  const f=newest(facts.filter(x=>x.doc.sport===lower&&x.doc.source===expected));
  const games=f?.doc.events||[],roster=f?.doc.roster||[];
  const st=status[sport]={nativeFacts:!!f,sourceObservedAt:f?.doc.observedAt??null,upcomingGames:games.filter(g=>g.status==='pre'&&dt(g.startAt)>at+900000).length,rosterPlayers:roster.length,eligibleContextScopes:0,reason:'missing_or_stale_native_facts'};
  if(!f||!fresh(f.doc.observedAt,at,3600000))continue;
  if(!validProof(f.doc,sport==='NHL'?/^https:\/\/api-web\.nhle\.com\/v1\/schedule\//:/^https:\/\/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard\?/))continue;
  st.reason='no_verified_prior_history';
  const seasonDocs=[2024,2025,2026].map(y=>newest(nflSeasons.filter(x=>x.doc.season===y))).filter(Boolean);
  const current=newest(seasonDocs.filter(x=>x.doc.season===2026));
  for(const g of games.filter(g=>g.status==='pre'&&dt(g.startAt)>at+900000&&g.teams?.length===2&&g.teams.every(t=>t.id&&t.abbr)&&g.teams[0].id!==g.teams[1].id)){
   const native=sport==='NFL'&&current?current.doc.games.filter(n=>n.espnEventId===g.eventId&&dt(n.startAt)===dt(g.startAt)&&!n.completedScoreObserved&&[n.home,n.away].sort().join('|')===g.teams.map(t=>team(t.abbr)).sort().join('|')):[];
   for(const p of roster.filter(p=>g.teams.some(t=>t.id===p.teamId)&&p.name&&p.playerId)){
    const own=g.teams.find(t=>t.id===p.teamId),opp=g.teams.find(t=>t.id!==p.teamId);
    if(p.team!==own.abbr||roster.filter(x=>x.teamId===p.teamId&&name(x.name)===name(p.name)).length!==1)continue;
    if(!f.doc.proofs.some(q=>q.teamId===p.teamId&&hash(q.digest)&&fresh(q.observedAt,dt(f.doc.observedAt),3600000)&&typeof q.url==='string'&&(sport==='NHL'?q.url.startsWith('https://api-web.nhle.com/v1/roster/'+p.teamId+'/'):q.url==='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+p.teamId+'/roster')))continue;
    if(sport==='NHL'){
     if(!/^\d+$/.test(p.playerId)||p.position==='G')continue; // no starting-goalie evidence
     const hist=[],used=[];
     for(const h of nhlFinals)for(const q of h.doc.games||[]){
      if(!hash(q.sourceDigest)||q.event?.completed!==true||q.event?.status!=='post'||!Number.isFinite(dt(q.observedAt))||dt(q.observedAt)>dt(h.first)+999||dt(q.event.startAt)>=dt(q.observedAt)||dt(q.observedAt)>at||q.event.startAt.slice(0,10)>=clock.slice(0,10))continue;
      const rows=(q.rows||[]).filter(x=>x.playerId===p.playerId&&x.appeared===true);
      if(rows.length!==1)continue;
      const x=rows[0],z=x.stats||{};
      const stats=Object.fromEntries(Object.entries({shotsOnGoal:z.sog,goals:z.goals,assists:z.assists,points:z.points,blockedShots:z.blockedShots}).filter(([,v])=>Number.isInteger(v)&&v>=0));
      if(!Object.keys(stats).length)continue;
      hist.push({gameId:Number(q.event.eventId),gameDate:q.event.startAt.slice(0,10),knownAt:q.observedAt,finalVerified:true,...stats});used.push(h);
     }
     const rows=unique(hist.map(({knownAt,...x})=>x),x=>x.gameId).map(x=>({...x,knownAt:hist.find(y=>y.gameId===x.gameId).knownAt}));
     if(rows.length<5)continue;
     const s=baseScope(sport,f,used,g,{...p,playerId:Number(p.playerId)},opp.abbr,clock);if(s)scopes.push({...s,history:{playerId:Number(p.playerId),name:p.name,team:p.team,type:'skater',games:rows}});
    }else{
     if(native.length!==1||!current||seasonDocs.length!==3)continue;
     const n=native[0],rr=current.doc.rosters.filter(x=>x.week===n.week&&x.espnId===p.playerId&&x.team===team(p.team)&&name(x.name)===name(p.name));
     if(rr.length!==1||!/^\d{2}-\d{7}$/.test(rr[0].gsisId)||!p.position)continue;
     const id=rr[0].gsisId,history=[];
     for(const h of seasonDocs){
      const finals=new Map(h.doc.games.filter(x=>x.completedScoreObserved&&dt(x.startAt)<dt(h.doc.observedAt)).map(x=>[x.gameId,x]));
      for(const x of h.doc.playerRows.filter(x=>x.playerId===id)){
       const game=finals.get(x.gameId);
       if(!game||game.week!==x.week||dt(game.startAt)!==dt(x.gameStartAt)||[game.home,game.away].sort().join('|')!==[x.team,x.opponent].sort().join('|')||!(h.doc.season<n.season||h.doc.season===n.season&&x.week<n.week))continue;
       const z=x.stats,measures={passing_yards:z.passing_yards,passing_attempts:z.attempts,passing_completions:z.completions,passing_touchdowns:z.passing_tds,interceptions_thrown:z.passing_interceptions,rushing_yards:z.rushing_yards,rushing_attempts:z.carries,rushing_touchdowns:z.rushing_tds,receiving_yards:z.receiving_yards,receptions:z.receptions,receiving_targets:z.targets,receiving_touchdowns:z.receiving_tds};
       history.push({identity:'player:'+id,year:h.doc.season,week:x.week,knownAt:h.doc.observedAt,finalVerified:true,measures:Object.fromEntries(Object.entries(measures).filter(([,v])=>Number.isFinite(v)))});
      }
     }
     if(history.length<5||new Set(history.map(x=>x.year+'|'+x.week)).size!==history.length)continue;
     const s=baseScope(sport,f,seasonDocs,{...g,eventId:n.gameId},{...p,playerId:id},opp.abbr,clock);
     if(s)scopes.push({...s,season:n.season,week:n.week,position:p.position,history});
    }
   }
  }
  st.eligibleContextScopes=scopes.filter(s=>s.sport===sport).length;
  if(st.eligibleContextScopes)st.reason='native_context_available_offer_not_verified';
 }
 for(const s of ['CS2','VALORANT','DOTA2','LOL','COD'])status[s]={eligibleContextScopes:0,reason:'independent_player_series_map_scope_receipts_missing'};
 return {revision,preparedAt:clock,scopes,archive,status};
}
function fromArchive(root,clock,revision,archive=load(root)){
 const base='research/pickfinder-public-identity-v1/';
 return build({facts:receipts(root,base+'native-facts','independent_public_sport_identity_facts_v1',clock),nhlFinals:receipts(root,base+'nhl-final-stat-facts','nhl_official_recent_final_stats_v1',clock),nflSeasons:receipts(root,'research/pickfinder-public-nfl-v1/season','nflverse_public_native_history_v1',clock),archive,clock,revision});
}
function report(ctx){
 const at=dt(ctx.preparedAt),bySport={};
 for(const sport of ['nba','nhl','nfl','cs2','valorant','dota2','lol','cod']){
  const rows=ctx.archive.latest.filter(b=>b.m.sport===sport&&b.m.book==='prizepicks'&&dt(b.first)<=at).flatMap(b=>b.offers||[]);
  bySport[sport]={observedOffers:rows.length,freshClockVerifiedOffers:rows.filter(o=>fresh(o.observedAt,at,300000)&&Number.isFinite(dt(o.startAt))&&dt(o.startAt)>at+900000).length,qualifiedIndividualForecasts:0};
 }
 return {kind:'direct_multisport_context_readiness_v1',generatedAt:ctx.preparedAt,status:ctx.status,bySport,storageAuthorized:false,storagePersistenceVerified:false,paidCaptureReady:false,qualifiedPaperLineups:0,paidRequests:0,rawRowsPublished:0,modelApproved:false};
}
module.exports={build,fromArchive,receipts,report};
if(require.main===module){try{const root=process.cwd(),clock=new Date().toISOString(),ctx=fromArchive(root,clock,git(root,['rev-parse','HEAD']));console.log(JSON.stringify(report(ctx)));}catch{console.error('Multisport readiness failed closed');process.exitCode=1;}}
