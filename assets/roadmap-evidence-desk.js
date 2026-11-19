"use strict";
// Counts and timestamps from already allowlisted public reports only.
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.RoadmapEvidenceDesk=api;})(typeof globalThis==="undefined"?this:globalThis,function(){
 const parse=s=>typeof s==="string"?Date.parse(s):NaN;
 const count=x=>Number.isInteger(x)&&x>=0;
 function age(at,now){const t=parse(at);return Number.isFinite(t)&&Number.isFinite(now)&&t<=now?Math.floor((now-t)/60000):null;}
 function model({health,board,standard,goblin,demon,movement,progress,platformStatus,scorecards}={},now=Date.now()){
  const rows=[];
  const archive=health?.kind==="public_nhl_nfl_pacific_morning_collection_health_v1"&&age(health.generatedAt,now)!==null;
  for(const [label,k] of [["6 AM","06:00"],["9 AM","09:00"]]){const s=archive?health.slots?.[k]:null;rows.push({label:label+" archive",value:s?.status==="privately_archived_complete"&&count(s.nhlOffers)&&count(s.nflOffers)&&age(s.observedAt,now)!==null?"NHL "+s.nhlOffers+" / NFL "+s.nflOffers:"Unverified",ageMinutes:age(s?.observedAt,now)});}
  const odds=archive?health.sportsbookPreboard:null;
  if(odds?.kind==="public_preboard_sportsbook_evidence_status_v1"&&
     odds.actualProviderRequestsMadeByAudit===0&&
     odds.independentProbabilityBenchmarkVerified===false&&
     odds.liveAppOfferVerified===false){
    for(const slot of ["05:45","08:45"]){
      const z=odds.slots?.[slot],status=z?.status;
      if(!["not_due","no_fresh_preboard_odds_archive",
        "archived_before_board_unmatched","archived_preboard_unmatched"].includes(status))
        continue;
      const note=status==="not_due"?"Not due":
       status==="no_fresh_preboard_odds_archive"?"No verified fresh quote archive":
       "Archived preboard odds; exact player/market matches unverified";
      rows.push({label:slot+" Pacific sportsbook evidence",
       value:note,ageMinutes:age(z?.capturedAt,now)});
    }
  }
  const a=board?.kind==="public_nhl_research_cards_not_internal_model"?age(board.boardAt,now):null;
  const live=a!==null&&a<30&&board.researchFreshAtBuild===true&&Array.isArray(board.props);
  rows.push({label:"NHL rankings",value:live?board.props.length+" fresh-source research rows":"No fresh approved rows",ageMinutes:a});
  for(const [label,d] of [["Standard",standard],["Goblin",goblin],["Demon",demon]]){
   const minutes=d?.kind==="public_nfl_derived_research_cards_v1"&&d?.tier===label?age(d.asOf,now):null;
   const ready=minutes!==null&&minutes<30&&d.status==="fresh_derived_research_only"&&Array.isArray(d.cards);
   rows.push({label:"NFL "+label,value:ready?d.cards.length+" fresh-source research cards":"No fresh approved cards",ageMinutes:minutes});
  }
  if(movement?.kind==="public_safe_nhl_nfl_board_line_movement_counts_v1"&&movement.rawLinesPublished===0&&movement.privateOfferIDsPublished===0&&age(movement.laterCaptureAt,now)!==null){
   for(const sport of ["NHL","NFL"]){const m=movement.sports?.[sport];if(m&&["existingLineChanged","newSourceOfferIDs","noLongerSeenSourceIDsUnverified","existingTierChanged","existingSideAvailabilityChanged"].every(k=>count(m[k])))rows.push({label:sport+" archived changes",value:m.existingLineChanged+" line / "+m.existingTierChanged+" tier / "+m.existingSideAvailabilityChanged+" side / "+m.newSourceOfferIDs+" new / "+m.noLongerSeenSourceIDsUnverified+" absent (not confirmed removed)",ageMinutes:age(movement.laterCaptureAt,now)});}
  }
  if(progress?.kind==="public_research_progress_counts_v1"&&progress.proprietaryRowsPublished===0&&progress.calibrationApproved===false&&progress.modelPromoted===false&&age(progress.sourceReportAt,now)!==null){
   const a=age(progress.sourceReportAt,now),p=progress.periodHistory;
   if(p&&count(p.accountedDays)&&count(p.calendarDays)&&p.calendarDays>0&&p.accountedDays<=p.calendarDays)rows.push({label:"NHL historical periods",value:p.accountedDays+" / "+p.calendarDays+" dates accounted; "+(p.calendarDays-p.accountedDays)+" pending",ageMinutes:a});
   const v=progress.validationSample;
   if(v&&v.probabilitiesCalibrated===false&&v.modelPromoted===false&&v.platformPayoutROI===null&&
      age(v.sourceReportAt,now)!==null&&parse(v.sourceReportAt)<=parse(progress.sourceReportAt)){
    if(count(v.nhlStandardFrozenDecisions)&&count(v.nhlStandardFrozenGames)&&
       count(v.nhlStandardFrozenPacificSlates))
     rows.push({label:"NHL Standard prospective sample",
      value:v.nhlStandardFrozenDecisions+" original decisions in "+v.nhlStandardFrozenGames+
       " games / "+v.nhlStandardFrozenPacificSlates+" Pacific slates; evidence, not calibrated confidence",
      ageMinutes:age(v.sourceReportAt,now)});
    if(count(v.matchedFrozenCalibrationDecisions)&&count(v.independentlySupportedCalibrationGroups))
     rows.push({label:"Frozen calibration trials",
      value:v.matchedFrozenCalibrationDecisions+" genuine frozen trials; "+v.independentlySupportedCalibrationGroups+
       " groups meeting sample gate; probability release withheld",
      ageMinutes:age(v.sourceReportAt,now)});
    if(count(v.powerFlexRegisteredReferenceEntries)&&count(v.powerFlexResolvedReferenceEntries)&&
       v.powerFlexResolvedReferenceEntries<=v.powerFlexRegisteredReferenceEntries)
     rows.push({label:"Power/Flex 2–6 paper scenarios",
      value:v.powerFlexResolvedReferenceEntries+" resolved / "+
       v.powerFlexRegisteredReferenceEntries+" registered across nine overlapping formats; payout unverified",
      ageMinutes:age(v.sourceReportAt,now)});
   }
   const selective=progress.selectiveAccuracy;
   if(selective?.kind==="public_selective_accuracy_first_git_counts_v1"&&
      selective.bothPoliciesFutureOnly===true&&selective.calibrationApproved===false&&
      selective.automatedLineupsApproved===false&&
      selective.originalPlatformSettlementVerified===false&&
      selective.independentOutperformanceEstablished===false&&
      age(selective.nhlReportAt,now)!==null&&age(selective.nflReportAt,now)!==null&&
      parse(selective.nhlReportAt)<=parse(progress.sourceReportAt)&&
      parse(selective.nflReportAt)<=parse(progress.sourceReportAt)){
    const h=selective.nhl,n=selective.nfl;
    if([h?.registered,h?.eligible,h?.abstained,h?.pending,h?.decided,
       n?.included,n?.pending,n?.decided,n?.distinctGames,n?.distinctGameDates].every(count)&&
       h.registered>=h.eligible&&h.registered>=h.abstained&&
       h.eligible>=h.decided+h.pending&&n.included>=n.decided+n.pending){
      rows.push({label:"NHL NEW selective policy (future-only)",
       value:h.decided+" graded / "+h.pending+" pending / "+h.abstained+
        " abstained from "+h.registered+" registered; no validated edge",
       ageMinutes:age(selective.nhlReportAt,now)});
      rows.push({label:"NFL NEW selective policy (future-only)",
       value:n.decided+" graded / "+n.pending+" pending from "+n.included+
        " included across "+n.distinctGames+" games; no validated edge",
       ageMinutes:age(selective.nflReportAt,now)});
    }
   }
   const gob=progress.goblinFuture;
   if(gob?.kind==="public_goblin_independent_future_research_counts_v1"&&
      age(gob.sourceReportAt,now)!==null&&
      gob.modelPromoted===false&&gob.prospectiveEdgeVerified===false&&
      gob.payoutsAndSettlementsVerified===false&&
      gob.privatePlayerRowsPublished===0&&
      gob.calibration?.approved===false&&
      gob.lineup?.approvedSlips===0){
    const h=gob.nhl,n=gob.nfl;
    if([h?.examined,h?.newCandidates,h?.newAbstentions,
        h?.archivedFirstGit,h?.futureRegistered,h?.futureDecided].every(count)){
      rows.push({label:"NHL Goblin frozen research",
       value:h.futureRegistered+" unique registered / "+h.futureDecided+
        " official decisions; "+h.newCandidates+" newly selected / "+
        h.newAbstentions+" newly abstained; "+
        (count(h.duplicatesQuarantined)?h.duplicatesQuarantined+" duplicate archive rows excluded; ":"")+
        (h.selectivePolicyRequiresNewSource?"new screening policy awaiting next captured source; ":"")+
        "no calibrated edge",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    // Independent new-policy selectivity audit is not a win-rate sample.
    const screening=h?.postPolicyScreening;
    if(screening?.kind==="public_goblin_post_policy_screening_counts_v1"&&
       screening.verifiedAccuracy===false&&screening.calibrated===false&&
       screening.bettable===false&&
       [screening.screened,screening.selected,screening.abstained,
        screening.unknownStatus,screening.lateOrUnverified].every(count)&&
       screening.selected+screening.abstained+screening.unknownStatus===screening.screened){
      const reasons=screening.abstentionReasons||{};
      rows.push({label:"NHL Goblin NEW-policy screening",
       value:screening.selected+" accepted / "+screening.abstained+
        " abstained from "+screening.screened+" eligible first-Git records; "+
        (count(reasons.model_direction_not_on_original_offered_side)?
          reasons.model_direction_not_on_original_offered_side+" unoffered sides; ":"")+
        (screening.unknownStatus?"screen status anomaly; ":"")+
        (screening.lateOrUnverified?screening.lateOrUnverified+" late/unverified excluded; ":"")+
        "accuracy and payout EV unverified",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    const scheduled=n?.gameSchedule;
    if(scheduled?.kind==="public_nfl_goblin_independent_game_schedule_counts_v1"&&
      scheduled.playerGSISVerified===false&&scheduled.gameDayActiveVerified===false&&
      scheduled.sourceFirstParty===false&&scheduled.modelPromoted===false&&
      scheduled.approvedPicks===0&&
      [scheduled.verifiedGames,scheduled.sourceGameKeys,scheduled.conflicting,
       scheduled.missing,scheduled.ambiguous].every(count)&&
      scheduled.verifiedGames+scheduled.conflicting+scheduled.missing+
       scheduled.ambiguous===scheduled.sourceGameKeys){
      rows.push({label:"NFL Goblin independent schedule ID bridge",
       value:scheduled.verifiedGames+" / "+scheduled.sourceGameKeys+
        " source game keys reconciled to archived future NFL schedule; "+
        "provider-to-GSIS player ID and game-day active status NOT verified",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    const identities=n?.conditionalGSIS;
    if(identities?.kind==="public_nfl_conditional_gsis_research_counts_v1"&&
      identities.verifiedSharedProviderIDs===0&&
      identities.verifiedGamedayActive===0&&
      identities.approvedSelections===0&&identities.probabilityApproved===false&&
      [identities.priorRosterCandidates,identities.sourcePlayers,
       identities.ambiguous,identities.insufficientPriorWeeks,
       identities.missingRoster,identities.conflictingSource].every(count)&&
      identities.priorRosterCandidates<=identities.sourcePlayers){
      rows.push({label:"NFL Goblin free GSIS candidate matching",
       value:identities.priorRosterCandidates+" of "+
        identities.sourcePlayers+" unique source players conditionally paired with "+
        "prior-week GSIS records; "+identities.ambiguous+" ambiguous; "+
        "not independently shared-ID verified and NOT game-day active",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    const overlap=n?.identityInjuryOverlap;
    if(overlap?.kind==="public_nfl_conditional_gsis_official_injury_overlap_v1"&&
       overlap.verifiedPrizePicksGSIS===0&&overlap.gameDayActiveConfirmed===0&&
       overlap.approvedPicks===0&&
       [overlap.provisionalPlayers,overlap.officialInjuryGSISCorroborations,
        overlap.outExcluded,overlap.questionableHeld,overlap.doubtfulHeld,
        overlap.unknownStatus,overlap.identityConflicts].every(count)&&
       overlap.outExcluded+overlap.questionableHeld+overlap.doubtfulHeld===
        overlap.officialInjuryGSISCorroborations){
      rows.push({label:"NFL provisional GSIS + official injury overlap",
       value:overlap.officialInjuryGSISCorroborations+" conditional GSIS identities matched "+
        "official injury records: "+overlap.outExcluded+" OUT, "+
        overlap.questionableHeld+" QUESTIONABLE, "+overlap.doubtfulHeld+" DOUBTFUL; "+
        overlap.unknownStatus+" without an explicit matching injury status; "+
        "no verified direct PP identifier or game-day ACTIVE status",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    const officialRisk=n?.officialInjuryStatuses;
    if(officialRisk?.kind==="public_nfl_explicit_official_injury_status_counts_v1"&&
       officialRisk.medicalClearanceVerified===false&&
       officialRisk.gameDayActiveVerified===false&&officialRisk.bettingEligible===0&&
       [officialRisk.explicitStatuses,officialRisk.ruledOut,
        officialRisk.questionable,officialRisk.doubtful].every(count)&&
       officialRisk.ruledOut+officialRisk.questionable+officialRisk.doubtful===officialRisk.explicitStatuses){
      rows.push({label:"NFL first-party injury status matches",
       value:officialRisk.ruledOut+" officially OUT / "+
        officialRisk.questionable+" QUESTIONABLE / "+
        officialRisk.doubtful+" DOUBTFUL ("+officialRisk.explicitStatuses+
        " explicitly reported GSIS-linked statuses); not a full game-day ACTIVE list",
       ageMinutes:age(officialRisk.reportCapturedAt,now)});
    }
    const activeMentions=n?.positiveGameStatements;
    if(activeMentions?.kind==="public_nfl_official_explicit_active_mention_research_v1"&&
      activeMentions.sharedProviderIDsConfirmed===0&&
      activeMentions.fullOfficialActiveRosterVerified===false&&
      activeMentions.approvedPicks===0&&
      activeMentions.playerIdentityAndGamedayBothVerified===false&&
      [activeMentions.officialArticles,activeMentions.explicitMentions,
       activeMentions.conditionalPlayersCorroborated].every(count)&&
      activeMentions.conditionalPlayersCorroborated<=activeMentions.explicitMentions){
      rows.push({label:"NFL official named active statements (research)",
       value:activeMentions.conditionalPlayersCorroborated+
        " provisional identities corroborated by "+activeMentions.explicitMentions+
        " explicit active statements across "+activeMentions.officialArticles+
        " dated NFL.com articles; no complete 47/48-player gameday roster or verified PP ID",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    const gaps=n?.prerequisiteGaps;
    if(gaps?.kind==="public_nfl_goblin_missing_prerequisites_v1"&&
       gaps.rowsMayHaveMultipleBlockers===true&&gaps.verifiedActive===false&&
       gaps.eligiblePicks===0&&
       [gaps.originalOffersAudited,gaps.officialGame,gaps.providerToGSIS,
        gaps.positiveActiveRoster].every(count)&&
       [gaps.officialGame,gaps.providerToGSIS,gaps.positiveActiveRoster].every(x=>x<=gaps.originalOffersAudited)){
      rows.push({label:"NFL Goblin identity prerequisites",
       value:gaps.officialGame+" missing official-game bridges / "+
        gaps.providerToGSIS+" missing exact GSIS links / "+
        gaps.positiveActiveRoster+" missing verified active rosters"+
        " (overlapping blockers, not distinct picks); no bettable model",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    if(n?.supportedOpportunityResearchImplemented===true&&
       count(n.firstGitEligible)){
      rows.push({label:"NFL Goblin opportunity model",
       value:n.firstGitEligible+" eligible first-Git records; "+
        (count(n.originalGoblinOffersAudited)?n.originalGoblinOffersAudited+" original Goblin rows audited; ":"")+
        (n.freshFullPlayerIdentityAndAvailabilityVerified?"verified pregame identity and availability":"exact game/GSIS bridge and positive active-roster confirmation pending")+
        "; no released bets",
       ageMinutes:age(gob.sourceReportAt,now)});
    }
    rows.push({label:"Goblin Power/Flex 2–6",
     value:"Exact account Goblin payout quote and prospective correlation required; "+
      "no verified EV or approved slips",
     ageMinutes:age(gob.sourceReportAt,now)});
   }
   const ideas=progress.modelIdeas;
   if(ideas?.kind==="public_open_model_research_coverage_v1"&&
      age(ideas.sourceReportAt,now)!==null&&
      parse(ideas.sourceReportAt)<=parse(progress.sourceReportAt)&&
      ideas.modelPromoted===false&&ideas.probabilityReleaseApproved===false&&
      ideas.outperformanceProven===false&&ideas.optimizedLineupsApproved===false&&
      ideas.nhl?.realPlatformLinesEvaluated===false){
    const h=ideas.nhl;
    if(h.fullRosterAuditAvailable===true&&
       count(h.completeOfficialGames)&&count(h.zeroShotAppearancesRetained)&&
       count(h.missingShotRows)){
      rows.push({label:"NHL official zero-shot data audit",
       value:h.completeOfficialGames+" complete game rosters; "+
        h.zeroShotAppearancesRetained+" verified zero-shot appearances; "+
        h.missingShotRows+" missing stat fields; "+(h.fullRosterAuditPass?"roster checks passed":"data integrity needs review"),
       ageMinutes:age(ideas.sourceReportAt,now)});
    }
    if(count(h.syntheticShotsPredicted)&&count(h.syntheticBlockedShotsPredicted))
      rows.push({label:"NHL two-stage model research",
       value:h.syntheticShotsPredicted+" shot / "+h.syntheticBlockedShotsPredicted+
        " blocked-shot historical synthetic decisions; NOT app-line hit rate",
       ageMinutes:age(ideas.sourceReportAt,now)});
    if(ideas.nfl?.routesAndWOPRLiveVerified===false)
      rows.push({label:"NFL usage and kicking research",
       value:(ideas.nfl.priorWeekUsageLabPresent?"Earlier-week usage lab available":"Earlier-week usage evidence pending")+
        "; kicker lab "+(ideas.nfl.kickingLabPresent?"available":"pending")+
        "; live route/WOPR data unverified",ageMinutes:age(ideas.sourceReportAt,now)});
    if(ideas.nba?.pregameFeedVerified===false&&
       ideas.esports?.pregameFeedVerified===false)
      rows.push({label:"NBA and esports opportunity models",
       value:"Minutes, round-length and team-kill-share adapters in research; verified live inputs pending",
       ageMinutes:age(ideas.sourceReportAt,now)});
   }
   for(const sport of ["nhl","nfl"]){const e=progress.evidence?.[sport];if(count(e?.firstObserved)&&count(e?.matchedCalibrationRows))rows.push({label:sport.toUpperCase()+" calibration evidence",value:e.firstObserved+" observed outcomes; "+e.matchedCalibrationRows+" held-out rows; not approved",ageMinutes:a});}
   const o=progress.sportsbook;if(o&&count(o.strictMatched)&&count(o.conditionalArchived)&&o.verifiedLiveConsensus===false)rows.push({label:"Sportsbook benchmark evidence",value:o.strictMatched+" strict / "+o.conditionalArchived+" conditional archived matches; live availability unverified",ageMinutes:a});
   const mf=progress.sportsbook?.matchFunnel;
   if(mf?.kind==="public_sportsbook_exact_match_failure_counts_v1"&&
      mf.exactPlatformIdentityVerified===false&&mf.authenticatedClosingLine===false&&
      mf.modelPromoted===false&&mf.paidProviderRequests===0&&
      count(mf.archivedSnapshots)){
    const names={no_event:"unmatched event",no_exact_name:"unmatched player identity",
     no_market:"different market",no_same_threshold:"different threshold",
     no_preexisting_frame:"missing frozen comparison",
     ambiguous_identity:"ambiguous identity",conditional_match:"conditional only"};
    const stages=Object.keys(names);
    for(const sport of ["NHL","NFL"]){
     const o=mf.bySport?.[sport];
     if(o&&count(o.native)&&stages.every(k=>count(o[k]))&&
        stages.reduce((a,k)=>a+o[k],0)===o.native){
      const ranked=stages.filter(k=>k!=="conditional_match"&&o[k]>0)
       .sort((a,b)=>o[b]-o[a]||a.localeCompare(b));
      rows.push({label:sport+" sportsbook match blockers",
       value:o.native+" archived groups; "+
         (ranked.length?o[ranked[0]]+" "+names[ranked[0]]:"no documented failing stage")+
         "; "+o.conditional_match+" conditional; app identity unverified",
       ageMinutes:a});
     }
    }
   }
   for(const sport of ["NHL","NFL"]){const s=progress.lineupResearch?.[sport];if(count(s?.distinctResolvedSlates))rows.push({label:sport+" lineup evidence",value:s.distinctResolvedSlates+" distinct resolved slates; not calibrated",ageMinutes:a});}
   if(count(progress.paper?.authenticatedSettledEntries)&&progress.paper.verifiedROI===null)rows.push({label:"Settlement evidence",value:progress.paper.authenticatedSettledEntries+" authenticated entries; verified ROI unavailable",ageMinutes:a});
  }
  if(scorecards?.kind==="public_nhl_nfl_original_git_frozen_model_scorecards_v1"&&age(scorecards.sources?.nhlOriginalFrozenBaselineAt,now)!==null){
   const q=scorecards.nhl?.standardOriginalSelections;
   if(q?.calibrated===false&&q.originalPlatformSettlementVerified===false&&count(q.decided)&&q.decided>0&&count(q.distinctGames)&&q.distinctGames>=10&&[q.correct,q.incorrect,q.hypotheticalHigherWins,q.hypotheticalLowerWins].every(count)&&q.correct+q.incorrect===q.decided&&q.hypotheticalHigherWins+q.hypotheticalLowerWins===q.decided){const fmt=n=>(100*n/q.decided).toFixed(2)+"%";rows.push({label:"NHL Standard historical baseline",value:fmt(q.correct)+" model / "+fmt(q.hypotheticalHigherWins)+" always Higher / "+fmt(q.hypotheticalLowerWins)+" always Lower — "+q.decided+" decided; descriptive, not a forecast",ageMinutes:age(scorecards.sources.nhlOriginalFrozenBaselineAt,now)});}
  }
  if(scorecards?.kind==="public_nhl_nfl_original_git_frozen_model_scorecards_v1"&&age(scorecards.sources?.nhlOriginalFrozenBaselineAt,now)!==null){const a=scorecards.nhl?.standardProbabilityAudit;if(a?.calibrated===false&&a.releaseApproved===false&&a.decided>=20&&Number.isFinite(a.meanUncalibratedEstimatedProbability)&&Number.isFinite(a.observedSelectedRate))rows.push({label:"NHL Standard probability calibration",value:(100*a.meanUncalibratedEstimatedProbability).toFixed(1)+"% mean estimated vs "+(100*a.observedSelectedRate).toFixed(1)+"% observed, "+a.pastOnlyTrainingDecisions+" prepolicy training decisions; NOT calibrated",ageMinutes:age(scorecards.sources.nhlOriginalFrozenBaselineAt,now)});}
  if(scorecards?.kind==="public_nhl_nfl_original_git_frozen_model_scorecards_v1"&&age(scorecards.sources?.nflFirstGitForecastAuditAt,now)!==null){
   const q=scorecards.nfl?.firstDistinctThreshold;
   if(q?.calibrated===false&&q.settlementVerified===false&&q.firstGitSameThresholdOnly===true&&count(q.decided)&&q.decided>0&&count(q.correct)&&count(q.incorrect)&&q.correct+q.incorrect===q.decided&&Number.isFinite(q.alwaysHigherObservedRate)&&Number.isFinite(q.alwaysLowerObservedRate)&&Math.abs(q.alwaysHigherObservedRate+q.alwaysLowerObservedRate-1)<.00001){const fmt=x=>(100*x).toFixed(2)+"%";rows.push({label:"NFL first-threshold baseline",value:fmt(q.modelObservedRate)+" model / "+fmt(q.alwaysHigherObservedRate)+" Higher / "+fmt(q.alwaysLowerObservedRate)+" Lower — "+q.decided+" distinct thresholds in "+q.distinctFinalGames+" games; not independent wagers",ageMinutes:age(scorecards.sources.nflFirstGitForecastAuditAt,now)});}
  }
  if(platformStatus?.kind==="public_platform_integration_status_v1"&&platformStatus.rawRowsPublished===0&&age(platformStatus.checkedAt,now)!==null){
   for(const sport of ["NHL","NFL"]){const s=platformStatus.underdog?.[sport];if(s?.connected===true&&count(s.sampleRows)&&count(s.eligibleRows)&&s.eligibleRows<=s.sampleRows&&s.completeBoardVerified===false&&s.originalPlatformVerified===false)rows.push({label:"Underdog "+sport+" integration",value:(s.eligibleRows===0?"Connection verified; no eligible sample rows; board unverified":"Partial sample verified; full board unverified")+(count(s.scheduleMatchedRows)&&s.scheduleMatchedRows<=s.sampleRows&&s.playerIdentityVerified===false?"; "+s.scheduleMatchedRows+"/"+s.sampleRows+" schedule candidates; player identity not verified":"")+(count(s.rosterCandidateRows)&&s.rosterCandidateRows<=s.sampleRows?"; "+s.rosterCandidateRows+" roster candidates":"")+(count(s.priorRosterCandidateRows)&&s.priorRosterCandidateRows<=s.sampleRows?"; "+s.priorRosterCandidateRows+" prior-week candidates only":"")+(count(s.researchCandidateSides)&&s.researchCandidateSides<=2*s.sampleRows&&count(s.modelFamilyCandidateSides)&&s.modelFamilyCandidateSides<=s.researchCandidateSides?"; "+s.researchCandidateSides+" research sides, "+s.modelFamilyCandidateSides+" existing model-family candidates":""),ageMinutes:age(platformStatus.checkedAt,now)});}
  }
  return {rows,quotaRemaining:null,providerFailureReason:null,scope:"Archive evidence only; no verified live app availability or provider quota."};
 }
 function historyChart(values,cutoff){
  const at=parse(cutoff);if(!Number.isFinite(at)||!Array.isArray(values))return [];
  const eligible=values.filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(parse(x.date))&&x.date<cutoff.slice(0,10)&&Number.isFinite(x.value)&&x.value>=0);
  if(new Set(eligible.map(x=>x.date)).size!==eligible.length)return [];
  return eligible.sort((a,b)=>a.date.localeCompare(b.date)).slice(-20);
 }
 async function init(){
  const host=document.getElementById("roadmapDailyEvidence");if(!host)return;
  const paths={health:"data/collection-health.json",board:"data.json",standard:"data/nfl-research-cards.json",goblin:"data/nfl-goblin-research-cards.json",demon:"data/nfl-demon-research-cards.json",movement:"data/source-line-movement.json",progress:"data/research-evidence-progress.json",platformStatus:"data/underdog-integration-status.json",scorecards:"data/model-scorecards.json"};
  const result=Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([k,p])=>{try{const r=await fetch("./"+p,{cache:"no-store"});return [k,r.ok?await r.json():null];}catch{return [k,null];}})));
  function draw(){const v=model(result);host.replaceChildren();const dl=document.createElement("dl");dl.className="roadmap-health-grid";
   for(const item of v.rows){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=item.label;dd.textContent=item.value+(item.ageMinutes===null?"":" · "+item.ageMinutes+" min old");dl.append(dt,dd);}
   const note=document.createElement("p");note.className="minor";note.textContent=v.scope+" Live quota and failure cause not reported.";host.append(dl,note);}
  draw();
 }
 if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();}
 return {model,historyChart};
});
