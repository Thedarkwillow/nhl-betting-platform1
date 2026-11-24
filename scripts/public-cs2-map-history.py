#!/usr/bin/env python3
"""CS2 map baseline from the user-permitted source candidate; no raw publication."""
import csv, hashlib, importlib.util, json, pathlib, re, tempfile, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("free",ROOT/"scripts/public-eight-free-history.py")
free=importlib.util.module_from_spec(spec);spec.loader.exec_module(free)
URL="https://media.githubusercontent.com/media/Aokua/csgopred/fce7cfc07351df540bedccac3c71808295d6fa34/data/raw/kaggle/players.csv"
SHA="8da9645a3d32063fcd3de4a199c222c01ac9e9dd14b574621a4a9136c2a2bddf"
SIZE=135139635
def val(row,*keys):
    for k in keys:
        if row.get(k) not in ("",None):return row[k]
    return None
def count(v):
    if v is None or not re.fullmatch(r"\d+(?:\.0+)?",str(v)):raise ValueError("count")
    return int(str(v).split(".")[0])
def parse(f):
    reader=csv.DictReader(f);cols=reader.fieldnames or []
    print(json.dumps({"stage":"cs2_csv_schema","columns":cols[:180]}),flush=True)
    groups=defaultdict(list);dates=set();old=0;invalid=0
    for row in reader:
        try:
            day=str(val(row,"date","datetime","start_date","match_date"))[:10];datetime.strptime(day,"%Y-%m-%d");dates.add(day)
            if day<"2023-09-27":old+=1;continue
            match=val(row,"match_id","matchId");mp=val(row,"map_id","map_name","_map","map")
            if not match or not mp:raise ValueError("no map")
            # Long-format explicit IDs and counts only. Never derive kills from KD diff.
            if val(row,"player_id","playerId"):
                pid=val(row,"player_id","playerId")
                if not val(row,"team","team_name","team_id"):raise ValueError("team")
                k,d,a=[count(val(row,x)) for x in ("kills","deaths","assists")]
                groups[(match,mp)].append(dict(event=match+"|"+mp,player=pid,date=day,kills=k,deaths=d,assists=a))
            else:
                # Wide format requires native player IDs; names are not globally unique.
                batch=[]
                for side in ("team1","team2"):
                    for i in range(1,6):
                        p=f"{side}_player{i}";pid=val(row,p+"_id",p+"_player_id")
                        if not pid:raise ValueError("no stable player id")
                        k,d,a=[count(val(row,p+"_"+x)) for x in ("kills","deaths","assists")]
                        batch.append(dict(event=match+"|"+mp,player=pid,date=day,kills=k,deaths=d,assists=a))
                groups[(match,mp)].extend(batch)
        except (ValueError,TypeError,KeyError):invalid+=1
    rows=[r for batch in groups.values() if len(batch)==10 and len({x["player"] for x in batch})==10 and len({x["date"] for x in batch})==1 for r in batch]
    return {"sourceDateMin":min(dates) if dates else None,"sourceDateMax":max(dates) if dates else None,"preCS2RowsExcluded":old,"invalidRows":invalid,"completeMaps":len(rows)//10,"baseline":free.baseline(rows)}
def main():
    try:
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"players.csv";h=hashlib.sha256();n=0
            req=urllib.request.Request(URL,headers={"User-Agent":"CS2ResearchDataAudit/1.0"})
            with urllib.request.urlopen(req,timeout=90) as r,p.open("wb") as f:
                while True:
                    chunk=r.read(1024*1024)
                    if not chunk:break
                    n+=len(chunk)
                    if n>SIZE:raise ValueError("size")
                    h.update(chunk);f.write(chunk)
            if n!=SIZE or h.hexdigest()!=SHA:raise ValueError("integrity")
            with p.open(encoding="utf-8-sig",newline="") as f:x=parse(f)
            out={"kind":"cs2_pinned_map_history_v1","source":"Zixuan Tang, Aokua/csgopred, CC BY 4.0 to extent rights held; user reports access; underlying rights unverified","sourceHash":SHA,"verifiedBytes":n,**x}
    except Exception as e:out={"kind":"cs2_pinned_map_history_v1","status":"unavailable","reason":free.safe_error(e)}
    print(json.dumps({**out,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
if __name__=="__main__":main()
