import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nba_pending_primary_identity_audit import report
class Test(unittest.TestCase):
 def test_exact_name_id_team(self):
  a=dict(kind="nba_reconstructed_pending_identity_review_v1",rows=[dict(reconstructedIdentitySha256="x",team="DAL",nbaGameId="1",nbaReportId="2",reportName="Biberovic, Tarik")])
  b=dict(kind="nba_reconstructed_manual_identity_candidates_v1",rows=[dict(reconstructedIdentitySha256="x",team="DAL",nbaGameId="1",nbaPlayerId="2",espnAthleteId="3")])
  fake=lambda t:dict(team=dict(abbreviation=t),athletes=[dict(id="3",fullName="Tarik Biberović")])
  x=report(a,b,fake);self.assertEqual(x["counts"]["primary_espn_current_team_candidate_verified"],1);self.assertFalse(x["freezeApproved"])
  b["rows"][0]["espnAthleteId"]="4";self.assertEqual(report(a,b,fake)["counts"]["primary_id_conflict"],1)
