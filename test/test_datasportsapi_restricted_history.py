import pathlib,sys,unittest
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from datasportsapi_restricted_history import collect,classify
class Tests(unittest.TestCase):
 def test_category_contract(self):
  self.assertEqual(classify({"id":1,"sport":"esports","name":"Counter-Strike 2"}),"CS2")
  self.assertIsNone(classify({"id":1,"sport":"esports","name":"Dota 2","slug":"league-of-legends"}))
 def test_bounded_history(self):
  now=datetime(2026,11,25,12,tzinfo=timezone.utc)
  fixture={"id":3,"sport":"esports","startTime":"2026-11-24T10:00:00Z","status":{"type":"finished"},"home":{"id":4},"away":{"id":5}}
  game={"id":9,"number":1,"status":"finished","winner":"home","startedAt":fixture["startTime"],"durationSeconds":1800}
  players=[{"player":{"id":i+1,"name":"Fixture"},"kills":10,"deaths":9,"assists":5,"headshotKills":3} for i in range(10)]
  class Fake:
   calls=0;stopped=False;max_calls=40
   def get(self,path):
    self.calls+=1
    if path.startswith("/v2/categories"):return {"data":[{"id":1,"sport":"esports","name":"Counter-Strike 2"}]}
    if path.startswith("/v2/fixtures?"):
     data=[fixture] if "date=2026-11-24" in path else []
     return {"data":data,"meta":{"hasNextPage":False,"count":len(data)}}
    if path.endswith("/games"):return {"data":[game]}
    return {"data":{"home":players[:5],"away":players[5:]},"meta":{"gameId":9}}
  report,rows=collect(Fake(),now,7)
  self.assertEqual(report["titleDateComplete"],7);self.assertEqual(report["counts"]["CS2:playerGameRows"],10)
  self.assertFalse(rows[0]["officialFinalVerified"]);self.assertFalse(report["fullHistoryVerified"])
  self.assertEqual(rows[0]["players"][0]["headshots"],3)
  self.assertEqual(report["requests"],10)

 def test_quota_failure_preserves_pending(self):
  now=datetime(2026,11,25,12,tzinfo=timezone.utc)
  fixture={"id":3,"sport":"esports","startTime":"2026-11-19T10:00:00Z","status":{"type":"finished"},"home":{"id":4},"away":{"id":5}}
  game={"id":9,"number":1,"status":"finished","winner":"home","startedAt":fixture["startTime"],"durationSeconds":1800}
  item={"title":"CS2","fixture":fixture,"game":game,"reason":"lineup_empty_side"}
  class Fake:
   calls=0;stopped=False;max_calls=24
   rateLimitReason="quota_exceeded";rateLimitRetryAfterSeconds=600
   def get(self,path):
    self.calls+=1;self.stopped=True
    raise ValueError("http_429")
  pending=[];r,rows=collect(Fake(),now,2,[],pending,[item,item])
  self.assertEqual(rows,[]);self.assertEqual(pending,[item]);self.assertEqual(r["pendingLineups"],1)
  self.assertEqual(r["rateLimitReason"],"quota_exceeded");self.assertIn("blockedUntil",r)
  pending=[];r,rows=collect(Fake(),datetime(2026,11,26,12,tzinfo=timezone.utc),2,[],pending,[item])
  self.assertEqual(pending,[item]);self.assertEqual(r["excluded"]["pending_outside_free_window"],1)
