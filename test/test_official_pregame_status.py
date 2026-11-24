import datetime as D,runpy,unittest
NFL=runpy.run_path("scripts/collect-nfl-official-game-status.py")
NHL=runpy.run_path("scripts/collect-nhl-official-preview-status.py")
class StatusReports(unittest.TestCase):
    at=D.datetime.fromisoformat("2026-11-14T20:00:00+00:00")
    def test_nfl(self):
        html='<meta property="article:modified_time" content="2026-11-14T19:00:00Z"><h1>NFL Week 10 injury report</h1><p>2026 NFL season</p><h3>PATRIOTS</h3><ul><li>OUT: RB <a href="/players/a/">John Example</a> (injury)</li></ul><h3>LIONS</h3><ul><li>QUESTIONABLE: WR <a href="/players/b/">James Example</a></li></ul>'
        roster=[dict(season=2026,week=10,gsis_id="1",team="NE",full_name="John Example"),dict(season=2026,week=10,gsis_id="2",team="DET",full_name="James Example")]
        rows,teams,missing=NFL["parse_report"](html,10,2026,self.at,roster,{"NE","DET"})
        self.assertEqual(len(rows),2);self.assertEqual(teams,2);self.assertEqual(missing,0)
        with self.assertRaises(ValueError):NFL["parse_report"](html,11,2026,self.at,roster,{"NE","DET"})
    def test_nhl(self):
        html='<meta property="article:modified_time" content="2026-11-14T19:00:00Z"><h1>Sabres at Stars projected lineups</h1><p>Sabres projected lineup</p><p>Injured: John Example (lower body)</p><p>Stars projected lineup</p><p>Scratched: James Example</p>'
        game=dict(id=1,away="BUF",home="DAL",startTimeUTC="2026-11-15T01:00:00Z")
        roster=[dict(team="BUF",playerId=1,name="John Example"),dict(team="DAL",playerId=2,name="James Example")]
        rows,missing=NHL["parse_report"](html,game,roster,self.at)
        self.assertEqual(len(rows),2);self.assertEqual(missing,0)
        with self.assertRaises(ValueError):NHL["parse_report"](html,{**game,"home":"NYR"},roster,self.at)
if __name__=="__main__":unittest.main()
