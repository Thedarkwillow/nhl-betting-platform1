import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("lab",Path(__file__).resolve().parents[1]/"scripts/research-nhl-dedicated-skater-goalie.py")
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
class DedicatedTest(unittest.TestCase):
    def test_different_market_exposures(self):
        prior=[{"toi":1200,"actual":{"shotsOnGoal":3,"goals":1,"assists":1,"points":2,"hits":2,"blockedShots":1,"timeOnIceSeconds":1200},"features":{"attempts":6,"xg":.4,"onIceGoals":2,"againstAttempts":12,"shifts":20}} for _ in range(12)]
        self.assertGreater(lab.dedicated("shotsOnGoal",prior),lab.dedicated("goals",prior))
        self.assertAlmostEqual(lab.dedicated("points",prior),lab.dedicated("goals",prior)+lab.dedicated("assists",prior))
        self.assertEqual(lab.dedicated("timeOnIceSeconds",prior),1200)
        for row in prior:row["features"]["attempts"]=None
        self.assertIsNone(lab.dedicated("shotsOnGoal",prior))
    def test_goalie_rate_and_workload(self):
        prior=[{"toi":3600,"actual":{"saves":27,"goalsAgainst":3},"features":{"faced":30}} for _ in range(12)]
        self.assertGreater(lab.dedicated("saves",prior,[50]*10),lab.dedicated("saves",prior,[30]*10))
        self.assertAlmostEqual(lab.dedicated("saves",prior)+lab.dedicated("goalsAgainst",prior),30)
if __name__=="__main__":unittest.main()
