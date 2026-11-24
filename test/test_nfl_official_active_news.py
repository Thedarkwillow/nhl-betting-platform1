#!/usr/bin/env python3
import datetime as D
import importlib.util
import pathlib
import unittest
p=pathlib.Path(__file__).resolve().parents[1]/"scripts/collect-nfl-explicit-active-news.py"
spec=importlib.util.spec_from_file_location("official_nfl_active",p)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
NOW=D.datetime(2026,11,19,23,1,tzinfo=D.timezone.utc)
URL="https://www.nfl.com/news/week-11-injuries-sunday-pregame-2026-nfl-season"
HTML='''<html><head><title>Official Week 11 NFL injuries to monitor</title>
<meta property="article:published_time" content="2026-11-19T22:40:00Z">
<meta property="article:modified_time" content="2026-11-19T22:55:00Z"></head>
<body><h2>Houston Texans</h2><ul>
<li>QB C.J. Stroud (knee; questionable) is officially active.</li>
<li>WR Someone Else (ankle) is expected to play.</li>
<li>RB Fake Player is inactive.</li>
</ul></body></html>'''
class Tests(unittest.TestCase):
 def test_positive_only(self):
  report=mod.collect(NOW,{URL:HTML},[URL])
  self.assertEqual(report["articlesExamined"],1)
  self.assertEqual(len(report["positiveSnippets"]),1)
  self.assertEqual(report["positiveSnippets"][0]["teamHeader"],"Houston Texans")
  self.assertIn("C.J. Stroud",report["positiveSnippets"][0]["snippet"])
  self.assertFalse(report["gameSpecificActiveRosterVerified"])
  self.assertTrue(report["firstGitPending"])
  self.assertEqual(report["providerCalls"],0)
 def test_stale_and_foreign_sources(self):
  changed=HTML.replace("2026-11-19T22:40:00Z","2026-11-14T22:40:00Z")
  self.assertEqual(mod.collect(NOW,{URL:changed},[URL])["positiveSnippets"],[])
  self.assertFalse(mod.official("https://example.com/news/active"))
  self.assertFalse(mod.official("http://www.nfl.com/news/active"))
  self.assertFalse(mod.official("https://www.nfl.com.evil.org/news/active"))
 def test_misleading_prognosis_is_not_active(self):
  txt=HTML.replace("is officially active.","is expected to play.")
  self.assertEqual(mod.collect(NOW,{URL:txt},[URL])["positiveSnippets"],[])
if __name__=="__main__":unittest.main()
