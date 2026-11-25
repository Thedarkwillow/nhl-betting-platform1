import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_headshot_history import evaluate
class Test(unittest.TestCase):
 def test_does_not_use_current_kills_or_rounds(self):
  rows=[dict(event=str(i),player="p",date=f"2026-01-{i+1:02d}",rounds=20,kills=15,headshots=5) for i in range(20)]
  a=evaluate(rows);b=evaluate([{**r,"kills":30,"rounds":25} if r["date"]=="2026-01-20" else r for r in rows])
  self.assertEqual(a,b);self.assertEqual(a["n"],4)
  self.assertFalse(a["modelPromoted"])
  self.assertEqual(a["last20MedianMAE"],0)
  self.assertEqual(a["fixedRecentBlendMAE"],0)
