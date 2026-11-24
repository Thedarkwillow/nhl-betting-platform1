import importlib.util
from pathlib import Path
import unittest
from datetime import date,timedelta
spec=importlib.util.spec_from_file_location("lab",Path(__file__).resolve().parents[1]/"scripts/research-nhl-expanded-probabilities.py")
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
def fixture():
    rows=[]
    for year in (2023,2024,2025):
        for i in range(25):
            day=(date(year,10,1)+timedelta(days=i)).isoformat()
            for t,opp,offset in (("AAA","BBB",0),("BBB","AAA",100)):
                for p in range(19):
                    g=p==18
                    actual={"saves":20+i%5} if g else {"shotsOnGoal":1+(i+p)%5,"goals":(i+p)%2}
                    rows.append(dict(season=year,day=day,game=year*1000000+20000+i,player=offset+p+1,team=t,opponent=opp,role="goalies" if g else "skaters",toi=3600 if g else 900,actual=actual,quality={k:v*.9 for k,v in actual.items()}))
    return rows
class LabTest(unittest.TestCase):
    def test_probabilities_bounded_and_monotone(self):
        prior=[(x,900,x) for x in range(1,15)]
        a=[lab.mass(prior,6,l) for l in [1.5,2.5,6.5,20.5]]
        self.assertTrue(all(0<x<1 for x in a))
        self.assertEqual(a,sorted(a,reverse=True))
    def test_training_unchanged_by_holdout_outcomes(self):
        rows=fixture();a=lab.evaluate(rows)
        for r in rows:
            if r["season"]==2025:r["actual"]={k:v+1 for k,v in r["actual"].items()}
        b=lab.evaluate(rows)
        for m in lab.LINES:
            self.assertEqual(a["markets"][m]["training"],b["markets"][m]["training"])
            self.assertEqual(a["markets"][m]["selectedOnTrainingBrierOnly"],b["markets"][m]["selectedOnTrainingBrierOnly"])
            self.assertGreater(a["markets"][m]["evaluationAppearances"],0)
        self.assertFalse(a["modelPromoted"])
if __name__=="__main__":unittest.main()
