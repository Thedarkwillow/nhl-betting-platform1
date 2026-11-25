import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/public-opencs2-map-baseline.py"
s=importlib.util.spec_from_file_location("cs2",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_side_and_total_no_double_count(self):
  a={"side":"ct","n_rounds":12,"kills":8,"deaths":5,"assists":2,"headshots":3}
  b={"side":"t","n_rounds":6,"kills":4,"deaths":3,"assists":1,"headshots":2}
  total={"side":"all","n_rounds":18,"kills":12,"deaths":8,"assists":3,"headshots":5}
  self.assertEqual(m.player_total([a,b,total],18),(12,8,3,5))
  self.assertIsNone(m.player_total([a,b,{**total,"kills":13}],18))
 def test_incomplete_map_rejected(self):
  self.assertEqual(m.map_rows({"rounds_played":5}),[])
  self.assertFalse(m.evaluate([])["prospectiveApproval"])

 def test_regulation_side_switch_score(self):
  # Team starting CT wins 10 in first half, 3 after switching.
  sides=["ct"]*10+["t"]*2+["t"]*3
  rounds=[dict(round_num=i+1,winner=s,start=i*100,official_end=i*100+90) for i,s in enumerate(sides)]
  x=dict(rounds_played=15,match=dict(rounds_played=15,score_ct=10,score_t=5),rounds=rounds)
  self.assertEqual(m.regulation_team_score(x),(13,2))
  self.assertIsNone(m.regulation_team_score({**x,"match":{**x["match"],"score_ct":13,"score_t":2}}))
  self.assertIsNone(m.regulation_team_score({**x,"rounds":rounds[:-1]}))

 def test_round_reconciliation_keeps_unconfirmed_index_score_separate(self):
  import sys
  sys.path.insert(0,str(p.parent))
  from cs2_round_reconcile import reconcile
  k=dict(match_id="m",map_id="a",map_name="mirage")
  index=dict(**k,map_index=1,match_date="2026-01-01",rounds_played=13,score1=2,score2=0)
  rounds=[dict(**k,player_slot=slot,round=rd,kills=int(slot==0),deaths=int(slot==5),assists=0,headshots=int(slot==0)) for rd in range(1,14) for slot in range(10)]
  kills=[dict(**k,kill_id=str(rd),round=rd,attacker_player_slot=0,victim_player_slot=5,headshot=True) for rd in range(1,14)]
  native=[dict(event="m|1",player=str(slot),map="mirage",date="2026-01-01",rounds=13,regulationScorePair=[0,13],kills=13*int(slot==0),deaths=13*int(slot==5),assists=0,headshots=13*int(slot==0)) for slot in range(10)]
  result=reconcile([index],rounds,kills,native)
  self.assertEqual(result["exact_totals_index_score_unconfirmed_diagnostic"],1)
  self.assertNotIn("exact_totals_index_score_confirmed",result)
  self.assertEqual(reconcile([dict(index,score1=13,score2=0)],rounds,kills,native)["exact_totals_index_score_confirmed"],1)
  self.assertEqual(reconcile([index],rounds,kills,[])["not_in_native_regulation_cohort"],1)
  self.assertEqual(reconcile([index],rounds,kills,[dict(x,regulationScorePair=None) for x in native])["native_regulation_score_unverified"],1)
  self.assertEqual(reconcile([index],rounds,kills[:-1],native)["kill_event_disagreement"],1)
