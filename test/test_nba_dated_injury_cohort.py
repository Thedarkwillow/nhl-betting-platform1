import importlib.util, pathlib, unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/reconcile-nba-dated-injury-cohort.py"
s=importlib.util.spec_from_file_location("cohort",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_names_and_clocks(self):
  self.assertIn("nikolajokic",m.names("Jokić, Nikola"))
  self.assertIsNone(m.utc("2026-11-01T01:30:00",True))
  self.assertIsNone(m.utc("2026-10-24T19:00:00"))
  self.assertEqual(m.ident("0022600123"),"22600123")
 def test_empty_cohort_never_claims_resolution(self):
  x=m.reconcile([],[],[],[],[],[],[])
  self.assertFalse(x["originalAggregateReproduced"]);self.assertFalse(x["original135RowLevelReconciliationVerified"]);self.assertEqual(x["newCandidateMappings"],0)
