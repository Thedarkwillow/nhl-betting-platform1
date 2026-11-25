import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_team_identity import reconcile
from cs2_cross_source_identity import audit
def fixture(day="2026-11-20",event="m1",teams=("101","102")):
 return [dict(event=event,player=f"ektarr:{s*5+i+1}",alias=f"Player{s*5+i+1}",date=day,map="Nuke",team=teams[s],opponent=teams[1-s],teamLabel=("Alpha","Beta")[s],teamScore=(13,9)[s],rounds=22,kills=10+i,deaths=8,assists=2) for s in range(2) for i in range(5)]
def archive(rows):
 return {"kind":"datasportsapi_restricted_game_archive_v1","source":"DataSportsAPI","rows":[{"title":"CS2","providerCompleted":True,"providerFixtureId":"200","providerGameId":"300","fixtureStartsAt":"2026-11-20T10:00:00Z","homeTeam":"Beta","awayTeam":"Alpha","homeScore":9,"awayScore":13,"map":"Nuke","mapOrdinal":2,"players":[dict(providerPlayerId=str(i+1),providerTeamId="B" if i<5 else "A",name=p["alias"],kills=p["kills"],deaths=p["deaths"],assists=p["assists"]) for i,p in enumerate(rows[5:]+rows[:5])]}]}
class Test(unittest.TestCase):
 def test_roster_continuity(self):
  rows=fixture()+fixture("2026-11-21","m2",("201","202"))
  out,r=reconcile(rows)
  self.assertEqual(len(out),20)
  self.assertEqual(r["counts"]["links_across_source_team_ids"],2)
  self.assertEqual(out[0]["team"],out[10]["team"])
  self.assertFalse(r["canonicalTeamIdsVerified"])
 def test_exact_swapped_sides(self):
  rows=fixture();a=archive(rows);r,p=audit(rows,[a])
  self.assertEqual(r["uniquePlayerLinks"],10);self.assertEqual(r["uniqueTeamLinks"],2)
  self.assertEqual(r["verifiedMapOrdinals"],1);self.assertFalse(r["productionEligible"])
  a["rows"][0]["players"][0]["kills"]+=1
  r,_=audit(rows,[a]);self.assertEqual(r["uniquePlayerLinks"],0)
 def test_duplicate_map_rejected(self):
  rows=fixture();r,_=audit(rows+fixture(event="m2"),[archive(rows)])
  self.assertEqual(r["verifiedMapOrdinals"],0)

 def test_overlap_diagnostics_do_not_promote(self):
  rows=fixture();a=archive(rows)
  a["rows"][0]["fixtureStartsAt"]="2026-11-21T00:00:00Z"
  r,_=audit(rows,[a])
  self.assertEqual(r["counts"]["adjacent_day_full_fingerprint_candidate"],1)
  self.assertEqual(r["uniquePlayerLinks"],0)
  self.assertFalse(r["productionEligible"])
