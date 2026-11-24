import importlib.util
from pathlib import Path
def load_three_season():
    spec=importlib.util.spec_from_file_location("three_season",Path(__file__).resolve().with_name("research-nhl-three-season-context.py"))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod
