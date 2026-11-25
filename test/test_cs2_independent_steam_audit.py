import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_independent_steam_audit import audit
def rows(demo=False):
    out=[]
    for i in range(10):
        r=dict(event="m1",player=("steam:" if demo else "kaggle:")+str(i),date="2026-04-01",map="Mirage",rounds=22,kills=10+i,deaths=15-i,assists=3+i,team="t"+str(i//5),teamScore=13 if i<5 else 9,alias="name"+str(i))
        if demo:r.update(sourceTeamSlot=i//5,sourceAlias=r["alias"],regulationScorePair=[9,13],headshots=5)
        out.append(r)
    return out
class Tests(unittest.TestCase):
 def test_exact_map_and_alias(self):
    r=audit(rows(),rows(True))
    self.assertEqual(r["uniqueStatIdentityCandidates"],10)
    self.assertEqual(r["exactAliasCorroboratedCandidates"],10)
    self.assertFalse(r["verifiedAuthoritativeCrosswalk"])
 def test_alias_conflict_and_different_box(self):
    d=rows(True);d[0]["sourceAlias"]="other"
    self.assertEqual(audit(rows(),d)["uniqueStatIdentityCandidates"],9)
    d[0]["kills"]+=1
    self.assertEqual(audit(rows(),d)["uniqueStatIdentityCandidates"],0)
