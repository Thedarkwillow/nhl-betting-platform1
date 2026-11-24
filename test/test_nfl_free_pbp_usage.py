import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("usage",Path(__file__).resolve().parents[1]/"scripts/research-nfl-free-pbp-usage.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestUsage(unittest.TestCase):
 def test_opportunities(self):
  p=dict(season=2025,week=1,season_type="REG",game_id="g",posteam="KC",defteam="BUF",play_type="pass",pass_attempt=1,receiver_player_id="X",yardline_100=10,play_id=1)
  t,a,o,w=m.aggregate([p,{**p,"play_id":2,"yardline_100":50},{**p,"play_id":3,"play_type":"no_play"}],2025)
  self.assertEqual(t["g","KC"]["target"],2)
  self.assertEqual(a["g","KC","X"]["red_target"],1)
  with self.assertRaises(ValueError):m.aggregate([p,p],2025)
 def test_prior_opportunity(self):
  x=[{"total":30,"opportunities":6,"value":60,"red":1}]*5
  f=m.forecasts(x,[30]*5,[30]*5,[30]*30,"receiving_yards","target")
  self.assertAlmostEqual(f["last5"],60)
  self.assertAlmostEqual(f["share_volume"],60)
  self.assertIsNone(m.forecasts(x[:3],[30]*5,[30]*5,[30]*30,"receiving_yards","target"))
if __name__=="__main__":unittest.main()
