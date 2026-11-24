import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/research-nfl-free-efficiency.py"
s=importlib.util.spec_from_file_location("efficiency",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class TestEfficiency(unittest.TestCase):
    def test_epa_and_duplicate_rejection(self):
        rows=[dict(season=2025,season_type="REG",week=1,game_id="g",play_id=i,posteam="A",defteam="B",play_type="pass",epa=i-2) for i in range(5)]
        self.assertEqual(m.aggregate(rows,2025)[0]["epaPerPlay"],0)
        self.assertEqual(m.aggregate(rows,2025)[0]["successRate"],.4)
        self.assertEqual(m.aggregate(rows+[rows[0]],2025),[])
    def test_future_and_same_week_ignored(self):
        rows=[dict(season=2025,week=w,gameId=str(i),offense="A",defense="B",type="pass",epaPerPlay=0,successRate=.5) for i,w in enumerate(range(1,25))]
        self.assertIsNone(m.context(rows,2025,3,"A","B","pass"))
        self.assertEqual(m.context(rows,2025,25,"A","B","pass")["defenseAllowedEPA"],0)
        rows.append(dict(season=2025,week=25,gameId="future",offense="A",defense="B",type="pass",epaPerPlay=100,successRate=1))
        self.assertEqual(m.context(rows,2025,25,"A","B","pass")["defenseAllowedEPA"],0)
if __name__=="__main__":unittest.main()
