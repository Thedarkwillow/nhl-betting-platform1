import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nba_primary_pdf_cohort_audit import time_at,url_for,verify,parse_pages
class Test(unittest.TestCase):
 def test_exact_report_clock(self):
  self.assertTrue(url_for(time_at("2026-10-24T22:30:00+00:00")).endswith("2026-10-24_06_30PM.pdf"))
 def test_late_report_not_fetched(self):
  r=dict(reportAt="2026-10-24T22:30:00+00:00",cutoffAt="2026-10-24T22:20:00+00:00",team="CLE",reportName="Fixture")
  d,e=verify([r],lambda _:self.fail("late report queried"))
  self.assertEqual(d["counts"]["invalid_reconstructed_binding"],1)
  self.assertFalse(d["freezeApproved"])

 def test_continuation_page_carries_column_geometry_and_team(self):
  class Page:
   def __init__(self,lines):self.lines=lines
   def extract_text(self):return "Injury Report: 10/24/26 06:30 PM"
   def extract_words(self,**kwargs):
    return [dict(text=word,x0=x,top=y*12) for y,line in enumerate(self.lines) for x,word in line]
  a=Page([[(100,"Matchup"),(200,"Team"),(300,"Player"),(400,"Current"),(500,"Reason")],[(10,"10/24/2026"),(100,"BKN@CLE"),(200,"Cleveland"),(230,"Cavaliers"),(300,"First"),(340,"Player"),(400,"Out")]])
  b=Page([[(200,"Injury"),(240,"Report:"),(300,"10/24/26")],[(300,"Second"),(340,"Player"),(400,"Out")]])
  v=parse_pages([a,b],time_at("2026-10-24T22:30:00+00:00"))
  self.assertEqual(v,[("2026-10-24","BKN@CLE","clevelandcavaliers","firstplayer","Out"),("2026-10-24","BKN@CLE","clevelandcavaliers","secondplayer","Out")])
