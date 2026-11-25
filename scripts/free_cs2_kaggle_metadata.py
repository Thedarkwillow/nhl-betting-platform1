#!/usr/bin/env python3
"""No-key metadata probes only; do not download datasets with unknown rights."""
import json,urllib.request,urllib.error,time
SOURCES={
 "ektarr":"ektarr/counter-strike-pro-matches",
 "gabrieldsl":"gabrieldsl/cs2-2025-professional-matches",
 "griffindesroches":"griffindesroches/cs2-professional-hltv-match-data-time-series",
 "sergionefedov":"sergionefedov/counter-strike-competitive-scene-2012-2026",
}
def probe(slug):
    try:
        url="https://www.kaggle.com/api/v1/datasets/view/"+slug
        req=urllib.request.Request(url,headers={"User-Agent":"EsportsResearchDataAudit/1.0","Accept":"application/json"})
        with urllib.request.urlopen(req,timeout=15) as r:
            raw=r.read(1000001)
            if len(raw)>1000000:raise ValueError("size")
        d=json.loads(raw)
        if not isinstance(d,dict):raise ValueError("shape")
        lic=d.get("licenseName") or d.get("license")
        files=d.get("resources") or d.get("datasetFiles") or d.get("files") or []
        return {"status":"metadata_read","license":lic if isinstance(lic,str) else None,"fileCount":len(files) if isinstance(files,list) else None,"dataDownloaded":False,"rightsApproved":False}
    except urllib.error.HTTPError as e:return {"status":"http_"+str(e.code),"dataDownloaded":False}
    except Exception:return {"status":"metadata_unavailable","dataDownloaded":False}
if __name__=="__main__":
    out={}
    for k,v in SOURCES.items():
        out[k]=probe(v)
        time.sleep(1.1)
    print(json.dumps({"kind":"free_cs2_kaggle_metadata_audit_v1","sources":out,"paidRequests":0,"rawRowsPublished":0}))
