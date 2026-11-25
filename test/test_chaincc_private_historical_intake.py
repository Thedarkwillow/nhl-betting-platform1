import sys,unittest,importlib.util,tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
spec=importlib.util.spec_from_file_location("chaincc",Path(__file__).resolve().parents[1]/"scripts/chaincc-private-historical-intake.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestIntake(unittest.TestCase):
    def test_date_cohort_and_complete_game(self):
        rows=[{"date":"2026-01-02","event":"g","player":str(i),"team":"a" if i<5 else "b","won":1 if i<5 else 0} for i in range(10)]
        with patch.object(m,"read_players",return_value=(rows,[])),patch.object(m,"complete_games",return_value=([rows],{})):
            games,report=m.inspect(b"x",2026,date(2026,11,25))
            self.assertEqual(report["completePlayerRows"],10)
            self.assertEqual(report["explicitOutcomeGames"],1)
            with self.assertRaises(ValueError):m.inspect(b"x",2025,date(2026,11,25))
            with self.assertRaises(ValueError):m.inspect(b"x",2026,date(2026,1,2))
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"cache"
            self.assertTrue(m.write_once(p,b"x"))
            self.assertFalse(m.write_once(p,b"x"))
            with self.assertRaises(ValueError):m.write_once(p,b"y")
            self.assertEqual(p.read_bytes(),b"x")
    def test_private_gate(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):m.run(d)
