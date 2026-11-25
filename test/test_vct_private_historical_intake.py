import unittest,sys,tempfile,importlib.util,os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
spec=importlib.util.spec_from_file_location("vctintake",Path(__file__).resolve().parents[1]/"scripts/vct-private-historical-intake.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestVCT(unittest.TestCase):
    def test_gate(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ,{"RESTRICTED_DESTINATION_VERIFIED":"0"}):
                with self.assertRaises(ValueError):m.run(d)
    def test_immutable_cache(self):
        import hashlib
        raw=b"fixture";sha=hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/".git").mkdir()
            with patch.dict(os.environ,{"RESTRICTED_DESTINATION_VERIFIED":"1"}),patch.object(m.free,"download",return_value=raw),patch.object(m,"vct",return_value={"sha256":sha,"completeMaps":2}):
                self.assertTrue(m.run(d)["newCache"])
                self.assertFalse(m.run(d)["newCache"])
                (Path(d)/"research/esports-native-history/vct-reference"/(sha+".duckdb")).write_bytes(b"changed")
                with self.assertRaises(ValueError):m.run(d)
    def test_empty_validation(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/".git").mkdir()
            with patch.dict(os.environ,{"RESTRICTED_DESTINATION_VERIFIED":"1"}),patch.object(m.free,"download",return_value=b"x"),patch.object(m,"vct",return_value={"sha256":"bad","completeMaps":0}):
                with self.assertRaises(ValueError):m.run(d)
