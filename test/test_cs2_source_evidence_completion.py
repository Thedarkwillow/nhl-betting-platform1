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
if __name__=="__main__":unittest.main()
