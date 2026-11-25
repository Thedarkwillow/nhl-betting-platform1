import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_context_challenger import evaluate
class Test(unittest.TestCase):
 def test_prior_dates_only(self):
  rows=[dict(event=str(i),player="p",date=f"2026-01-{i+1:02d}",team="a",opponent="b",map="Nuke",rounds=20+i%5,kills=10+i%3,deaths=8,assists=3) for i in range(20)]
  a=evaluate(rows);self.assertEqual(a["markets"]["kills"]["n"],4)
  self.assertFalse(a["modelPromoted"])
  self.assertEqual(a["actualPropLines"],0)
  # Change final day duration; no projected value can use that actual duration.
  b=evaluate([{**r,"rounds":100} if r["date"]=="2026-01-20" else r for r in rows])
  self.assertEqual(a['markets'],b['markets'])
  self.assertNotEqual(a['roundForecastAudit'],b['roundForecastAudit'])
