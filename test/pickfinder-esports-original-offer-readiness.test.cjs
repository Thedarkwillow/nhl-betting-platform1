'use strict';
const t=require('node:test'),a=require('node:assert/strict');
const {report}=require('../scripts/pickfinder-esports-original-offer-readiness.cjs');
const {seriesStress}=require('../scripts/pickfinder-valorant-retrospective.cjs');
const {reconcileSeries}=require('../scripts/pickfinder-esports-series-review.cjs');
t('title coverage does not turn archive observations or retrospectives into settlement',()=>{
 const r=report({boards:{esportsEvidence:{cs2:{offerObservations:7,explicitSupportedScopes:4},cod:{offerObservations:12},valorant:{offerObservations:10,explicitSupportedScopes:10}}}},
  {kind:'pickfinder_valorant_matched_retrospective_v1',prospective:false,platformSettlementVerified:false,modelApproved:false,examples:4,series:2});
 a.equal(r.bySport.cs2.explicitSupportedScopeObservations,4);
 a.equal(r.bySport.cod.explicitSupportedScopeObservations,0);
 a.equal(r.bySport.lol.archiveOfferObservations,0);
 a.equal(r.bySport.valorant.independentlyMatchedRetrospectiveExamples,4);
 a.equal(r.bySport.valorant.originalPlatformSettlementsVerified,0);
 a.equal(r.bySport.valorant.prospectiveGradesVerified,0);
 a.equal(report(null,{examples:99}).bySport.valorant.independentlyMatchedRetrospectiveExamples,0);
});
t('series-equal comparison cannot be dominated by extra lines from one series',()=>{
 const rows=[...Array.from({length:9},()=>({event:'one',outcome:1,l5:.9,l10:.8})),{event:'two',outcome:0,l5:.9,l10:.8}];
 const x=seriesStress(rows);
 a.equal(x.series,2);
 a.ok(Math.abs(x.aggregates.l5.brier-.41)<1e-12);
 a.equal(x.aggregates.l5.betterThanEvenOnSeries,1);
 a.equal(x.aggregates.even.brier,.25);
 a.ok(Math.abs(x.aggregates.l5.perSeriesBrierRange[0]-.01)<1e-12);
 a.ok(Math.abs(x.aggregates.l5.perSeriesBrierRange[1]-.81)<1e-12);
 a.equal(x.uncertaintyEstimated,false);
 a.equal(seriesStress([]).aggregates.l5.brier,null);
});
t('additional pregame listings for postponed and substitute cases do not prove settlement',()=>{
 const prior=require('../config/esports/pickfinder-series-review-remainder-2026-11-27.json');
 const base=require('../config/esports/pickfinder-series-review-2026-11-27.json');
 const original=base.series.find(x=>x.seriesUrl.includes('/794180/'));
 const conflict=prior.series.find(x=>x.rosterConflicts?.length).rosterConflicts[0];
 const fixture=prior.series.find(x=>x.rosterConflicts?.includes(conflict));
 const v=original.roster[0]||prior.series.find(x=>x.sourceEventId===original.sourceEventId).additionalRoster[0];
 const x=reconcileSeries([
  {sport:fixture.sport,sourceEventId:fixture.sourceEventId,profilePath:conflict.pickfinderProfilePath,sourcePlayer:conflict.label,maps:[1,2]},
  {sport:original.sport,sourceEventId:original.sourceEventId,profilePath:v.pickfinderProfilePath,sourcePlayer:v.label,maps:[1,2]}
 ],'2026-11-28T00:00:00Z');
 a.equal(x.summary.officialSettlementVerified,0);
 a.equal(x.rows[0].independentSeriesEvidence.status,'roster_conflict');
 a.match(x.rows[0].independentSeriesEvidence.rosterExclusion.corroboratingPregameOfferReference,/ud-288863$/);
 a.equal(x.rows[1].independentSeriesEvidence.status,'map_scope_unresolved');
 a.match(x.rows[1].independentSeriesEvidence.scheduleDisposition.corroboratingListing,/154715$/);
});
