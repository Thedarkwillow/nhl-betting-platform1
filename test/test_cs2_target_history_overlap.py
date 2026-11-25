import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_target_history_overlap import audit
class Test(unittest.TestCase):
 def test_unique_complete_map_pairs_are_candidates_only(self):
  review={"playerEventCandidates":[{"subjectType":"individual","components":[{"hltvPlayerId":"1"}]}]}
  def rows(prefix,match):
   return [dict(event=match+"|1",player=prefix+str(i+1),alias="p"+str(i),team=str(i//5),teamScore=13 if i<5 else 5,date="2026-04-01",map="mirage",kills=i+1,deaths=10-i) for i in range(10)]
  a=audit(review,rows("hltv:","a"),rows("ektarr:","b"))
  self.assertEqual(a["targetIdsWithStaticMapHistory"],1)
  self.assertEqual(a["independentDatasetOneToOneCandidates"],1)
  self.assertEqual(a["distinctSeriesCorroboratedCandidates"],0)
  self.assertEqual(a["authoritativeSteamLinksAdded"],0)
  self.assertEqual(audit(review,rows("hltv:","a"),[])["independentDatasetOneToOneCandidates"],0)
