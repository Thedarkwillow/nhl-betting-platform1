import importlib.util
from pathlib import Path
import tempfile
import unittest

module_path = Path(__file__).resolve().parent.parent / "scripts" / "pickfinder-public-research-directory.py"
spec = importlib.util.spec_from_file_location("directory", module_path)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

class Directory(unittest.TestCase):
    def test_discovery_scope_and_count_are_separate(self):
        with tempfile.TemporaryDirectory() as file:
            p = Path(file)
            (p / "index.html").write_text(
                '<title>Free Sports Betting Research</title><a href="/leagues/cs2/players">Players</a>'
                '<a href="https://not-pickfinder.com/leagues/fake/players">Ignore</a>'
                '<a href="/leagues/nba/team-rankings">NBA team</a>')
            (p / "cs2.html").write_text(
                '<title>CS2 (2 Players)</title><a href="/leagues/cs2/players/player-a">A</a>'
                '<a href="/leagues/cs2/players/player-a/">A duplicate</a>'
                '<a href="/leagues/dota-2/players/player-b">Ignore</a>')
            s = d.inventory(p, "2026-11-27T07:00:00Z")
            self.assertEqual(len(s['directories']), 1)
            self.assertEqual(s['directories'][0]['distinctPlayerLinks'], 1)
            self.assertEqual(s['directories'][0]['status'], 'listed_routes_only')
            self.assertFalse(s["actualOfferIdentityVerified"])
            self.assertFalse(s["modelInputsApproved"])
            with self.assertRaises(ValueError):
                d.inventory(p, "2026-11-27T07:00:00")

if __name__ == "__main__":
    unittest.main()
