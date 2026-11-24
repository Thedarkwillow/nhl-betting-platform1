#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest
from datetime import date,timedelta
spec=importlib.util.spec_from_file_location("lab",Path(__file__).resolve().parents[1]/"scripts/research-nhl-three-season-context.py")
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
def fixture():
    rows=[]
    for year in (2023,2024,2025):
        for i in range(26):
            day=(date(year,10,1)+timedelta(days=i)).isoformat()
            for team,opp,offset in (("AAA","BBB",0),("BBB","AAA",100)):
                for p in range(19):
                    g=p==18
                    actual={"saves":20+i%5} if g else {"shotsOnGoal":1+(i+p)%5,"goals":(i+p)%2}
                    rows.append(dict(season=year,day=day,game=year*1000000+20000+i,player=offset+p+1,team=team,opponent=opp,role="goalies" if g else "skaters",toi=3600 if g else 900+60*(i%4),actual=actual,quality={k:v*.9 for k,v in actual.items()}))
    return rows
class LabTests(unittest.TestCase):
    def test_prior_only_and_candidate_selection(self):
        rows=fixture();a=lab.evaluate(rows)
        for r in rows:
            if r["season"]==2025:
                r["actual"]={k:v+2 for k,v in r["actual"].items()}
        b=lab.evaluate(rows)
        for m in ("shotsOnGoal","goals","saves"):
            self.assertEqual(a["markets"][m]["training"],b["markets"][m]["training"])
            self.assertEqual(a["markets"][m]["selectedFrom2024Only"],b["markets"][m]["selectedFrom2024Only"])
            self.assertGreater(a["markets"][m]["testRows"],0)
        self.assertFalse(a["modelPromoted"])
    def test_context(self):
        p=[(2,900,3)]*10
        a=lab.estimates(p,[40]*10,[20]*30)
        self.assertEqual(a["recent_rate"],2)
        self.assertEqual(a["quality_rate"],3)
        self.assertGreater(a["opponent_rate"],2)
        self.assertIsNone(lab.estimates(p,[],[20]*30))
    def test_raw_validation(self):
        row=dict(situation="all",gameId="2024020001",gameDate="20241001",playerTeam="AAA",opposingTeam="BBB",playerId="123",icetime="900",I_F_shotsOnGoal="2",I_F_goals="1",I_F_xOnGoal="1.8",I_F_xGoals=".2")
        self.assertEqual(lab.normalize(row,2024,"skaters")["actual"]["shotsOnGoal"],2)
        with self.assertRaises(ValueError):lab.normalize({**row,"I_F_xGoals":""},2024,"skaters")
        self.assertIsNone(lab.normalize({**row,"situation":"5on5"},2024,"skaters"))
if __name__=="__main__":unittest.main()
