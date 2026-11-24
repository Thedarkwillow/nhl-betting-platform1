import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/collect-natural-stat-trick.py"
s=importlib.util.spec_from_file_location("nst",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_endpoint(self):
  self.assertEqual(m.url_for("test"),"https://data.naturalstattrick.com/game.php?season=20172018&game=21138")
  self.assertIn("thruseason=",m.url_for("current"))
  self.assertNotIn("key=",m.url_for("current"))
 def test_schema(self):
  h="<table><thead><tr><th>Team</th><th>CF%</th><th>xGF%</th></tr></thead><tbody>"+''.join("<tr><td>T"+str(i)+"</td><td>50</td><td>51</td></tr>" for i in range(32))+"</tbody></table>"
  self.assertTrue(m.valid_team(m.tables(h)[0]))
  self.assertFalse(m.valid_team(m.tables(h.replace("T31","T30"))[0]))
if __name__=="__main__":unittest.main()
