"""Bounded independent HLTV-derived source schema and match candidate check.
No alias-only identity approval, no raw public output, no paid provider calls."""
import json,re,sys,urllib.request,urllib.error,time
from pathlib import Path
from collections import Counter
BASE="https://api.csapi.de"
def get(path):
    with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={"User-Agent":"CS2HistoricalResearch/1.0","Accept":"application/json"}),timeout=20) as f:
        raw=f.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError("response bound")
    return json.loads(raw)
def schema(x,depth=0):
    if depth>2:return type(x).__name__
    if isinstance(x,dict):return {k:schema(v,depth+1) for k,v in sorted(x.items()) if re.fullmatch(r"[a-zA-Z_][a-zA-Z_0-9]{0,50}",k)}
    if isinstance(x,list):return {"length":len(x),"sample":schema(x[0],depth+1) if x else None}
    return type(x).__name__
def main(root):
    paths=["/counts/"];counts=Counter();reports=[]
    # The pinned OpenCS2 demo source documents right-side match_id as HLTV ID.
    # The left Ektarr local IDs are not a verified HLTV namespace.
    events=set()
    for p in sorted((Path(root)/"research/esports-identity-registry/evidence").glob("*.json"))[-20:]:
        for r in json.loads(p.read_text()).get("evidence",[]):
            if r.get("left",{}).get("namespace")!="ektarr":continue
            if r.get("right",{}).get("namespace")!="steam64" or len(r.get("sourceEvents",[]))!=2:continue
            a=str(r["sourceEvents"][1]).split("|")[0]
            if re.fullmatch(r"\d{6,8}",a):events.add(a)
    for e in sorted(events)[:4]:paths.extend(["/matches/"+e,"/matches/"+e+"/stats?by_map=true"])
    if not events:paths.extend(["/matches/2389666","/matches/2389666/stats?by_map=true"])
    for p in paths:
        try:
            x=get(p);counts["read"]+=1;reports.append({"endpointType":"counts" if p=="/counts/" else "map_stats" if "stats?" in p else "match","schema":schema(x)})
        except urllib.error.HTTPError as e:
            counts["http_"+str(e.code)]+=1
            if e.code in (401,403,429):break
        except Exception as e:counts[type(e).__name__]+=1
        time.sleep(1)
    print(json.dumps({"kind":"cs2_csapi_independent_preflight_v1","documentedHLTVMatchReferences":len(events),"counts":dict(counts),"schemaChecks":reports,"authoritativeLinksAdded":0,"modelPromoted":False,"paidRequests":0,"rawRowsPublished":0}))
if __name__=="__main__":main(sys.argv[1])
