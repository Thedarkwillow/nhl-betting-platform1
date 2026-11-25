'use strict';
(async()=>{const mount=document.getElementById('pickfinderPublicEvidence');if(!mount)return;
 const add=(parent,tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);parent.append(e);return e;};
 const n=x=>Number.isSafeInteger(x)?x.toLocaleString():'Pending';
 try{const r=await fetch('./data/pickfinder-public-research-health.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(d.schema!=='pickfinder_public_research_health_v1')throw Error();
 mount.textContent='';add(mount,'p','Observed '+new Date(d.generatedAt).toLocaleString()+' · Aggregator evidence, not verified first-party app availability or calibrated predictions.');
 const sc=add(mount,'p','Verified archive manifests: '+n(d.archiveManifests)+' · Exact cross-book observations: '+n(d.exactComparisons)+' · Invalid manifests: '+n(d.invalidManifests));
 const filter=add(mount,'select','');filter.setAttribute('aria-label','PickFinder sport');for(const s of ['all',...Object.keys(d.bySport||{}).sort()]){const opt=add(filter,'option',s.toUpperCase());opt.value=s;}
 const holder=add(mount,'div','');holder.style.overflowX='auto';
 function render(){holder.textContent='';const table=add(holder,'table','');const head=add(table,'thead',''),hr=add(head,'tr','');for(const x of ['Sport','Platform','Pages','Priced offers','Unresolved','State','Capture slot','Observed'])add(hr,'th',x);const body=add(table,'tbody','');
 for(const [s,x] of Object.entries(d.bySport||{})){if(filter.value!=='all'&&filter.value!==s)continue;for(const [book,b] of Object.entries(x.boards||{})){const tr=add(body,'tr','');for(const v of [s,book,n(b.pages)+' / '+n(b.displayedPages),n(b.offers),n(b.unresolved),b.state,b.slot||'Unverified',new Date(b.observedAt).toLocaleString()])add(tr,'td',v);}add(holder,'p',s.toUpperCase()+': '+n(x.unpricedGoblin)+' unpriced Goblin, '+n(x.unpricedDemon)+' unpriced Demon; '+n(x.matchedTwoSidedQuotes)+' exact two-sided quote observations; '+n(x.missingStartAt)+' offers missing a source start clock.');}}
 filter.addEventListener('change',render);render();
 try{
  const response=await fetch('./data/pickfinder-public-activity.json',{cache:'no-store'});if(!response.ok)throw Error();
  const activity=await response.json();if(activity.kind!=='public_pickfinder_activity_readiness_v1'||activity.modelApproved!==false)throw Error();
  add(mount,'h3','PickFinder activity center');
  add(mount,'p','Observed board activity, not native PickFinder alerts. Report as of '+new Date(activity.generatedAt).toLocaleString()+'. Discord and native mobile delivery unverified.');
  const list=add(mount,'ul','');
  for(const e of (activity.events||[]).slice(0,12)){if(e.kind!=='board_observation'||e.nativeNotificationVerified!==false)continue;add(list,'li',e.sport.toUpperCase()+' · '+e.book+' · '+e.state+' · '+n(e.offers)+' observed offers · '+new Date(e.observedAt).toLocaleString());}
  const c=activity.cache||{},g=activity.grading||{};
  add(mount,'p','Historical cache: '+n(c.nonconflictingKeys)+' nonconflicting fact keys; '+n(c.conflictedKeys)+' conflicts; collection requests skipped: '+n(c.requestsSkipped)+'.');
  add(mount,'p','Independent grading queue: '+n(g.dueForIndependentGrade)+' due, '+n(g.pendingNotDue)+' not due, '+n(g.alreadyGraded)+' already graded.');
  const fresh=Object.values(activity.readiness||{}).filter(x=>x.freshCompleteBoard&&Number.isFinite(Date.parse(x.observedAt))&&Date.parse(x.observedAt)<=Date.now()&&Date.now()-Date.parse(x.observedAt)<=900000);
  add(mount,'p','Fresh complete core boards: '+fresh.length+' / '+Object.keys(activity.readiness||{}).length+'. Old observations remain history, not live availability.');
 }catch{add(mount,'p','Public activity center report pending; no native notification delivery certified.');}
 const grading=d.independentGrading||{},coverage=d.researchCoverage||{};
 add(mount,'p','New NBA research forecasts: '+n(d.nbaShadowRows)+' · Archived pregame forecasts: '+n(grading.archivedPregameRows)+' · Not yet due: '+n(grading.pendingNotDue)+' · Due and awaiting results: '+n(grading.pendingDueAfterRun)+' · New independent grades: '+n(grading.newGrades)+' · No production approval.');
 add(mount,'p','Profile attempts: '+n(coverage.profileAttempts)+' · Named dashboard snapshots: '+n(coverage.namedDashboardSnapshots)+' · Game-dialog observations: '+n(coverage.gameDialogObservations)+' · Full filter coverage remains pending.');
 const slots=Object.values(d.bySport||{}).flatMap(x=>Object.values(x.boards||{}));
 add(mount,'p','Latest manual board partitions: '+n(slots.filter(b=>b.slot==='manual').length)+' / '+n(slots.length)+'. A capture-slot label alone does not certify scheduled morning execution.');
 try{
  const res=await fetch('./data/pickfinder-public-nba-alternate-health.json',{cache:'no-store'});if(!res.ok)throw Error();
  const a=await res.json();if(a.kind!=='public_nba_alternate_history_audit_v1')throw Error();
  const o=a.pickfinderOfferHistoryAudit||{},bridge=a.prospectiveBridge||{};
  add(mount,'h3','NBA evidence and automated intake');
  add(mount,'p','Audit observed '+new Date(a.generatedAt).toLocaleString()+'. Historical candidate offers: '+n(o.historyCandidates)+' · Independently reviewed matches: '+n(o.independentlyReviewedOfferMatches)+' · Original board clock corroboration: '+n(o.boardNativeClockCorroborated??o.sourceContextCorroborated)+'. These measures are distinct.');
  add(mount,'p','Reviewed receipt scopes: '+n(bridge.reviewedReceiptScopes)+' · Explicit crosswalk rows: '+n(bridge.explicitCrosswalkRows)+' · New automated research forecasts: '+n(bridge.newForecastRows)+' · Intake status: '+(bridge.reason||'Pending')+'. Original-platform verification and model approval remain separate.');
 }catch{add(mount,'p','NBA alternate-history audit unavailable; automated intake not certified.');}
 try{
  const res=await fetch('./data/prizepicks-model-rankings.json',{cache:'no-store'});if(!res.ok)throw Error();
  const m=await res.json();if(m.kind!=='public_prizepicks_model_ranking_v1'||m.researchOnly!==true||m.modelApproved!==false)throw Error();
  const now=Date.now(),at=Date.parse(m.generatedAt);
  if(!Number.isFinite(at)||at>now||now-at>1800000)throw Error();
  add(mount,'h3','PrizePicks — model-ranked research');
  add(mount,'p','Conditional raw model estimates, not calibrated win probabilities. Separate tiers, no verified payouts or expected value.');
  const rows=(m.rows||[]).filter(x=>x.book==='prizepicks'&&x.calibrated===false&&x.modelApproved===false&&x.originalPlatformVerified===false&&Date.parse(x.gameStartAt)>now+900000&&Date.parse(x.observedAt)<=now&&now-Date.parse(x.observedAt)<=1800000);
  if(!rows.length)add(mount,'p','No eligible fresh model-ranked rows. Unverified props remain withheld.');
  for(const tier of ['standard','goblin','demon']){
   const list=rows.filter(x=>x.tier===tier);if(!list.length)continue;
   add(mount,'h4',tier);
   const table=add(mount,'table',''),head=add(table,'thead',''),hr=add(head,'tr','');
   for(const h of ['Rank','Player','Selection','Projection','Raw estimate','Market benchmark'])add(hr,'th',h);
   const body=add(table,'tbody','');for(const x of list){const tr=add(body,'tr','');for(const v of [x.rankWithinTier,x.player,x.side+' '+x.line+' '+x.market,Number(x.projection).toFixed(2),(100*x.rawConditionalEstimate).toFixed(1)+'%',x.marketEstimate===null?'Unavailable':(100*x.marketEstimate).toFixed(1)+'%'])add(tr,'td',v);}
  }
 }catch{add(mount,'p','Fresh model ranking report unavailable; no stale ranking displayed.');}

 }catch{mount.textContent='Public PickFinder validation report is pending. Existing NHL/NFL research remains unchanged.';}
})();
