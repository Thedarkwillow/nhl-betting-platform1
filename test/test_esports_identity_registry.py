import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_identity_registry import build
def row(event="1",method="exact_demo_boxscore_alias",pid="1",steam="76561198000000001"):
 return dict(left=dict(sport="CS2",namespace="ektarr",id=pid),right=dict(sport="CS2",namespace="steam64",id=steam),method=method,eventDate="2026-04-01",sourceEvents=[event,"demo-"+event],sourceRevisions=["a"*64,"b"*40])
def doc(*rows):return dict(kind="esports_identity_evidence_v1",evidence=list(rows))
class Test(unittest.TestCase):
 def test_dedup_and_multimap_stays_candidate(self):
  r=build([doc(row()),doc(row(),row("2"))]);self.assertEqual(r["evidenceCount"],2);self.assertEqual(r["counts"],{"multi_map_candidate":1});self.assertEqual(r["authoritativeLinks"],0)
 def test_conflict_quarantines(self):
  r=build([doc(row(),row("2","explicit_alias_conflict"))]);self.assertEqual(r["counts"],{"conflict":1})
  r=build([doc(row(),row("2",pid="2"))]);self.assertEqual(r["counts"],{"conflict":2})
 def test_cross_sport_rejected(self):
  x=row();x["right"]={"sport":"DOTA2","namespace":"opendota","id":"1"}
  self.assertEqual(build([doc(x)])["rejected"],{"invalid_evidence":1})
