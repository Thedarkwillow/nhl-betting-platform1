#!/usr/bin/env python3
"""Bounded existing MoneyPuck download path; temporary authorized research rows only."""
import importlib.util, json, os, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("dedicated",Path(__file__).with_name("research-nhl-dedicated-skater-goalie.py"))
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
base=lab.normalize
def normalize(row,season,role):
    r=base(row,season,role)
    if not r:return r
    r["position"]=row.get("position")
    if role=="skaters":
        # Only explicit source fields; never turn absent columns into zero.
        for market,field in (("faceoffsWon","faceoffsWon"),):
            value=lab.n(row,field)
            if value is not None and value.is_integer():r["actual"][market]=value
    return r
def main():
    lab.core.lab.normalize=normalize
    os.umask(0o077)
    with Path(sys.argv[1]).open("x") as out:
        for season in lab.core.lab.SEASONS:
            for role in ("skaters","goalies"):
                for r in lab.core.lab.download_archive(season,role):
                    x=dict(gameId=r["game"],gameDate=r["day"],playerId=r["player"],team=r["team"],opponent=r["opponent"],type="skater" if role=="skaters" else "goalie",gameState="FINAL",timeOnIceSeconds=r["toi"],position=r["position"])
                    for m,v in r["actual"].items():
                        if v is not None and v>=0 and float(v).is_integer():x[m]=int(v)
                    out.write(json.dumps(x,separators=(",",":"))+"\n")
if __name__=="__main__":main()
