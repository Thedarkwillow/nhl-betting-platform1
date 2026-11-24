import unittest,importlib.util
from pathlib import Path
p=Path(__file__).resolve().parents[1]/"scripts/import-playerwon-shifts.py"
s=importlib.util.spec_from_file_location("playerwon_import",p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
HEADER="season,game_date,game_type,game_id,shift_id,team_id,player_id,period,start_seconds,end_seconds,duration_seconds,is_valid_interval,quality_flags\n"
A="20252026,2025-10-01,2,2025020001,1,1,8470001,1,0,30,30,true,\n"
B="20252026,2025-10-01,2,2025020001,2,2,8470002,1,0,40,40,true,\n"
class Import(unittest.TestCase):
 def test_valid(self):
  r=m.parse((HEADER+A+B).encode(),2025020001)
  self.assertEqual(len(r["rows"]),2);self.assertFalse(r["modelEligible"]);self.assertFalse(r["pregameAvailabilityVerified"])
 def test_duplicate(self):
  with self.assertRaises(ValueError):m.parse((HEADER+A+A+B).encode(),2025020001)
 def test_wrong_game(self):
  with self.assertRaises(ValueError):m.parse((HEADER+A+B).encode(),2025020002)
 def test_invalid_duration(self):
  with self.assertRaises(ValueError):m.parse((HEADER+A+B.replace(",40,40,",",40,41,")).encode(),2025020001)
if __name__=="__main__":unittest.main()
