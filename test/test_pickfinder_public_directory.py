import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from importlib.machinery import SourceFileLoader
m=SourceFileLoader("pickfinder_free_research",str(Path(__file__).resolve().parents[1]/"scripts/pickfinder-free-research.py")).load_module()
class DirectoryTest(unittest.TestCase):
    def test_team_and_link(self):
        p=m.parse('<h2>Example Team</h2><a href="/leagues/call-of-duty/players/example">Example <span>15 kills</span></a><a href="https://unrelated.invalid/leagues/call-of-duty/players/no">No</a>')
        self.assertEqual(m.summarize(p)["playerLinks"],1)
        self.assertEqual(p.player_links[0],{"path":"/leagues/call-of-duty/players/example","heading":"Example Team","label":"Example 15 kills"})
        self.assertEqual(m.summarize(p)["tables"],0)
    def test_table_preserved(self):
        p=m.parse('<h2>Stats</h2><table><tr><th>Player</th></tr><tr><td>A</td></tr></table>')
        self.assertEqual(m.summarize(p)["rows"],2)
if __name__=="__main__":unittest.main()
