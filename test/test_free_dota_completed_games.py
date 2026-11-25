import unittest,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from free_dota_completed_games import normalized,audit
class Test(unittest.TestCase):
 def fixture(self):
  i=dict(match_id=1,leagueid=2,radiant_team_id=3,dire_team_id=4,start_time=1000,duration=1200,radiant_win=True)
  m={**i,"players":[dict(account_id=n+1,player_slot=n if n<5 else n+123,kills=3,deaths=2,assists=5,last_hits=100) for n in range(10)]}
  return i,m
 def test_exact_completed_game(self):
  i,m=self.fixture();x=normalized(i,m,2500)
  self.assertEqual(len(x["playerRows"]),10);self.assertFalse(x["seriesScopeVerified"])
  self.assertIsNone(normalized(i,m,2000));self.assertIsNone(normalized(i,{**m,"radiant_win":False},2500))
 def test_reject_bad_participation(self):
  i,m=self.fixture();m["players"][0]["account_id"]=2
  self.assertIsNone(normalized(i,m,2500))
 def test_audit_is_bounded_and_deduplicates(self):
  i,m=self.fixture();x=audit(lambda path,limit:[i,i] if path=="/proMatches" else m,now=2500,sleep=lambda _:None)
  self.assertEqual(x["freeRequests"],2);self.assertEqual(x["playerGameRows"],10);self.assertEqual(x["paidRequests"],0);self.assertEqual(x["originalOffersMatched"],0)
