import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/public-opencs2-map-baseline.py"
s=importlib.util.spec_from_file_location("cs2",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_side_and_total_no_double_count(self):
  a={"side":"ct","n_rounds":12,"kills":8,"deaths":5,"assists":2,"headshots":3}
  b={"side":"t","n_rounds":6,"kills":4,"deaths":3,"assists":1,"headshots":2}
  total={"side":"all","n_rounds":18,"kills":12,"deaths":8,"assists":3,"headshots":5}
  self.assertEqual(m.player_total([a,b,total],18),(12,8,3,5))
  self.assertIsNone(m.player_total([a,b,{**total,"kills":13}],18))
 def test_incomplete_map_rejected(self):
  self.assertEqual(m.map_rows({"rounds_played":5}),[])
  self.assertFalse(m.evaluate([])["prospectiveApproval"])

 def test_regulation_side_switch_score(self):
  # Team starting CT wins 10 in first half, 3 after switching.
  sides=["ct"]*10+["t"]*2+["t"]*3
  rounds=[dict(round_num=i+1,winner=s,start=i*100,official_end=i*100+90) for i,s in enumerate(sides)]
  x=dict(rounds_played=15,match=dict(rounds_played=15,score_ct=10,score_t=5),rounds=rounds)
  self.assertEqual(m.regulation_team_score(x),(13,2))
  self.assertIsNone(m.regulation_team_score({**x,"match":{**x["match"],"score_ct":13,"score_t":2}}))
  self.assertIsNone(m.regulation_team_score({**x,"rounds":rounds[:-1]}))
