import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("lab",Path(__file__).resolve().parents[1]/"scripts/research-nhl-faceoff-opportunity.py")
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
class FaceoffTest(unittest.TestCase):
    def test_opportunities_and_opponent(self):
        self.assertIsNone(lab.estimate([(0,0)]*10,[(30,60)]*10))
        a,p,q,supported=lab.estimate([(6,10)]*10,[(40,60)]*10)
        self.assertTrue(supported)
        self.assertLess(q,p)
        self.assertTrue(all(0<=lab.mixture(a,p,l)<=1 for l in lab.LINES))
        self.assertGreater(lab.mixture(a,p,4.5),lab.mixture(a,p,7.5))
        self.assertEqual(lab.mixture([0],.5,.5),0)
    def test_no_missing_zero(self):
        row=dict(situation="all",gameId="2024020001",gameDate="20241001",playerTeam="AAA",opposingTeam="BBB",playerId="123",icetime="900",I_F_shotsOnGoal="2",I_F_goals="1",I_F_xOnGoal="1.8",I_F_xGoals=".2",I_F_faceOffsWon="5")
        self.assertNotIn("draws",lab.normalize(row,2024,"skaters"))
        row["faceoffsWon"]="5";row["faceoffsLost"]="7"
        self.assertEqual(lab.normalize(row,2024,"skaters")["draws"],(5,12))
        row["faceoffsWon"]="6"
        self.assertNotIn("draws",lab.normalize(row,2024,"skaters"))
if __name__=="__main__":unittest.main()
