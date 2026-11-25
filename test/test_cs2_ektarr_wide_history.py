import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from cs2_ektarr_wide_history import parse,finished_score
def row():
 r=dict(datetime="2026-01-01",is_total="False",match_id="123",game_id="123_1",map_id="4",map_name="Nuke",team1_id="5",team2_id="6",score1_game="13",score2_game="9")
 for s in (1,2):
  for i in range(1,6):
   p=f"team{s}_player{i}"
   r.update({p:f"player{s}{i}",p+"_id":str(s*10+i),p+"_kills":"25",p+"_deaths":"12",p+"_assists":"5"})
 return r
class Tests(unittest.TestCase):
 def test_ten_players_and_multikills(self):
  rs,x=parse([row()]);self.assertEqual(len(rs),10);self.assertEqual(x["completeMaps"],1);self.assertFalse(x["mapOrdinalVerified"])
 def test_duplicates_summary_and_final_score(self):
  r=row();self.assertEqual(len(parse([r,r])[0]),0);self.assertEqual(len(parse([{**r,"is_total":"True"}])[0]),0)
  self.assertFalse(finished_score(13,12));self.assertTrue(finished_score(19,17))
 def test_no_inferred_map_order(self):
  self.assertEqual(len(parse([{**row(),"game_id":""}])[0]),0)
