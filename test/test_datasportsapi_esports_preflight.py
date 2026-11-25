import sys,pathlib,unittest
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from datasportsapi_esports_preflight import audit,lineup_valid,game_valid,MAX_CALLS
class Tests(unittest.TestCase):
 def test_live_contract(self):
  now=datetime(2026,11,25,tzinfo=timezone.utc)
  fixture=dict(id=1,sport="esports",startTime="2026-11-24T10:00:00Z",status={"type":"finished"},home={"id":1},away={"id":2})
  game=dict(id=3,number=1,status="finished",winner="home",startedAt=fixture["startTime"],durationSeconds=1800)
  players=[dict(player={"id":i+1},kills=10,deaths=8,assists=3,headshotKills=4) for i in range(10)]
  line=dict(data=dict(home=players[:5],away=players[5:]),meta={"gameId":3})
  class Fake:
   calls=0;stopped=False
   def get(self,path):
    self.calls+=1
    if path.startswith("/v2/fixtures?"):return {"data":[fixture]}
    if path.endswith("/games"):return {"data":[game]}
    return line
  x=audit(Fake(),now)
  self.assertEqual(x["fixturesRead"],1);self.assertEqual(x["playerMapRows"],10);self.assertEqual(x["statCoverage"]["headshotKills"],10)
  self.assertLessEqual(x["requests"],MAX_CALLS);self.assertEqual(x["paidEndpointsCalled"],0);self.assertFalse(x["officialSettlementVerified"])
  self.assertIsNone(lineup_valid({**line,"meta":{"gameId":4}},3))
  self.assertFalse(game_valid({**game,"status":"inprogress"},now))
  players[5]["player"]["id"]=1
  self.assertIsNone(lineup_valid(line,3))
