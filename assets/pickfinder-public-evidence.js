'use strict';
(async()=>{const mount=document.getElementById('pickfinderPublicEvidence');if(!mount)return;
 const add=(parent,tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);parent.append(e);return e;};
 const n=x=>Number.isSafeInteger(x)?x.toLocaleString():'Pending';
 try{const r=await fetch('./data/pickfinder-public-research-health.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(d.schema!=='pickfinder_public_research_health_v1')throw Error();
 mount.textContent='';add(mount,'p','Observed '+new Date(d.generatedAt).toLocaleString()+' · Aggregator evidence, not verified first-party app availability or calibrated predictions.');
 const sc=add(mount,'p','Verified archive manifests: '+n(d.archiveManifests)+' · Exact cross-book observations: '+n(d.exactComparisons)+' · Invalid manifests: '+n(d.invalidManifests));
 const filter=add(mount,'select','');filter.setAttribute('aria-label','PickFinder sport');for(const s of ['all',...Object.keys(d.bySport||{}).sort()]){const opt=add(filter,'option',s.toUpperCase());opt.value=s;}
 const holder=add(mount,'div','');holder.style.overflowX='auto';
 function render(){holder.textContent='';const table=add(holder,'table','');const head=add(table,'thead',''),hr=add(head,'tr','');for(const x of ['Sport','Platform','Pages','Priced offers','Unresolved','State','Observed'])add(hr,'th',x);const body=add(table,'tbody','');
 for(const [s,x] of Object.entries(d.bySport||{})){if(filter.value!=='all'&&filter.value!==s)continue;for(const [book,b] of Object.entries(x.boards||{})){const tr=add(body,'tr','');for(const v of [s,book,n(b.pages)+' / '+n(b.displayedPages),n(b.offers),n(b.unresolved),b.state,new Date(b.observedAt).toLocaleString()])add(tr,'td',v);}add(holder,'p',s.toUpperCase()+': '+n(x.unpricedGoblin)+' unpriced Goblin, '+n(x.unpricedDemon)+' unpriced Demon; '+n(x.matchedTwoSidedQuotes)+' exact two-sided quote observations; '+n(x.missingStartAt)+' offers missing a source start clock.');}}
 filter.addEventListener('change',render);render();
 add(mount,'p','NBA independently reviewed model joins: '+n(d.nbaShadowRows)+' · New independent grades: '+n(d.independentGrading?.newGrades)+' · No production approval.');
 add(mount,'p','Profile attempts: '+n(d.researchCoverage?.profileAttempts)+' · Dashboard snapshots: '+n(d.researchCoverage?.dashboardSnapshots)+' · Full filter coverage remains pending.');
 }catch{mount.textContent='Public PickFinder validation report is pending. Existing NHL/NFL research remains unchanged.';}
})();
