import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from lol_specialist_research import complete_games,bind_series,duration,evaluate
class Test(unittest.TestCase):
 def game(self,d):
  return [dict(event=str(d),date=f"2026-01-{d:02d}",player=str(i),team="a" if i<5 else "b",teamLabel="a" if i<5 else "b",role=["top","jungle","mid","bot","support"][i%5],kills=2,deaths=2,assists=4,creep_score=100,duration=1800,series=None,ordinal=None) for i in range(10)]
 def test_duration_and_complete_game(self):
  self.assertEqual(duration("30:00"),1800);self.assertIsNone(duration("30"))
  games,bad=complete_games(sum([self.game(d) for d in range(1,21)],[]))
  a=evaluate(games)
  self.assertEqual(a["completeGames"],20);self.assertEqual(a["comparisons"]["kills|duration_rate_blend"]["candidateMAE"],0)
 def test_no_scope_guess(self):
  games,_=complete_games(self.game(1));rows,c=bind_series(games,[])
  self.assertEqual(rows,[]);self.assertEqual(c["missing_or_ambiguous_explicit_scope"],1)
  m=dict(game_id="1",riot_game_id="",datetime_utc="2026-01-01",team_blue="a",team_red="b",match_id="series",game_number="1")
  rows,c=bind_series(games,[m]);self.assertEqual(len(rows),10)
  self.assertEqual(bind_series(games,[m,m])[0],[])
