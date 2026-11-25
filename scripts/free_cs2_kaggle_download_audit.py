#!/usr/bin/env python3
"""Bounded public Kaggle ZIP schema and exact-map evidence audit.

Declared licenses are not independent confirmation of underlying rights.
No raw rows, model promotion, or prop probabilities are published.
"""
import csv,hashlib,io,json,pathlib,re,tempfile,time,urllib.error,urllib.request,zipfile
from collections import Counter,defaultdict
from datetime import date
from esports_scope_history import evaluate
SOURCES={
 "ektarr":("ektarr/counter-strike-pro-matches","CC BY-SA 4.0"),
 "gabrieldsl":("gabrieldsl/cs2-2025-professional-matches","CC0: Public Domain"),
 "sergionefedov":("sergionefedov/counter-strike-competitive-scene-2012-2026","CC0: Public Domain"),
}
CAP=45_000_000
def get(url,limit):
    req=urllib.request.Request(url,headers={"User-Agent":"EsportsResearchDataAudit/1.0","Accept":"*/*"})
    with urllib.request.urlopen(req,timeout=45) as f:
        size=f.headers.get("Content-Length")
        if size and size.isdigit() and int(size)>limit:raise ValueError("download_limit")
        chunks=[];n=0
        while True:
            b=f.read(1024*1024)
            if not b:break
            n+=len(b)
            if n>limit:raise ValueError("download_limit")
            chunks.append(b)
    return b"".join(chunks)
def normalized_fields(fields):
    return {re.sub(r"[^a-z0-9]","_",s.strip().lower()):s for s in fields if isinstance(s,str)}
def exact_schema(fields):
    f=normalized_fields(fields)
    required={
       "match":("match_id","series_id","matchid","seriesid"),
       "ordinal":("map_index","map_number","map_order","map_ordinal"),
       "player":("steamid","steam_id","player_id","playerid","steam_id_64"),
       "day":("match_date","datetime","date","start_date","match_datetime"),
       "team":("team_id","team","team_name"),
       "map":("map_name","map","_map"),
       "kills":("kills",),"deaths":("deaths",),"assists":("assists",),
    }
    out={k:next((f[a] for a in aliases if a in f),None) for k,aliases in required.items()}
    if any(v is None for v in out.values()):return None
    if "headshots" in f:out["headshots"]=f["headshots"]
    return out
def count(v):
    if not isinstance(v,str) or not re.fullmatch(r"\d+(?:\.0+)?",v):raise ValueError("count")
    return int(v.split(".")[0])
def audit_csv(f):
    reader=csv.DictReader(f)
    fields=reader.fieldnames or []
    schema=exact_schema(fields);groups=defaultdict(list);n=0;bad=0;old=0;dates=set()
    for row in reader:
        n+=1
        if n>750000:raise ValueError("csv_row_cap")
        if not schema:continue
        try:
            d=row[schema["day"]][:10];date.fromisoformat(d)
            if d<"2023-09-27":old+=1;continue
            m,p,t,mp=[row[schema[k]].strip() for k in ("match","player","team","map")]
            i=count(row[schema["ordinal"]])
            if not all((m,p,t,mp)) or i not in range(1,8):raise ValueError("identity")
            stats={k:count(row[schema[k]]) for k in ("kills","deaths","assists")+(("headshots",) if "headshots" in schema else ())}
            if "headshots" in stats and stats["headshots"]>stats["kills"]:raise ValueError("count")
            groups[m,i].append(dict(event=m+"|"+str(i),player=p,date=d,team=t,map=mp,**stats))
        except (ValueError,TypeError,KeyError,AttributeError):bad+=1
    clean=[]
    for key,rs in groups.items():
        if len(rs)!=10 or len({r["player"] for r in rs})!=10 or sorted(Counter(r["team"] for r in rs).values())!=[5,5] or len({r["date"] for r in rs})!=1 or len({r["map"] for r in rs})!=1:continue
        clean.extend(rs);dates.add(rs[0]["date"])
    return {"columns":fields[:100],"rowsRead":n,"exactExplicitSchema":schema is not None,"invalidRows":bad,"preCS2RowsExcluded":old,"candidateCompleteMapShapes":len(clean)//10,"candidatePlayerRows":len(clean),"dateMin":min(dates) if dates else None,"dateMax":max(dates) if dates else None,"verifiedFinalResult":False,"historicalModelApproved":False}
def run(slug,license_expected):
    try:
        meta=json.loads(get("https://www.kaggle.com/api/v1/datasets/view/"+slug,1_000_000))
        lic=meta.get("licenseName") or meta.get("license")
        if lic!=license_expected:return {"status":"license_changed_or_unknown","declaredLicense":lic if isinstance(lic,str) else None}
        raw=get("https://www.kaggle.com/api/v1/datasets/download/"+slug,CAP)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            members=z.infolist()
            if len(members)>100 or sum(x.file_size for x in members)>200_000_000:raise ValueError("expanded_limit")
            csvs=[x for x in members if x.filename.lower().endswith(".csv") and not x.is_dir()]
            results=[]
            for x in csvs[:12]:
                with z.open(x) as f:
                    results.append({"file":pathlib.PurePosixPath(x.filename).name,**audit_csv(io.TextIOWrapper(f,encoding="utf-8-sig",newline=""))})
            return {"status":"downloaded_schema_audit","declaredLicense":lic,"sha256":hashlib.sha256(raw).hexdigest(),"downloadBytes":len(raw),"fileCount":len(members),"csvCount":len(csvs),"filesAudited":results,"underlyingRightsIndependentlyVerified":False}
    except urllib.error.HTTPError as e:return {"status":"http_"+str(e.code)}
    except Exception as e:return {"status":str(e) if isinstance(e,ValueError) and str(e) in ("download_limit","expanded_limit","csv_row_cap") else type(e).__name__}
if __name__=="__main__":
    out={}
    for name,(slug,lic) in SOURCES.items():
        out[name]=run(slug,lic);time.sleep(1.2)
        print(json.dumps({"kind":"cs2_free_candidate_download_progress_v1","source":name,"result":out[name],"paidRequests":0,"rawRowsPublished":0}),flush=True)
    print(json.dumps({"kind":"cs2_free_candidate_download_audit_v1","sources":out,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}))
