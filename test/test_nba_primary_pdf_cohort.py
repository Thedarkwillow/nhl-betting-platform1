import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nba_primary_pdf_cohort_audit import time_at,url_for,verify
class Test(unittest.TestCase):
 def test_exact_report_clock(self):
  self.assertTrue(url_for(time_at("2026-10-24T22:30:00+00:00")).endswith("2026-10-24_06_30PM.pdf"))
 def test_late_report_not_fetched(self):
  r=dict(reportAt="2026-10-24T22:30:00+00:00",cutoffAt="2026-10-24T22:20:00+00:00",team="CLE",reportName="Fixture")
  d,e=verify([r],lambda _:self.fail("late report queried"))
  self.assertEqual(d["counts"]["invalid_reconstructed_binding"],1)
  self.assertFalse(d["freezeApproved"])
