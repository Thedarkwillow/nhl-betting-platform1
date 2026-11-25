import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/public-native-model-scope-validation.py"
s=importlib.util.spec_from_file_location("m",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_predict(self):
  for v in m.predict([3]*5).values():self.assertAlmostEqual(v,3)
 def test_same_week_no_leakage(self):
  games=[];rows=[]
  for y in (2024,2025,2026):
   for w in range(1,12):
    gid=f"{y}_{w}";g=dict(gameId=gid,startAt=f"{y}-09-01T12:00:00Z",week=w,home="A",away="B",completedScoreObserved=True);games.append(g)
    rows.append(dict(gameId=gid,playerId="p",gameStartAt=g["startAt"],week=w,team="A",opponent="B",stats=dict(attempts=10,passing_yards=100 if y!=2026 else 200)))
   if y==2024:d=[]
   d.append(dict(season=y,games=games[:],playerRows=rows[:]));games=[];rows=[]
  x=m.nfl(d);a=next(z for z in x["markets"] if z["market"]=="passing_yards")
  self.assertEqual(a["developmentN"],11);self.assertGreater(a["evaluationMAE"]["last5"],0);self.assertFalse(x["modelApproved"])
 def test_empty(self):
  self.assertEqual(m.identity([]),{});self.assertEqual(m.dota([])["independentMapOrdinalVerified"],0)
if __name__=="__main__":unittest.main()
