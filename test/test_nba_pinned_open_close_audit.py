import pathlib,sys,unittest
from datetime import datetime,timezone
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nba_pinned_open_close_audit import audit,r
class TestAudit(unittest.TestCase):
    def test_open_close_distinct_outcomes_and_no_future_feature(self):
        def box(i,day,points):
            t=datetime(2026,10,day,20,tzinfo=timezone.utc)
            return dict(id="1",game=str(i),day=t.date().isoformat(),tip=t,teamName=r.table_team("Boston Celtics"),opponentName=r.table_team("New York Knicks"),home=True,name=r.norm("Example Player"),minutes=30,points=points)
        prior=[box(i,i,15) for i in range(1,15)]
        target=box(24,24,20)
        row=dict(prop_id="p",game_id="g",player="Example Player",stat="Points",start_time_utc="2026-10-24T20:00:00Z",opened_at="2026-10-24T16:00:00Z",closed_at="2026-10-24T19:00:00Z",home_team="Boston Celtics",away_team="New York Knicks",actual="20",open_line="19.5",close_line="20.5",open_over="1.9",open_under="1.9",close_over="1.9",close_under="1.9",result="under")
        a=audit([row],prior+[target]);b=audit([row],prior+[target,box(25,25,50)])
        self.assertEqual(a["markets"],b["markets"])
        self.assertEqual(a["markets"]["Points"]["pairedRows"],1)
        self.assertEqual(a["markets"]["Points"]["differentOutcomes"],1)
        self.assertFalse(a["freezeApproved"])
if __name__=="__main__":unittest.main()
