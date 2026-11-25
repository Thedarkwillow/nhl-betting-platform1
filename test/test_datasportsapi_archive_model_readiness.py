import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from datasportsapi_archive_model_readiness import audit
class Test(unittest.TestCase):
 def test_duplicate_archive_and_no_hit_rate(self):
  game=dict(title="CS2",providerCompleted=True,providerFixtureId="1",providerGameId="2",mapOrdinal=1,fixtureStartsAt="2026-11-21T00:00:00Z",players=[dict(providerPlayerId=str(i),kills=10,deaths=5,assists=3,headshots=5) for i in range(10)])
  a=dict(kind="datasportsapi_restricted_game_archive_v1",source="DataSportsAPI",rows=[game])
  r=audit([a,a]);self.assertEqual(r["titles"]["CS2"]["rows"],10);self.assertEqual(r["fieldCoverage"]["CS2:headshots"],10);self.assertFalse(r["modelPromoted"])
  b={**a,"rows":[{**game,"mapOrdinal":2}]};r=audit([a,b]);self.assertEqual(r["conflictingGameKeys"],1);self.assertEqual(r["titles"],{})
