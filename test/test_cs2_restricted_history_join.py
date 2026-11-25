import unittest,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_restricted_history_join import evaluate

class Test(unittest.TestCase):
 def setUp(self):
  self.p="76561198000000001"
  self.r={"provider":"UnderdogAPI","sport":"CS2","providerOfferId":"fixture","providerRungId":"rung","providerPlayerId":"p","providerEventId":"e","productionEligible":False,"officialExportVerified":False,"observedAt":"2026-11-24T21:00:00Z","startsAt":"2026-11-24T23:00:00Z","stat":"Kills","period":"Maps 1-2","line":25.5}
  self.a={"kind":"restricted_independent_esports_research_v1","publicRedistributionAllowed":False,"officialExportVerified":False,"rows":[self.r]}
  self.i={"provider":"UnderdogAPI","providerPlayerId":"p","steamId":self.p,"independentlyVerified":True,"evidenceRef":"synthetic identity evidence","verifiedAt":"2026-11-24T20:00:00Z"}
  self.e={"provider":"UnderdogAPI","providerEventId":"e","startsAt":self.r["startsAt"],"independentlyVerified":True,"evidenceRef":"synthetic event evidence","verifiedAt":"2026-11-24T20:00:00Z","matchEvidenceId":"fixture","scopeVerified":True,"maps":[1,2],"verifiedSteamRoster":[self.p]}
  self.h=[{"player":self.p,"event":f"{n}|{m}","date":f"2026-11-{n:02d}","kills":12} for n in range(1,11) for m in (1,2)]
 def test_exact_links_and_history(self):
  out=evaluate(self.a,self.h,[self.i],[self.e])
  self.assertEqual(out["prior_history_ready"],1)
  self.assertFalse(out["modelPromoted"])
  self.assertEqual(out["actual_prop_outcomes_graded"],0)
 def test_missing_or_future_links_fail(self):
  self.assertEqual(evaluate(self.a,self.h,[],[self.e])["prior_history_ready"],0)
  self.assertEqual(evaluate(self.a,self.h,[{**self.i,"verifiedAt":"2026-11-25T00:00:00Z"}],[self.e])["prior_history_ready"],0)
  self.assertEqual(evaluate(self.a,self.h,[self.i],[{**self.e,"maps":[1]}])["prior_history_ready"],0)
 def test_incomplete_duplicate_and_same_day_history(self):
  self.assertEqual(evaluate(self.a,self.h[:-1],[self.i],[self.e])["prior_history_ready"],0)
  self.assertEqual(evaluate(self.a,self.h+[self.h[0]],[self.i],[self.e])["prior_history_ready"],0)
  h=[{**r,"date":"2026-11-24"} for r in self.h]
  self.assertEqual(evaluate(self.a,h,[self.i],[self.e])["prior_history_ready"],0)
