import datetime as dt,importlib.util, pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/public-nba-alternate-history-audit.py"
s=importlib.util.spec_from_file_location("audit",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class AuditTest(unittest.TestCase):
 def test_normalization(self):
  raw=[]
  for team,opp,home,win,start in [("BOS","NYK",True,"W",1),("NYK","BOS",False,"L",11)]:
   for i in range(start,start+5):
    raw.append(dict(season=2027,season_type="Regular Season",season_id="22026",game_id="0022600001",game_date="2026-11-01",player_id=i,player_name="Player "+str(i),team_abbreviation=team,matchup=team+(" vs. " if home else " @ ")+opp,wl=win,min=30,**{k:1 for k in m.FIELDS}))
  rows,_=m.normalize(raw,2027,dt.date(2026,11,25));self.assertEqual(len(rows),10)
  with self.assertRaises(ValueError):m.normalize(raw+[raw[0]],2027,dt.date(2026,11,25))
 def test_crosswalk(self):
  c=dict(season=2027,espn_athlete_id="1",nba_player_id="2",espn_team_id=3,espn_full_name="Example Player",nba_player_name="Example Player")
  e=dict(playerId="1",teamId="3",name="Example Player",team="BOS")
  h=dict(player="2",day="2026-11-01",name="Example Player",team="BOS")
  self.assertEqual(len(m.nba_join([c],[e],[h])),1)
  self.assertEqual(len(m.nba_join([c,dict(c,nba_player_id="5")],[e],[h])),0)
  self.assertEqual(len(m.nba_join([c],[dict(e,team="NYK")],[h])),0)
 def test_nfl_join_no_evidence(self):
  self.assertEqual(m.nfl_join({}, {},dt.datetime.now(dt.timezone.utc))["candidateRows"],0)
if __name__=="__main__":unittest.main()
