import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/collect-keyfree-sports-tables.py"
s=importlib.util.spec_from_file_location("collector",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_robot_policy(self):
  self.assertFalse(m.allowed("https://example.com/abc",lambda *a:"User-agent: *\nDisallow: /abc"))
  self.assertTrue(m.allowed("https://example.com/abc",lambda *a:"User-agent: *\nDisallow: /other"))
 def test_nfl_schema(self):
  h="<table><tr><th>Team</th><th>Season</th><th>EPA/Play</th><th>Success %</th><th>EPA/Pass</th><th>EPA/Rush</th></tr>"
  row="<tr><td>Buffalo Bills</td><td>2026</td><td>0.1</td><td>46%</td><td>.2</td><td>-.1</td></tr>"
  self.assertEqual(m.parse(h+row+"</table>","nfl_epa")[0]["team"],"BUF")
  self.assertEqual(m.parse(h+row+row+"</table>","nfl_epa"),[])
  self.assertEqual(m.parse(h+row.replace("2026","2025")+"</table>","nfl_epa"),[])
 def test_usage_no_fake_player(self):
  h="<table><tr><th>Player</th><th>Team</th><th>Games</th><th>Snaps</th><th>Snap %</th><th>Tgt %</th><th>Rush %</th></tr>"
  row="<tr><td><a href='/player'>Test Player</a></td><td>BUF</td><td>8</td><td>200</td><td>60</td><td>14</td><td>0</td></tr>"
  self.assertEqual(m.parse(h+row+"</table>","nfl_usage")[0]["targetPerSnapPct"],14)
  self.assertEqual(m.parse(h+row.replace("<a href='/player'>Test Player</a>","Test Player")+"</table>","nfl_usage"),[])
if __name__=="__main__":unittest.main()
