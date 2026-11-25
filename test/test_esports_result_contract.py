import unittest,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from esports_result_contract import result,threshold_replay,RULES
class Test(unittest.TestCase):
 def fixture(self,sport):
  offer=dict(sport=sport,stat="kills",maps=[1,2],matchEvidenceId="m",verifiedPlayerId="p",identityVerified=True,scoringVerified=True,line=20.5)
  final=dict(matchEvidenceId="m",sport=sport,sourceAuthorized=True,officialFinalVerified=True,sourceRef="fixture",chronobreakResolved=True,scheduleDispositionVerified=True,maps=[dict(index=i,completed=True,forfeit=False,roundsPlayed=26,overtimeIncluded=True,players=[dict(id="p",participationVerified=True,playedFullMap=True,roundsPlayed=26,kills=11)]) for i in (1,2,3)])
  return offer,final
 def test_all_five_exact_scopes(self):
  for sport in RULES:
   o,f=self.fixture(sport);r=result(o,f)
   self.assertEqual(r["actual"],22)
   self.assertFalse(r["platformSettlementVerified"])
 def test_missing_or_duplicate_maps(self):
  o,f=self.fixture("CS2");f["maps"]=f["maps"][1:];self.assertEqual(result(o,f)["status"],"pending")
  o,f=self.fixture("CS2");f["maps"].append(f["maps"][0]);self.assertEqual(result(o,f)["status"],"pending")
 def test_forfeit_and_partial_participation(self):
  o,f=self.fixture("CS2");f["maps"][0]["forfeit"]=True;self.assertEqual(result(o,f)["status"],"void_candidate")
  o,f=self.fixture("VALORANT")
  for m in f["maps"]:m["players"][0]["roundsPlayed"]=13
  self.assertEqual(result(o,f)["status"],"pending")
  o,f=self.fixture("COD");f["maps"][0]["players"][0]["playedFullMap"]=False;self.assertEqual(result(o,f)["status"],"pending")
 def test_no_final_or_identity_no_result(self):
  o,f=self.fixture("DOTA2");f["officialFinalVerified"]=False;self.assertEqual(result(o,f)["status"],"pending")
  o,f=self.fixture("LOL");o["identityVerified"]=False;self.assertEqual(result(o,f)["status"],"pending")
 def test_replay_counts_are_not_calibrated(self):
  self.assertIsNone(threshold_replay([20]*9,20))
  r=threshold_replay([19,20,21]*5,20);self.assertEqual(r["historicalHigherCount"],5);self.assertEqual(r["historicalTieCount"],5);self.assertIsNone(r["calibratedProbability"])
