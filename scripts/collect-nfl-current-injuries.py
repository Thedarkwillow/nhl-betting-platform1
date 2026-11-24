#!/usr/bin/env python3
"""Private actual-time capture, report status only. No missing-as-healthy inference."""
import csv,gzip,io,json,urllib.request,datetime,pathlib,collections
UTC=datetime.timezone.utc
now=datetime.datetime.now(UTC)
source="https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv.gz"
req=urllib.request.Request(source,headers={"User-Agent":"private-sports-research/1.0"})
with urllib.request.urlopen(req,timeout=25) as response:
    raw=response.read(4_000_001)
if len(raw)>4_000_000: raise ValueError("unexpected injury input size")
with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
    data=gz.read(20_000_001)
if len(data)>20_000_000: raise ValueError("unexpected decompressed size")
reader=csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
required={"season","week","season_type","team","gsis_id","date_modified","report_status","practice_status"}
if not required.issubset(reader.fieldnames or []): raise ValueError("injury schema mismatch")
rows={}
for r in reader:
    if r["season"]!="2026" or r["season_type"]!="REG" or not r["gsis_id"] or not r["team"]: continue
    try:
        dt=datetime.datetime.fromisoformat(r["date_modified"].replace("Z","+00:00"))
        if dt.tzinfo is None: continue
        dt=dt.astimezone(UTC); week=int(r["week"])
    except ValueError: continue
    if not 1<=week<=18 or not now-datetime.timedelta(hours=72)<=dt<=now: continue
    status=r["report_status"].strip().lower().replace(" ","_")
    if status not in {"out","doubtful","questionable","probable"}:
        practice=r["practice_status"].strip().lower()
        status="did_not_participate" if practice=="did not participate" else "report_status_unconfirmed"
    key=(r["team"],r["gsis_id"],week)
    row=dict(team=key[0],gsisId=key[1],week=week,season=2026,modifiedAt=dt.isoformat(),status=status)
    old=rows.get(key)
    if old is None or row["modifiedAt"]>old["modifiedAt"]: rows[key]=row
    elif row["modifiedAt"]==old["modifiedAt"] and row["status"]!=old["status"]: old["status"]="ambiguous"
if not rows: raise ValueError("No timestamp-certified fresh injury records")
out={"kind":"nflverse_official_report_derived_injuries_v1","source":source,"capturedAt":now.isoformat(),
     "rows":list(rows.values()),"missingIsHealthy":False,"firstPartyMedicalClearanceVerified":False}
folder=pathlib.Path("outputs/nfl/availability"); (folder/"snapshots").mkdir(parents=True,exist_ok=True)
stamp=now.strftime("%Y%m%dT%H%M%SZ")
with (folder/"snapshots"/(stamp+".json")).open("x") as f: json.dump(out,f)
(folder/"latest.json").write_text(json.dumps(out)+"\n")
print(json.dumps({"records":len(rows),"statuses":dict(collections.Counter(r["status"] for r in rows.values())),"medicalClearanceVerified":False}))
