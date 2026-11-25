import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_scope_history import series_rows,evaluate
class ScopeHistoryTests(unittest.TestCase):
 def test_exact_map_scope_and_duplicates(self):
  a=dict(event="a|1",player="p",date="2026-01-01",kills=10)
  b=dict(event="a|2",player="p",date="2026-01-01",kills=12)
  c=dict(event="a|3",player="p",date="2026-01-01",kills=50)
  self.assertEqual(series_rows([a,b,c],("kills",),(1,2))[0]["kills"],22)
  self.assertEqual(series_rows([a,c],("kills",),(1,2)),[])
  self.assertEqual(series_rows([a,b,b],("kills",),(1,2)),[])
  self.assertEqual(series_rows([a,{**b,"date":"2026-01-02"}],("kills",),(1,2)),[])
 def test_prior_dates_and_minimum_samples(self):
  rows=[dict(event=f"{i}|{j}",player="p",date=f"2026-01-{i:02d}",kills=10) for i in range(1,16) for j in (1,2)]
  out=evaluate(rows,("kills",),(1,2))
  self.assertEqual(out["completePlayerSeries"],15)
  self.assertEqual(out["markets"]["kills"]["n"],3)
  self.assertEqual(out["markets"]["kills"]["last20MAE"],0)
  self.assertFalse(out["modelPromoted"])
  self.assertEqual(out["actualPropLines"],0)
