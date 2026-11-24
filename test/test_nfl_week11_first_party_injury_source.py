#!/usr/bin/env python3
"""NFL's Nov 2026 fantasy-www article HTML contract; synthetic original date & injury rows."""
import datetime as D
import runpy
import unittest
STATUS=runpy.run_path("scripts/collect-nfl-official-game-status.py")
POSITIVE=runpy.run_path("scripts/collect-nfl-explicit-active-news.py")
WHEN=D.datetime(2026,11,19,3,35,tzinfo=D.timezone.utc)
URL="https://fantasy-www.nfl.com/news/nfl-week-11-injury-report-2026-season"
HTML='''<html><head>
<script type="application/ld+json">{"datePublished":"2026-11-18T20:50:04.066Z","dateModified":"2026-11-18T23:57:29.499Z"}</script>
</head><body><h1>NFL Week 11 injury report: Player statuses for all 13 games</h1>
<p>2026 NFL season</p><h2>THURSDAY, NOV. 19</h2>
<h3>COLTS</h3><ul><li>OUT: TE <a href="/players/will-mallory/">Will Mallory</a> (injury)</li>
<li>QUESTIONABLE: WR <a href="/players/anthony-gould/">Anthony Gould</a></li></ul>
<h3>TEXANS</h3><ul><li>OUT: RB <a href="/players/woody-marks/">Woody Marks</a> (injury)</li></ul>
</body></html>'''
ROSTER=[dict(season=2026,week=11,gsis_id="00-0000001",team="IND",full_name="Will Mallory"),
 dict(season=2026,week=11,gsis_id="00-0000002",team="IND",full_name="Anthony Gould"),
 dict(season=2026,week=11,gsis_id="00-0000003",team="HOU",full_name="Woody Marks")]
class Week11Official(unittest.TestCase):
 def test_actual_article_shape_statuses_and_absence(self):
  rows,n,missing=STATUS["parse_report"](HTML,11,2026,WHEN,ROSTER,{"HOU","IND"})
  self.assertEqual(n,2)
  self.assertEqual(missing,0)
  self.assertEqual(len(rows),3)
  self.assertEqual({x["status"] for x in rows},{"out","questionable"})
  self.assertFalse(any(x.get("status")=="active" for x in rows))
 def test_nflverse_recent_team_field_is_supported(self):
  observed=[dict(season=r["season"],week=r["week"],gsis_id=r["gsis_id"],
   recent_team=r["team"],full_name=r["full_name"]) for r in ROSTER]
  rows,teams,missing=STATUS["parse_report"](HTML,11,2026,WHEN,observed,{"HOU","IND"})
  self.assertEqual(len(rows),3)
  self.assertEqual(teams,2)
  self.assertEqual(missing,0)
 def test_dates_must_have_been_published_before_prediction(self):
  future=HTML.replace("2026-11-18T23:57:29.499Z","2026-11-19T09:57:29.499Z")
  with self.assertRaises(ValueError):
   STATUS["parse_report"](future,11,2026,WHEN,ROSTER,{"HOU","IND"})
 def test_positive_news_archive_recognizes_current_schema_but_no_active_claim(self):
  self.assertTrue(POSITIVE["official"](URL))
  r=POSITIVE["collect"](WHEN,{URL:HTML},[URL])
  self.assertEqual(r["articlesExamined"],1)
  self.assertEqual(r["positiveSnippets"],[])
  self.assertFalse(r["gameSpecificActiveRosterVerified"])
 def test_positive_news_remains_explicit(self):
  active=HTML.replace("OUT: RB <a href=","QB C.J. Stroud is officially active. RB <a href=")
  r=POSITIVE["collect"](WHEN,{URL:active},[URL])
  self.assertEqual(len(r["positiveSnippets"]),1)
  self.assertEqual(r["positiveSnippets"][0]["teamHeader"],"TEXANS")
  self.assertFalse(r["gameSpecificActiveRosterVerified"])
if __name__=="__main__":unittest.main()
