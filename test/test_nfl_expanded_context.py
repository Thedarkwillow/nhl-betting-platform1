import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("context",Path(__file__).resolve().parents[1]/"scripts/collect-nfl-expanded-context.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestContext(unittest.TestCase):
 def test_latest_team_snapshot_no_future(self):
  rows=[dict(team="KC",gsis_id="X",dt="2026-11-12T07:00:00Z",pos_rank=2),dict(team="KC",gsis_id="X",dt="2026-11-15T07:00:00Z",pos_rank=1)]
  self.assertEqual(m.depth_at(rows,"KC","X","2026-11-14T18:00:00Z")["rank"],2)
  rows.append(dict(team="KC",gsis_id="Y",dt="2026-11-14T07:00:00Z",pos_rank=1))
  self.assertIsNone(m.depth_at(rows,"KC","X","2026-11-14T18:00:00Z"))
 def test_opportunity_delayed_and_duplicate_safe(self):
  rows=[dict(player_id="X",season=2026,week=w,expected=4 if w<7 else 100) for w in range(1,9)]
  self.assertEqual(m.prior_opportunity(rows,"X",2026,8,"expected"),4)
  self.assertIsNone(m.prior_opportunity(rows+[rows[0]],"X",2026,8,"expected"))
if __name__=="__main__":unittest.main()
