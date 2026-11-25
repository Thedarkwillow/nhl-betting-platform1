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
 }catch{mount.textContent='Public PickFinder validation report is pending. Existing NHL/NFL research remains unchanged.';}
})();
