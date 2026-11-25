import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from lol_advanced_research import scope_recovery,rows_features
class Test(unittest.TestCase):
 def test_adjacent_is_candidate(self):
  a=[[dict(event="g",date="2026-01-01",teamLabel="a",opponentLabel="b",duration=1800)]]
  m=[dict(game_id="g",riot_game_id="",datetime_utc="2026-01-02",team_blue="a",team_red="b",match_id="s",game_number="1",gamelength="30:00")]
  self.assertEqual(scope_recovery(a,m),{"adjacent_date_duration_candidate":1})
 def test_same_day_not_history(self):
  a=[dict(date="2026-01-01",event=str(i),player="p",kills=1,deaths=1,assists=1,creep_score=10) for i in range(50)]
  self.assertEqual(dict(rows_features(a)),{})
