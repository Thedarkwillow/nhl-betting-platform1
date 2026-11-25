import unittest,sys,tempfile,importlib.util,os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
spec=importlib.util.spec_from_file_location("intake",Path(__file__).resolve().parents[1]/"scripts/cs2-cod-private-historical-intake.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestIntake(unittest.TestCase):
    def test_private_destination(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ,{"RESTRICTED_DESTINATION_VERIFIED":"0"}):
                with self.assertRaises(ValueError):m.save(d,"ektarr",b"x",".zip",{})
    def test_content_addressed_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/".git").mkdir()
            with patch.dict(os.environ,{"RESTRICTED_DESTINATION_VERIFIED":"1"}):
                sha,new=m.save(d,"ektarr",b"x",".zip",{})
                self.assertTrue(new)
                self.assertFalse(m.save(d,"ektarr",b"x",".zip",{})[1])
                (Path(d)/"research/esports-native-history/ektarr"/(sha+".zip")).write_bytes(b"corrupt")
                with self.assertRaises(ValueError):m.save(d,"ektarr",b"x",".zip",{})
    def test_cod_stop_on_refusal(self):
        with patch.object(m,"query",side_effect=ValueError("refused")) as q:
            with self.assertRaises(ValueError):m.cod("unused")
            self.assertEqual(q.call_count,1)
    def test_cs2_source_digest_rejection(self):
        with self.assertRaises(ValueError):m.load_pinned_history(b"bad")
