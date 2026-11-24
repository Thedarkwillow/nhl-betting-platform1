#!/usr/bin/env python3
"""Bounded PlayerWON shift CSV import. Private historical research only.
Source rights: https://www.playerwon.ca/data-use/ (attribution required).
Never treat postgame shifts as a pregame lineup confirmation.
"""
import argparse,csv,datetime as dt,hashlib,io,json,re
from pathlib import Path
from collections import defaultdict
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
ROOT=Path(__file__).resolve().parents[1]
SOURCE="https://www.playerwon.ca/data/nhl/shifts/"
MAX_BYTES=12_000_000
FIELDS={"season","game_date","game_type","game_id","shift_id","team_id","player_id","period","start_seconds","end_seconds","duration_seconds","is_valid_interval","quality_flags"}
def integer(v):
    if not re.fullmatch(r"\d+",str(v or "")): raise ValueError("invalid integer")
    return int(v)
def parse(raw,game_id):
    if len(raw)>MAX_BYTES: raise ValueError("export too large")
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if not reader.fieldnames or len(set(reader.fieldnames))!=len(reader.fieldnames) or not FIELDS.issubset(reader.fieldnames): raise ValueError("unexpected CSV schema")
    rows=[]; ids=set(); clocks=set(); rejected=0; teams=set(); dates=set()
    for r in reader:
        if None in r or any(r.get(k) is None for k in FIELDS): raise ValueError("malformed CSV row")
        g=integer(r["game_id"]); shift=integer(r["shift_id"])
        if g!=game_id or shift in ids: raise ValueError("unexpected game or duplicate shift ID")
        ids.add(shift); dates.add(r["game_date"])
        if r["is_valid_interval"].strip().lower() not in ("true","1") or r["quality_flags"].strip():
            rejected+=1; continue
        p,t,period,a,b,d=[integer(r[k]) for k in ("player_id","team_id","period","start_seconds","end_seconds","duration_seconds")]
        if not p or not t or not 1<=period<=4 or not 0<=a<b<=(300 if period==4 else 1200) or b-a!=d:
            raise ValueError("invalid interval despite source flag")
        k=(p,period,a,b)
        if k in clocks: raise ValueError("duplicate player interval")
        clocks.add(k); teams.add(t)
        rows.append({"gameId":g,"playerId":p,"teamId":t,"period":period,"startTime":f"{a//60:02}:{a%60:02}","endTime":f"{b//60:02}:{b%60:02}","durationSeconds":d,"shiftId":shift})
    if len(dates)!=1 or len(teams)!=2 or not rows: raise ValueError("incomplete game coverage")
    day=dt.date.fromisoformat(next(iter(dates)))
    if day>=dt.datetime.now(dt.timezone.utc).date(): raise ValueError("postgame date not established")
    spans=defaultdict(list)
    for r in rows: spans[(r["playerId"],r["period"])].append((r["startTime"],r["endTime"]))
    if any(any(a[1]>b[0] for a,b in zip(sorted(v),sorted(v)[1:])) for v in spans.values()): raise ValueError("overlapping intervals")
    return {"kind":"playerwon_shift_candidate_v1","source":"PlayerWON","sourceUrl":SOURCE,"gameId":game_id,"gameDate":str(day),"collectedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"sha256":hashlib.sha256(raw).hexdigest(),"rows":rows,"rejectedIntervals":rejected,"officialBoxscoreReconciled":False,"modelEligible":False,"pregameAvailabilityVerified":False,"publicRedistributionApproved":False,"researchOnly":True}
def download(game_id):
    # Exact publisher public GET form; one game per request, all intervals.
    if not 2016020000<game_id<2100029999 or str(game_id)[4:6]!="02": raise ValueError("regular-season game ID required")
    y=int(str(game_id)[:4])
    url=SOURCE+"?"+urlencode({"season":str(y)+str(y+1),"game_type":2,"game_id":game_id,"quality":"all","download":"csv"})
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self,*a,**kw): return None
    with build_opener(NoRedirect).open(Request(url,headers={"User-Agent":"NHL research CSV importer (one bounded historical game)","Accept":"text/csv"}),timeout=25) as response:
        if response.status!=200 or response.headers.get_content_type() not in ("text/csv","application/csv","application/octet-stream","application/vnd.ms-excel"): raise ValueError("expected documented CSV download")
        raw=response.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES: raise ValueError("export too large")
        return raw,url
def main():
    p=argparse.ArgumentParser();p.add_argument("csv",type=Path,nargs="?");p.add_argument("--download",action="store_true");p.add_argument("--game-id",type=int,required=True);a=p.parse_args()
    if bool(a.csv)==a.download: p.error("specify exactly one CSV or --download")
    if a.download:
        raw,url=download(a.game_id)
    else:
        if a.csv.stat().st_size>MAX_BYTES: raise ValueError("export too large")
        raw=a.csv.read_bytes();url=SOURCE
    doc=parse(raw,a.game_id);doc["downloadUrl"]=url;doc["acquisition"]="documented_csv_download" if a.download else "operator_csv"
    dest=ROOT/"outputs/nhl/research/playerwon-shifts";dest.mkdir(parents=True,exist_ok=True)
    name=str(a.game_id)+"-"+doc["sha256"][:16]
    # Preserve original file with its actual acquisition metadata; do not rewrite.
    rawfile=dest/(name+".csv")
    if not rawfile.exists():
        with rawfile.open("xb") as f:f.write(raw)
    out=dest/(name+".json")
    if not out.exists():
        with out.open("x",encoding="utf8") as f:json.dump(doc,f,separators=(",",":"))
    print(json.dumps({"gameId":a.game_id,"candidateIntervals":len(doc["rows"]),"rejectedIntervals":doc["rejectedIntervals"],"modelEligible":False}))
if __name__=="__main__":main()
