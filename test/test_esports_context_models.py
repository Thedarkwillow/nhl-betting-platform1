import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_context_models import evaluate
from public_cod_wiki_history import parse
class Tests(unittest.TestCase):
 def test_prior_dates_and_partition(self):
  rows=[dict(event=str(i),player="p",date=f"2026-01-{i:02d}",mode="HP",edition="BO7",kills=i) for i in range(1,11)]
  r=evaluate(rows,["kills"],["mode"],["edition"])
  self.assertEqual(r["groups"]["mode|kills"]["n"],2)
  self.assertFalse(r["prospectiveApproval"])
  rows[-1]["edition"]="BO6"
  self.assertEqual(evaluate(rows,["kills"],["mode"],["edition"])["groups"]["mode|kills"]["n"],1)
 def test_duplicates_and_incomplete_maps(self):
  r=dict(Date="2025-01-01",SeriesId="s",GameNumber="1",PlayerLink="p",Team="A",TeamVs="B",GameTitle="BO6",Gamemode="HP",Win="1",Kills="10",Deaths="9")
  self.assertEqual(parse([r]*8)[0],[])
  self.assertEqual(evaluate([dict(event="s",player="p",date="2026-01-01",kills=2)]*2,["kills"],["map"])["validRows"],0)
