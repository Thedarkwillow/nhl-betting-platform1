import importlib.util, unittest
from pathlib import Path
from datetime import date,timedelta
spec=importlib.util.spec_from_file_location("lab",Path(__file__).resolve().parents[1]/"scripts/research-nhl-multi-season-specialist-counts.py")
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
class SpecialistTest(unittest.TestCase):
    def test_missing_and_signed_counts(self):
        self.assertIsNone(lab.optional({},"I_F_hits"))
        self.assertIsNone(lab.optional({"I_F_hits":"-1"},"I_F_hits"))
        self.assertEqual(lab.optional({"I_F_hits":"0"},"I_F_hits"),0)
    def test_holdout_never_enters_training(self):
        rows=[]
        for season in (2023,2024,2025):
            for i in range(25):
                for p in range(5):
                    rows.append(dict(season=season,day=(date(season,10,1)+timedelta(days=i)).isoformat(),game=season*10000+i,player=p,toi=900,actual={"hits":i%4}))
        a=lab.evaluate(rows)
        for row in rows:
            if row["season"]==2025:row["actual"]["hits"]+=3
        b=lab.evaluate(rows)
        self.assertEqual(a["markets"]["hits"]["training"],b["markets"]["hits"]["training"])
        self.assertEqual(a["markets"]["faceoffsWon"]["status"],"insufficient_verified_source")
        self.assertGreater(a["markets"]["hits"]["evaluationAppearances"],0)
        self.assertFalse(a["modelPromoted"])
if __name__=="__main__":unittest.main()
