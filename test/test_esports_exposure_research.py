import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_exposure_research import evaluate
class Test(unittest.TestCase):
 def test_current_duration_not_used(self):
  rows=[dict(event=str(i),player="p",date=f"2026-01-{i+1:02d}",rounds=20,kills=10) for i in range(20)]
  a=evaluate(rows,["kills"],"rounds")
  b=evaluate([dict(x,rounds=40) if x["event"]=="19" else x for x in rows],["kills"],"rounds")
  self.assertEqual(a,b)
  self.assertEqual(a["markets"]["kills"]["n"],4)
  self.assertFalse(a["modelPromoted"])
