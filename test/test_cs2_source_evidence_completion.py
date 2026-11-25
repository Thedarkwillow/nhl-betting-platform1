import unittest,json,pathlib,sys,datetime
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from flash_cs2_keyless_evaluation import sample,graded
from cs2_conflict_profile_audit import audit
class Tests(unittest.TestCase):
 def test_sample(self):
  x={"sample":True,"sport":"cs2","rows":[{"player":"p","eventId":"e","stat":"kills_on_map_1","line":10.5,"startTime":"2026-11-24T00:00:00Z"}]}
  r=sample(x,datetime.datetime(2026,11,25,tzinfo=datetime.timezone.utc))
  self.assertEqual(r["alreadyStarted"],1);self.assertEqual(r["originalOffersVerified"],0)
 def test_csv_conflict(self):
  s=b"player,event_id,stat,line,outcome,actual\np,e,kills,10.5,over,11\np,e,kills,10.5,under,11\nq,e,kills,11,push,11\n"
  r=graded(s);self.assertEqual(r["numericDisagreements"],1);self.assertEqual(r["conflictingContracts"],1);self.assertEqual(r["sourceOutcomeCounts"],{"Push":1})
 def test_conflict_research_no_promotion(self):
  r={"kind":"esports_identity_registry_v1","links":[{"left":["CS2","ektarr","1"],"right":["CS2","steam64","123"],"status":"conflict","evidenceIds":["x"]}]}
  p={"kind":"restricted_hltv_steam_secondary_profile_review_v2","candidates":[{"alias":"p","hltvPlayerId":"1","steamIdCandidate":"456","secondaryProfile":"public"}]}
  x=audit(r,p,[{"player":"ektarr:1","alias":"p","teamLabel":"t"}])
  self.assertEqual(x["counts"],{"profile_candidate_disagrees":1});self.assertEqual(x["authoritativeConflictsResolved"],0)
 def test_csv_documented_preamble_and_multiple_column_labels(self):
  s=b"# Flash Props API, last 7 days.\n# source details\n\nplayer,event_id,stat,market,line,outcome,actual,start_time,captured_at\np,e,kills_on_map_1,Kills Map 1,10.5,over,11,2026-11-25T06:00:00Z,2026-11-25T05:00:00Z\n"
  r=graded(s);self.assertEqual(r["preambleLinesSkipped"],3);self.assertEqual(r["rows"],1);self.assertEqual(r["distinctContractRows"],1);self.assertEqual(r["timedPregameRows"],1);self.assertEqual(r["numericDisagreements"],0);self.assertEqual(r["verifiedOriginalLines"],0)
 def test_archived_review_exact_coverage_and_conflict_links(self):
  from cs2_conflict_profile_audit import review_claims
  steam="76561198000000001"
  r={"links":[{"left":["CS2","ektarr","7"],"right":["CS2","steam64",steam],"status":"conflict","evidenceIds":["abc"]}]}
  p={"candidates":[{"hltvPlayerId":"1","steamIdCandidate":"76561198000000002","hltvProfile":"https://www.hltv.org/player/1/a","secondaryProfile":"https://example.com/a","authoritativeLinkVerified":False,"eligibleForHistoricalJoin":False}]}
  target={"kind":"restricted_kashrock_hltv_identity_and_projection_candidate_review_v1","playerEventCandidates":[{"subjectType":"individual","components":[{"hltvPlayerId":"1"}]}]}
  c={"kind":"restricted_cs2_conflict_public_account_review_v1","rows":[{"ektarrId":"7","steam64Candidate":steam,"sourceReportedSteam64":steam,"registryEvidenceIds":["abc"],"sourceUrl":"https://example.com/b","reviewStatus":"professional_profile_account_agreement","authoritativeVerified":False,"productionEligible":False}]}
  a=review_claims(r,p,target,c);self.assertEqual(a["targetProfileCoverage"],1);self.assertEqual(a["conflictsWithArchivedAccountClaims"],1);self.assertFalse(a["productionEligible"])
  with self.assertRaises(ValueError):review_claims(r,p,target,dict(c,rows=[]))
  with self.assertRaises(ValueError):review_claims(r,dict(p,candidates=p["candidates"]*2),target,c)
if __name__=="__main__":unittest.main()
