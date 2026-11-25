import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/public-nfl-native-history.py"
s=importlib.util.spec_from_file_location("nfl",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class NativeTest(unittest.TestCase):
    def test_exact_game_and_missing_stat(self):
        g=m.schedule([dict(season=2026,game_type="REG",game_id="2026_01_NYG_DAL",away_team="NYG",home_team="DAL",gameday="2026-09-13",gametime="13:00",week=1,away_score=10,home_score=20,espn=123)],2026)
        r=dict(season=2026,season_type="REG",player_id="00-0000001",team="DAL",opponent_team="NYG",week=1,passing_yards=100,receptions=None)
        self.assertEqual(m.history([r],g,2026,"2026-11-25T12:00:00Z")[0]["stats"],{"passing_yards":100})
        self.assertEqual(m.history([r,r],g,2026,"2026-11-25T12:00:00Z"),[])
        self.assertEqual(m.history([dict(r,game_id="wrong")],g,2026,"2026-11-25T12:00:00Z"),[])
    def test_roster_conflict_not_resolved(self):
        r=dict(season=2026,week=1,gsis_id="00-0000001",espn_id="123",team="DAL",full_name="Example Player")
        self.assertEqual(len(m.roster([r],2026)),1)
        self.assertEqual(m.roster([r,dict(r,espn_id="456")],2026),[])
if __name__=="__main__":unittest.main()
