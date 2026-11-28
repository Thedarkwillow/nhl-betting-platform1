'use strict';
(async()=>{const mount=document.getElementById('pickfinderPublicEvidence');if(!mount)return;
 const add=(parent,tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);parent.append(e);return e;};
 const n=x=>Number.isSafeInteger(x)?x.toLocaleString():'Pending';
 const gameEqualNote=(title,g,expected)=>{
  if(g?.method!=='equal_game_paired_v1'||g.researchOnly!==true||g.productionApproved!==false||
   g.decisionCount!==expected||!Number.isSafeInteger(g.distinctGames)||g.distinctGames<1||g.distinctGames>expected||
   !Number.isFinite(g.delta?.brier)||Math.abs(g.delta.brier)>1||!Number.isFinite(g.delta?.logLoss))return;
  const txt=title+': '+n(g.distinctGames)+' verified '+(g.distinctGames===1?'game':'games')+
   ' weighted equally · Brier difference '+g.delta.brier.toFixed(4)+' · log-loss difference '+g.delta.logLoss.toFixed(4);
  const ci=g.uncertainty?.brier;
  const valid=g.distinctGames>=30&&Array.isArray(ci)&&ci.length===2&&ci.every(Number.isFinite)&&ci[0]<=g.delta.brier&&g.delta.brier<=ci[1];
  add(mount,'p',txt+(valid?' · descriptive Brier interval '+ci.map(x=>x.toFixed(4)).join(' to '):
   ' · uncertainty interval unavailable')+'. Negative differences favor the challenger.');
 };
 try{const r=await fetch('./data/pickfinder-public-research-health.json',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(d.schema!=='pickfinder_public_research_health_v1')throw Error();
 mount.textContent='';add(mount,'p','Observed '+new Date(d.generatedAt).toLocaleString()+' · Aggregator evidence, not verified first-party app availability or calibrated predictions.');
 const sc=add(mount,'p','Verified archive manifests: '+n(d.archiveManifests)+' · Exact cross-book observations: '+n(d.exactComparisons)+' · Invalid manifests: '+n(d.invalidManifests));
 const filter=add(mount,'select','');filter.setAttribute('aria-label','PickFinder sport');for(const s of ['all',...Object.keys(d.bySport||{}).sort()]){const opt=add(filter,'option',s.toUpperCase());opt.value=s;}
 const holder=add(mount,'div','');holder.style.overflowX='auto';
 function render(){holder.textContent='';const table=add(holder,'table','');const head=add(table,'thead',''),hr=add(head,'tr','');for(const x of ['Sport','Platform','Pages','Priced offers','Unresolved','State','Capture slot','Observed'])add(hr,'th',x);const body=add(table,'tbody','');
 for(const [s,x] of Object.entries(d.bySport||{})){if(filter.value!=='all'&&filter.value!==s)continue;for(const [book,b] of Object.entries(x.boards||{})){const tr=add(body,'tr','');for(const v of [s,book,n(b.pages)+' / '+n(b.displayedPages),n(b.offers),n(b.unresolved),b.state,b.slot||'Unverified',new Date(b.observedAt).toLocaleString()])add(tr,'td',v);}add(holder,'p',s.toUpperCase()+': '+n(x.unpricedGoblin)+' unpriced Goblin, '+n(x.unpricedDemon)+' unpriced Demon; '+n(x.matchedTwoSidedQuotes)+' exact two-sided quote observations; '+n(x.missingStartAt)+' offers missing a source start clock.');}}
 filter.addEventListener('change',render);render();
 try {
  const response=await fetch('./data/nhl-public-sog-shadow.json',{cache:'no-store'});
  if(!response.ok)throw Error();
  const pilot=await response.json();
  if(pilot.kind!=='nhl_public_sog_shadow_status_v1'||pilot.researchOnly!==true||pilot.modelApproved!==false||pilot.productionChanged!==false)throw Error();
  const grade=pilot.performance||{},capture=pilot.lastCapture;
  add(mount,'h3','NHL shots on goal research pilot');
  add(mount,'p',n(pilot.committedForecasts)+' pregame forecasts frozen · '+n(grade.decisions)+' independently graded across '+n(grade.distinctGames)+' games. Research only. No qualified picks from this pilot.');
  if(grade.decisions>0)add(mount,'p','Same thresholds · model '+n(grade.modelWins)+' wins · always Higher '+n(grade.alwaysHigherWins)+' · always Lower '+n(grade.alwaysLowerWins)+'.');
  if(capture){
   add(mount,'p','Last capture · '+n(capture.candidateOffers)+' fresh PickFinder sides eligible for modeling · '+n(capture.matchedDecisions)+' matched model decisions.');
   const reasons=capture.excluded||{};
   if(reasons.stale_or_uncommitted_board)add(mount,'p','Waiting for a fresh archived PickFinder NHL PrizePicks board.');
   if(reasons.missing_exact_pickfinder_start)add(mount,'p',n(reasons.missing_exact_pickfinder_start)+' candidate sides lacked an explicit PickFinder start time.');
   if(reasons.partner_snapshot_unavailable_or_incomplete)add(mount,'p','The exact PrizePicks partner snapshot could not be corroborated.');
  }
 }catch{}

 try{
  const response=await fetch('./data/public-prop-calibration.json',{cache:'no-store'});
  if(!response.ok)throw Error();
  const d=await response.json();
  if(d.kind!=='public_prop_calibration_readiness_v1'||d.researchOnly!==true||d.calibratedProbabilityApproved!==false)throw Error();
  add(mount,'h3','NHL, NFL and NBA probability calibration');
  for(const sport of ['NHL','NFL','NBA']){
   const a=d.bySport?.[sport];if(!a)continue;
   add(mount,'p',sport+' · '+n(a.eligibleDecisions)+' eligible frozen and graded decisions · '+n(a.fitted)+' committed fits · '+n(a.prospectiveDecisions)+' scored after fit · '+n(a.reviewReady)+' cohorts ready for independent review.');
  }
  add(mount,'p','Each sport, book, tier, period, market and model version is evaluated separately. No probabilities from this report are approved for recommendations.');
 }catch{}
 try{
  const response=await fetch('./data/pickfinder-public-activity.json',{cache:'no-store'});if(!response.ok)throw Error();
  const activity=await response.json();if(activity.kind!=='public_pickfinder_activity_readiness_v1'||activity.modelApproved!==false)throw Error();
  add(mount,'h3','PickFinder activity center');
  const at=Date.parse(activity.generatedAt);
  add(mount,'p','Observed board activity, not native PickFinder alerts.'+(Number.isFinite(at)?' Report as of '+new Date(at).toLocaleString()+'.':' Report time unavailable.')+' Native push delivery is not verified here.');
  const delivery=add(mount,'p','Project Discord runs separately from native PickFinder notifications. ');
  const sender=add(delivery,'a','View project Discord delivery runs');
  sender.setAttribute('href','https://github.com/Thedarkwillow/nhl-betting-platform1/actions/workflows/project-discord-line-alerts.yml');
  const list=add(mount,'ul','');
  const slotNames={'06:00':'6 a.m. Pacific slot label','09:00':'9 a.m. Pacific slot label',manual:'manual capture',unknown:'capture slot unknown'};
  for(const e of (activity.events||[]).slice(0,12)){
   if(e.kind!=='board_observation'||e.nativeNotificationVerified!==false||
      typeof e.sport!=='string'||!['prizepicks','underdog'].includes(e.book)||
      !Number.isFinite(Date.parse(e.observedAt)))continue;
   const row=add(list,'li',e.sport.toUpperCase()+' · '+e.book+' · '+e.state+' · '+n(e.offers)+' observed offers · '+new Date(e.observedAt).toLocaleString()+' · '+(slotNames[e.slot]||slotNames.unknown));
   if(/^[a-f0-9]{64}$/.test(e.manifestDigest||'')){
    add(row,'span',' · ');
    const link=add(row,'a','Archive evidence');
    link.setAttribute('href','https://github.com/Thedarkwillow/nhl-betting-platform1/blob/main/research/pickfinder-public-v1/boards/'+e.manifestDigest+'.json');
   }
  }
  add(mount,'p','A slot label is not proof of scheduled execution. Archive observations do not verify first-party offers or model suggestions.');
  const c=activity.cache||{},g=activity.grading||{};
  add(mount,'p','Historical cache: '+n(c.nonconflictingKeys)+' nonconflicting fact keys; '+n(c.conflictedKeys)+' conflicts; collection requests skipped: '+n(c.requestsSkipped)+'.');
  add(mount,'p','Independent grading queue: '+n(g.dueForIndependentGrade)+' due, '+n(g.pendingNotDue)+' not due, '+n(g.alreadyGraded)+' already graded.');
  const h=activity.historicalRecovery;
  if(h){add(mount,'h3','Historical research readiness');add(mount,'p',n(h.fields)+' archived fields · '+n(h.candidates)+' statistical candidates · '+n(h.cacheRecords)+' reusable research facts · '+n(h.identityCandidates)+' identity candidates · '+n(h.reviewedIdentities)+' reviewed identities · '+n(h.qualifiedCache)+' qualified historical cache entries · '+n(h.qualifiedModelInputs)+' qualified model inputs. Candidate counts are not approved forecasts.');}
  for(const [sport,x] of Object.entries(activity.esportsScopeRecovery||{}))add(mount,'p',sport.toUpperCase()+': '+n(x.explicitSupportedScopes)+' / '+n(x.offerObservations)+' source scopes recognized; '+n(x.qualifiedModelInputs)+' qualified model inputs.');
  for(const [sport,x] of Object.entries(activity.sportsbookThresholdEvidence||{}))add(mount,'p',sport.toUpperCase()+': '+n(x.explicitThreshold)+' explicit sportsbook thresholds; '+n(x.exactPairs)+' same-snapshot price pairs. Independent offer verification remains required.');
  const series=activity.esportsSeriesReview;
  if(series?.counts){
   const reviewed=Number.isSafeInteger(series.scopes)&&Number.isSafeInteger(series.counts.series_unreviewed??0)?
    series.scopes-(series.counts.series_unreviewed??0):null;
   add(mount,'p','Independent esports series review: '+n(series.counts.roster_and_map_corroborated)+' of '+n(reviewed)+' reviewed scopes corroborated for player and maps · '+n(series.counts.series_unreviewed??0)+' additional scopes not reviewed · '+n(series.counts.player_unresolved??0)+' player identities unresolved · '+n(series.counts.roster_conflict??0)+' roster conflicts · '+n(series.counts.map_scope_unresolved??0)+' map scopes unresolved.');
  }
  const esports=activity.esportsOriginalOfferReadiness;
  if(esports?.kind==='pickfinder_esports_original_offer_readiness_v1'&&esports.modelApproved===false&&esports.rawRowsPublished===0){
   add(mount,'h3','Esports offer and grading coverage');
   const table=add(mount,'table',''),header=add(add(table,'thead',''),'tr','');
   for(const label of ['Title','Archived offer observations','Exact supported scope','Retrospective examples','Verified platform settlements','Prospective grades'])add(header,'th',label);
   const body=add(table,'tbody','');
   for(const sport of ['cs2','valorant','dota2','lol','cod']){
    const x=esports.bySport?.[sport];if(!x)continue;
    const row=add(body,'tr','');for(const v of [sport.toUpperCase(),n(x.archiveOfferObservations),n(x.explicitSupportedScopeObservations),
      n(x.independentlyMatchedRetrospectiveExamples),n(x.originalPlatformSettlementsVerified),n(x.prospectiveGradesVerified)])add(row,'td',v);
   }
   add(mount,'p','An archived scope or an independent game result does not by itself verify the platform settlement.');
  }
  const replay=activity.reviewedHistoryModel;
  if(replay?.retrospective===true&&replay.modelApproved===false){
   add(mount,'h3','NHL and NFL historical model replay');
   for(const sport of ['nhl','nfl']){
    const markets=Object.entries(replay.bySport?.[sport]||{});
    add(mount,'h4',sport.toUpperCase());
    const decided=markets.filter(([,m])=>m.decided>0);
    if(!decided.length){add(mount,'p','No independently graded archive pairs met the pregame evidence gates.');continue;}
    const table=add(mount,'table',''),header=add(add(table,'thead',''),'tr','');
    for(const label of ['Market','Decisions','Games','Estimate','Brier score','Log loss'])add(header,'th',label);
    const body=add(table,'tbody','');
    for(const [market,m] of decided)for(const [key,label] of [
     ['existing','Existing model'],['reviewed','Reviewed history'],['challenger','Combined'],['neutral','50% baseline']
    ]){
     const score=m.scores?.[key];
     if(!Number.isFinite(score?.brier)||!Number.isFinite(score?.logLoss))continue;
     const row=add(body,'tr','');
     for(const v of [market,n(m.decided),n(m.distinctGames),label,score.brier.toFixed(3),score.logLoss.toFixed(3)])add(row,'td',v);
    }
   }
  }
  const valorant=activity.valorantRetrospective;
  if(valorant?.prospective===false&&valorant.modelApproved===false){
   add(mount,'h3','Valorant two-map retrospective');
   add(mount,'p',n(valorant.examples)+' distinct propositions across '+n(valorant.series)+' series with independent results.');
   const table=add(mount,'table',''),header=add(add(table,'thead',''),'tr','');
   for(const label of ['Estimate','Offer-equal Brier','Log loss','Series-equal Brier','Series-equal log loss'])add(header,'th',label);
   const body=add(table,'tbody','');
   for(const [key,label] of [['l10','Last ten'],['l5','Last five'],['l5L10Blend','Equal blend'],['even','50% baseline']]){
    const score=valorant[key];
    if(!Number.isFinite(score?.brier)||!Number.isFinite(score?.logLoss))continue;
    const row=add(body,'tr','');
    const equal=valorant.seriesEqual?.aggregates?.[key],value=x=>Number.isFinite(x)?x.toFixed(3):'Pending';
    for(const v of [label,score.brier.toFixed(3),score.logLoss.toFixed(3),value(equal?.brier),value(equal?.logLoss)])add(row,'td',v);
   }
   add(mount,'p','Series-equal weighting gives each completed series the same weight, regardless of how many lines were posted. This small retrospective does not establish calibration or prospective accuracy.');
  }
  const profile=activity.profileMarketEvidence;
  if(profile){
   add(mount,'h3','Historical quotes and NBA player context');
   add(mount,'p',n(profile.historicalRows)+' archived book and threshold rows · '+n(profile.distinctUnconflictedPairedGroups)+' distinct two-sided prices · '+n(profile.unzonedPairedGroups)+' unzoned pairs withheld from timestamp-based comparisons · '+n(profile.offsetBoundNoVigPairedGroups)+' offset-backed paired no-vig candidates.');
   add(mount,'p','Browser timezone metadata is not a historical source offset. A paired candidate does not verify an opening or closing price, first-party quote or model edge.');
   const pickem=profile.currentPickEmMovement;
   if(pickem)add(mount,'p',n(pickem.rows)+' displayed PrizePicks/Underdog movement rows · '+n(pickem.exactDisplayedTierRows)+' explicit tier labels · '+n(pickem.unpricedRows)+' unpriced · '+n(pickem.sourceClockRows)+' with a source clock. Pick’em rows are excluded from sportsbook probability estimates.');
   add(mount,'p',n(profile.workloadObservations)+' workload observations · '+n(profile.defenseSplitObservations)+' defensive splits · '+n(profile.availabilityObservations)+' coded availability observations.');
  }
  const byScope=Object.entries(activity.readiness||{}).filter(([key,r])=>
   /^[a-z0-9-]+\/(?:prizepicks|underdog)$/.test(key)&&r?.originalBoardCompletenessVerified===false);
  if(byScope.length){
   const viewAt=Date.now(),states={authentication_unproven:'Authentication not evidenced',
    incomplete_traversal:'Traversal incomplete',membership_accounting_missing:'Membership counts missing',
    possible_display_cap:'Possible display cap',membership_unproven:'Gaps or repeats detected'};
   const ready=byScope.map(([key,r])=>{
    const time=Date.parse(r.observedAt),age=viewAt-time,recent=Number.isFinite(age)&&age>=0&&age<=900000;
    const clean=recent&&r.freshTraversal===true&&r.membership==='no_detected_membership_gaps';
    const state=clean?'No membership gaps detected':!Number.isFinite(time)||age<0?'No verified observation':
     age>900000?'Historical observation':r.boardState==='empty'?'Observed empty':
     r.boardState==='disabled'?'Observed disabled':states[r.membership]||'Membership not yet verified';
    return {key,time,clean,state};
   });
   const fresh=ready.filter(x=>x.clean).length;
   add(mount,'p','Recent traversals with no membership gaps detected: '+fresh+' of '+ready.length+
    ' registered sport/platform combinations. This is not a first-party availability check.');
   const details=add(mount,'details','');add(details,'summary','Board coverage by sport and platform');
   const wrapper=add(details,'div','');wrapper.style.overflowX='auto';
   const table=add(wrapper,'table',''),header=add(add(table,'thead',''),'tr','');
   for(const label of ['Sport','Platform','Last observation','Membership'])add(header,'th',label);
   const body=add(table,'tbody','');
   for(const {key,time,state} of ready){const [sport,book]=key.split('/'),row=add(body,'tr','');
    for(const value of [sport.toUpperCase(),book==='prizepicks'?'PrizePicks':'Underdog',
      Number.isFinite(time)?new Date(time).toLocaleString():'—',state])add(row,'td',value);
   }
  }else add(mount,'p','Board membership report pending. Old observations do not verify current availability.');
 }catch{add(mount,'p','Public activity center report pending; no native notification delivery certified.');}
 try{
  const r=await fetch('./data/pickfinder-reviewed-history-performance.json',{cache:'no-store'});
  if(!r.ok)throw Error();
  const ledger=await r.json();
  if(ledger.kind!=='pickfinder_nhlnfl_reviewed_history_performance_v1'||ledger.modelApproved!==false)throw Error();
  add(mount,'h3','NHL and NFL prospective reviewed-history research');
  add(mount,'p',n(ledger.pregameCommitted)+' pregame pairs archived · '+n(ledger.independentCommittedGrades)+' independently graded.');
  const methods=[['existing','Existing model'],['reviewed','Reviewed history'],['challenger','Combined'],['neutral','50% baseline']];
  const rows=Object.entries(ledger.bySport||{}).flatMap(([sport,markets])=>
   Object.entries(markets).flatMap(([market,m])=>methods.flatMap(([key,label])=>{
    const score=m.scores?.[key];
    return m.graded>0&&Number.isFinite(score?.brier)&&Number.isFinite(score?.logLoss)?
      [[sport,market,n(m.graded),n(m.distinctGames),label,score.brier.toFixed(3),score.logLoss.toFixed(3)]]:[];
   })));
  if(!rows.length)add(mount,'p','Awaiting independently graded pairs.');
  else{
   const table=add(mount,'table',''),header=add(add(table,'thead',''),'tr','');
   for(const label of ['Sport','Market','Decisions','Games','Estimate','Brier score','Log loss'])add(header,'th',label);
   const body=add(table,'tbody','');
   for(const data of rows){
    const row=add(body,'tr','');
    for(const value of data)add(row,'td',value);
   }
   for(const [sport,markets] of Object.entries(ledger.bySport||{}))
    for(const [market,m] of Object.entries(markets))
     gameEqualNote(sport+' '+market+' combined model vs existing',m.gameEqualChallengerComparison,m.graded);
  }
 }catch{add(mount,'p','NHL and NFL prospective reviewed-history performance report is pending.');}
 const grading=d.independentGrading||{},coverage=d.researchCoverage||{};
 add(mount,'p','New NBA research forecasts: '+n(d.nbaShadowRows)+' · Archived pregame forecasts: '+n(grading.archivedPregameRows)+' · Not yet due: '+n(grading.pendingNotDue)+' · Due and awaiting results: '+n(grading.pendingDueAfterRun)+' · New independent grades: '+n(grading.newGrades)+' · No production approval.');
 add(mount,'h3','NBA prospective model comparison');
 const gradedMarkets=d.prospectiveComparisonEvidence==='first_git_forecast_and_official_grade_v1'?
  Object.entries(d.prospectiveComparisons||{}).filter(([,row])=>row?.approved===false):[];
 const scoreColumns=['Brier score','Log loss'];
 for(const comparison of [
  {key:'frozenBaselineComparison',title:'Model and pregame baseline',arms:['Model','Pregame baseline']},
  {key:'lowCountFeatureComparison',title:'PickFinder last-ten average on eligible NBA markets',arms:['With last-ten average','Without last-ten average']},
  {key:'matchupFeatureComparison',title:'NBA head-to-head challenger',arms:['With head-to-head history','Native model']},
  {key:'reviewedHistoryFeatureComparison',title:'NBA independently reviewed PickFinder history',arms:['With reviewed history','Existing model'],includeEven:true},
  {key:'workloadFeatureComparison',title:'NBA native minutes challenger',arms:['Minutes-adjusted count model','Unadjusted count model']}
 ]){
  add(mount,'h4',comparison.title);
  const paired=gradedMarkets.map(([market,row])=>[market,row[comparison.key]]).filter(([,p])=>
   Number.isSafeInteger(p?.decided)&&p.decided>0&&
   [p.modelBrier,p.baselineBrier,p.modelLogLoss,p.baselineLogLoss].every(x=>Number.isFinite(x)&&x>=0));
  if(!paired.length){add(mount,'p','Awaiting independently graded pairs.');continue;}
  const table=add(mount,'table',''),header=add(add(table,'thead',''),'tr','');
  for(const label of ['Market','Decisions','Estimate',...scoreColumns])add(header,'th',label);
  const body=add(table,'tbody','');
  for(const [market,p] of paired){
   const arms=[[comparison.arms[0],p.modelBrier,p.modelLogLoss],[comparison.arms[1],p.baselineBrier,p.baselineLogLoss]];
   if(comparison.includeEven&&[p.evenBrier,p.evenLogLoss].every(Number.isFinite))arms.push(['50% baseline',p.evenBrier,p.evenLogLoss]);
   for(const [label,brier,loss] of arms){
    const row=add(body,'tr','');
    for(const value of [market,n(p.decided),label,brier.toFixed(3),loss.toFixed(3)])add(row,'td',value);
   }
  }
 }
 for(const [market,row] of gradedMarkets)
  for(const [key,label] of [['gameEqualFrozenBaselineComparison','Model vs pregame baseline'],
    ['lowCountFeatureComparison','Last-ten average'],['matchupFeatureComparison','Head-to-head'],
    ['reviewedHistoryFeatureComparison','Reviewed history'],['workloadFeatureComparison','Native minutes']]){
   const c=row[key],direct=key==='gameEqualFrozenBaselineComparison';
   gameEqualNote(market+' · '+label,direct?c:c?.gameEqualComparison,direct?row.frozenBaselineComparison?.decided:c?.decided);
  }
 add(mount,'p','Profile attempts: '+n(coverage.profileAttempts)+' · Named dashboard snapshots: '+n(coverage.namedDashboardSnapshots)+' · Game-dialog observations: '+n(coverage.gameDialogObservations)+' · Full filter coverage remains pending.');
 if(coverage.dashboardEvidence&&coverage.allFiltersVerified===false){
  add(mount,'h3','Archived dashboard coverage');
  const wrapper=add(mount,'div','');wrapper.style.overflowX='auto';
  const table=add(wrapper,'table',''),header=add(add(table,'thead',''),'tr','');
  for(const label of ['Dashboard','Sporting data','Explicit empty','Unverified','Explicit page marker','Complete page sequences'])add(header,'th',label);
  const body=add(table,'tbody','');
  for(const name of ['Games','Discrepancies','Popular']){
   const s=coverage.dashboardEvidence[name];if(!s)continue;
   const tr=add(body,'tr','');
   for(const v of [name,n(s.dataSnapshots),n(s.explicitEmptySnapshots),n(s.unverifiedSnapshots),n(s.withExplicitPage),n(s.verifiedSequences)])add(tr,'td',v);
  }
  add(mount,'p','A complete page sequence applies only to its captured selection. Empty is not evidence of offseason or full filter coverage.');
  const f=coverage.verifiedFilterScopes;
  if(f)add(mount,'p',n(f.native)+' native-only · '+n(f.custom)+' custom-only · '+n(f.mixed)+' mixed filter selections read back during capture. Selection verification alone does not establish pagination.');
 }
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
  const res=await fetch('./data/pickfinder-public-research-directory.json',{cache:'no-store'});if(!res.ok)throw Error();
  const d=await res.json();
  if(d.kind!=='pickfinder_public_research_directory_v1'||d.actualOfferIdentityVerified!==false||
     d.modelInputsApproved!==false||!Array.isArray(d.directories)||!Array.isArray(d.researchRoutes)||
     !Number.isFinite(Date.parse(d.observedAt)))throw Error();
  const dirs=d.directories.filter(x=>x.status==='listing_count_matches'&&Number.isSafeInteger(x.distinctPlayerLinks)&&
     /^https:\/\/www\.pickfinder\.app\/leagues\/[a-z0-9-]+\/players$/.test(x.sourceUrl));
  add(mount,'h3','Public PickFinder research directory');
  add(mount,'p',n(d.researchRoutes.length)+' linked league routes. '+n(dirs.length)+' directory counts match the publisher’s listing. Observed '+new Date(d.observedAt).toLocaleString()+'. These are source links, not independently reconciled player IDs or live offers.');
  const list=add(mount,'ul','');
  for(const x of dirs){const li=add(list,'li','');const link=add(li,'a',x.league+' · '+n(x.distinctPlayerLinks)+' player links');link.href=x.sourceUrl;}
 }catch{add(mount,'p','Public PickFinder research directory inventory is unavailable.');}
 try{
  const res=await fetch('./data/pickfinder-public-research-tables-index.json',{cache:'no-store'});
  if(!res.ok)throw Error();
  const d=await res.json();
  if(d.kind!=='pickfinder_public_research_tables_index_v1'||d.modelInputsApproved!==false||
     ![d.sources,d.tables,d.rows].every(Number.isSafeInteger))throw Error();
  add(mount,'p',n(d.rows)+' reference rows across '+n(d.tables)+' structured tables and '+n(d.sources)+' linked research views. These publisher reference values are not authenticated live offers or model-qualified inputs.');
 }catch{add(mount,'p','Public PickFinder reference table inventory is unavailable.');}
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
   for(const h of ['Rank','Player','Selection','Projection','Raw estimate','Source-clock no-vig benchmark'])add(hr,'th',h);
   const body=add(table,'tbody','');for(const x of list){const tr=add(body,'tr','');for(const v of [x.rankWithinTier,x.player,x.side+' '+x.line+' '+x.market,Number(x.projection).toFixed(2),(100*x.rawConditionalEstimate).toFixed(1)+'%',x.marketBenchmarkSourceClockVerified!==true||!Number.isFinite(x.marketEstimate)?'Unavailable':(100*x.marketEstimate).toFixed(1)+'%'])add(tr,'td',v);}
  }
 }catch{add(mount,'p','Fresh model ranking report unavailable; no stale ranking displayed.');}

 }catch{mount.textContent='Public PickFinder validation report is pending. Existing NHL/NFL research remains unchanged.';}
})();
