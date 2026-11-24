import importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/(name+".py"))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
nhl=load("research-nhl-additional-markets")
nfl=load("research-nfl-lagged-source-ablation")
class TestSources(unittest.TestCase):
    def test_nhl_missing_not_zero(self):
        row=dict(situation="all",gameId="2024020001",gameDate="20241001",playerTeam="AAA",opposingTeam="BBB",playerId="123",icetime="900",I_F_shotsOnGoal="2",I_F_goals="1",I_F_xOnGoal="1.8",I_F_xGoals=".2",I_F_primaryAssists="1",I_F_secondaryAssists="0",I_F_hits="0")
        x=nhl.normalize(row,2024)
        self.assertEqual(x["extra"],{"assists":1,"hits":0})
        self.assertIsNone(nhl.candidates([(2,900)]*5,[],[20]*30))
        a=nhl.candidates([(2,900)]*5,[40]*10,[20]*30)
        self.assertEqual(a["usage_rate"],2)
        self.assertGreater(a["opponent_rate"],2)
    def test_id_crosswalk(self):
        rows=[{"gsis_id":"G1","pfr_id":"P1"},{"gsis_id":"G1","pfr_id":"P1"},{"gsis_id":"G2","pfr_id":"P2"},{"gsis_id":"G3","pfr_id":"P2"}]
        self.assertEqual(nfl.identity_map(rows),{"G1":"P1"})
    def test_lagged_features_ignore_target_week(self):
        p={"player_id":"G1","position":"QB","team":"AAA","opponent_team":"BBB"}
        prior=[{"passing_yards":220,"attempts":30} for _ in range(5)]
        teams=[{"week":w,"team":t,"opponent_team":"BBB" if t=="AAA" else "AAA","passing_yards":200} for w in range(1,9) for t in ("AAA","BBB","CCC","DDD")]
        snaps={"P1":[{"week":w,"team":"AAA","offense_pct":.8} for w in (1,2,3,8)]}
        ngs={"passing":{"G1":[{"week":w,"team_abbr":"AAA","avg_intended_air_yards":8} for w in (1,2,3,8)]}}
        a=nfl.source_features(p,"passing_yards",prior,teams,snaps,ngs,{"G1":"P1"},8)
        snaps["P1"][-1]["offense_pct"]=0
        ngs["passing"]["G1"][-1]["avg_intended_air_yards"]=999
        self.assertEqual(a,nfl.source_features(p,"passing_yards",prior,teams,snaps,ngs,{"G1":"P1"},8))
        self.assertIsNotNone(a["extended"])
    def test_fit_is_fixed_and_improves_synthetic(self):
        xs=[[float(i)] for i in range(150)];bases=[10.]*150;ys=[10+2*x[0] for x in xs]
        m=nfl.fit(xs,ys,bases)
        self.assertLess(abs(nfl.predict(m,[3.],10.)-16),10)
        self.assertIsNone(nfl.fit(xs[:20],ys[:20],bases[:20]))
if __name__=="__main__":unittest.main()
