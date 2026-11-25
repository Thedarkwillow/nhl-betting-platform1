import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_opponent_strength import evaluate
class Test(unittest.TestCase):
 def test_complete_map_and_prior_dates(self):
  rows=[dict(event=str(d),date=f"2026-01-{d:02d}",player=str(i),team="a" if i<5 else "b",opponent="b" if i<5 else "a",rounds=20,kills=10) for d in range(1,21) for i in range(10)]
  x=evaluate(rows,["kills"],"rounds")
  self.assertEqual(x["completeMaps"],20);self.assertEqual(x["markets"]["kills"]["n"],40);self.assertEqual(x["markets"]["kills"]["opponentStrengthBlendMAE"],0)
  self.assertFalse(x["modelPromoted"])
