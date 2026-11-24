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
