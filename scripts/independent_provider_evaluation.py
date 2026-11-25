"""One-time independent provider evaluation. Never certifies first-party offers."""
import datetime as dt
import hashlib, json, math, os, pathlib, sys, urllib.request, urllib.error
from collections import Counter
UTC=dt.timezone.utc
def clock(v):
    try:
        t=dt.datetime.fromtimestamp(v/1000,UTC) if type(v) in (int,float) else dt.datetime.fromisoformat(v.replace("Z","+00:00"))
        return t if t.tzinfo else None
    except (ValueError,TypeError,AttributeError,OverflowError,OSError):return None
def eligible(line,player,event,market,start,observed,now):
    return type(line) in (int,float) and math.isfinite(line) and line>=0 and all(isinstance(v,str) and v.strip() for v in (player,event,market)) and start is not None and observed is not None and observed<=now<start and (now-observed).total_seconds()<=900
def flash(doc,now):
    rows=doc.get("rows")
    if not isinstance(rows,list) or len(rows)>15:raise ValueError("row contract")
    counts=Counter(); keys=set()
    for r in rows:
        if not isinstance(r,dict):continue
        book=r.get("source")
        if book not in ("underdog","prizepicks"):continue
        if r.get("sourceType")!="dfs" or r.get("gameState")!="pre":continue
        if not eligible(r.get("line"),r.get("player"),r.get("eventId"),r.get("stat"),clock(r.get("startTime")),clock(r.get("fetchedAt")),now):continue
        k=(book,r["eventId"],r["player"],r["stat"],r["line"],str(r.get("variant")))
        if k not in keys:keys.add(k);counts[book]+=1
    return {"returned":len(rows),"freshIndependentLines":dict(counts),"sourceSnapshotNotOriginalOffer":True}
def propline(doc,now):
    if not isinstance(doc,list):raise ValueError("event contract")
    counts=Counter();keys=set()
    for e in doc:
        if not isinstance(e,dict):continue
        for b in e.get("bookmakers",[]):
            book=b.get("key")
            if book not in ("underdog","prizepicks"):continue
            for m in b.get("markets",[]):
                for o in m.get("outcomes",[]):
                    if o.get("name") not in ("Over","Under") or o.get("restricted") is True:continue
                    if not eligible(o.get("point"),o.get("description"),e.get("id"),m.get("key"),clock(e.get("commence_time")),clock(m.get("last_update")),now):continue
                    k=(book,e["id"],o["description"],m["key"],o["point"],o["name"],str(m.get("period")),str(o.get("dfs_odds_type")))
                    if k not in keys:keys.add(k);counts[book]+=1
    return {"events":len(doc),"freshIndependentSides":dict(counts),"sourceSnapshotNotOriginalOffer":True}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def run(root):
    if os.getenv("RESTRICTED_DESTINATION_VERIFIED")!="1" or not (root/".git").exists():raise ValueError("private checkout required")
    dest=root/"research/independent-prop-evaluations"/(os.environ["GITHUB_RUN_ID"]+"-"+os.environ["GITHUB_RUN_ATTEMPT"])
    dest.mkdir(parents=True,exist_ok=False)
    specs=[
      ("flash-cs2",("FLASHPROPS_API_KEY","FLASH_KEY","FLASHPROPSAPI"),"https://api.flashodds.live/api/v1/props?sport=cs2&limit=15","Authorization", "Bearer ",flash),
      ("propline-nba",("PROPLINE_API_KEY","PROPLINEAPI"),"https://api.prop-line.com/v1/sports/basketball_nba/odds?markets=player_points,player_rebounds,player_assists&bookmakers=prizepicks,underdog","X-API-Key","",propline)]
    report={"originalOffersVerified":0,"researchOnly":True,"providerRequests":0,"results":{}}
    for name,aliases,url,header,prefix,parse in specs:
        key=next((os.getenv(k) for k in aliases if os.getenv(k)),None)
        if not key:report["results"][name]={"status":"missing_secret"};continue
        report["providerRequests"]+=1
        try:
            req=urllib.request.Request(url,headers={header:prefix+key,"Accept":"application/json","User-Agent":"BoundedResearchEvaluation/1.0"})
            with urllib.request.build_opener(NoRedirect()).open(req,timeout=30) as f:
                raw=f.read(5_000_001);quota={h:f.headers.get(h) for h in ("X-Daily-Limit","X-Daily-Used","X-Daily-Remaining") if str(f.headers.get(h,"")).isdigit()}
            if len(raw)>5_000_000:raise ValueError("byte limit")
            now=dt.datetime.now(UTC)
            result=parse(json.loads(raw),now)
            digest=hashlib.sha256(raw).hexdigest()
            with (dest/(name+".json")).open("xb") as out:out.write(raw)
            report["results"][name]={"status":"observed","sha256":digest,"receivedAt":now.isoformat(),"quota":quota,**result}
        except urllib.error.HTTPError as e:report["results"][name]={"status":"http_error","code":e.code}
        except Exception as e:report["results"][name]={"status":"failed_closed","reason":type(e).__name__}
    with (dest/"receipt.json").open("x") as f:json.dump(report,f,sort_keys=True)
    print(json.dumps(report,sort_keys=True))
def test():
    n=dt.datetime(2026,11,25,tzinfo=UTC);start=n+dt.timedelta(hours=1)
    assert eligible(2.5,"P","E","M",start,n,n)
    assert not eligible(True,"P","E","M",start,n,n)
    assert not eligible(2.5,"P","E","M",start,n-dt.timedelta(minutes=16),n)
    assert not eligible(2.5,"P","E","M",n,n,n)
    row={"source":"underdog","sourceType":"dfs","gameState":"pre","eventId":"E","player":"P","stat":"kills","line":2.5,"startTime":start.isoformat(),"fetchedAt":n.timestamp()*1000}
    assert flash({"rows":[row,row]},n)["freshIndependentLines"]=={"underdog":1}
    assert flash({"rows":[dict(row,gameState="live")]},n)["freshIndependentLines"]=={}
    doc=[{"id":"E","commence_time":start.isoformat(),"bookmakers":[{"key":"prizepicks","markets":[{"key":"player_points","last_update":n.isoformat(),"outcomes":[{"name":"Over","description":"P","point":20.5},{"name":"Under","description":"P","point":20.5,"restricted":True}]}]}]}]
    assert propline(doc,n)["freshIndependentSides"]=={"prizepicks":1}
if __name__=="__main__":
    if sys.argv[1]=="--test":test()
    else:run(pathlib.Path(sys.argv[1]).resolve())
