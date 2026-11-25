"""One bounded keyless evaluation of published Flash Props sample; not first-party offers.
No paid requests, no recurring polling, no raw publication or model promotion.
https://api.flashodds.live/cs2-player-props-api ; https://api.flashodds.live/aup
"""
import csv, io, json, hashlib, urllib.request, math, re
from datetime import datetime, timezone
from collections import Counter, defaultdict
BASE="https://api.flashodds.live/api/v1/"
def read(suffix):
    req=urllib.request.Request(BASE+suffix,headers={"User-Agent":"BoundedResearchSampleEvaluation/1.0","Accept":"application/json,text/csv"})
    with urllib.request.urlopen(req,timeout=30) as f:
        if f.geturl()!=BASE+suffix:raise ValueError("redirect")
        raw=f.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError("source_bound")
    return raw
def clock(v):
    try:
        x=datetime.fromisoformat(str(v).replace("Z","+00:00"))
        return x if x.tzinfo else None
    except (ValueError,TypeError):return None
def num(v):
    try:
        x=float(v)
        return x if math.isfinite(x) and x>=0 else None
    except (ValueError,TypeError):return None
def market(v):
    return str(v or "").strip().lower()
def sample(doc,now):
    if doc.get("sample") is not True or doc.get("sport")!="cs2" or not isinstance(doc.get("rows"),list) or len(doc["rows"])>5:raise ValueError("sample_contract")
    rows=doc["rows"];seen=set();future=0;stale=0;ex=0
    for r in rows:
        start=clock(r.get("startTime"));line=num(r.get("line"));stat=market(r.get("stat"))
        if not start or line is None or not r.get("player") or not r.get("eventId") or not re.fullmatch(r"(kills|headshots)_on_(map_1|maps_1_2|maps_1_2_3)",stat):ex+=1;continue
        k=(r["eventId"],r["player"],stat,line)
        if k in seen:continue
        seen.add(k)
        if start>now:future+=1
        else:stale+=1
    return {"rows":len(rows),"distinctNumericLines":len(seen),"futureStartCandidates":future,"alreadyStarted":stale,"invalidRows":ex,"providerReportedTotal":doc.get("totalAvailable") if type(doc.get("totalAvailable")) is int else None,"originalOffersVerified":0,"quoteFreshnessVerified":False}
def graded(raw):
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    fields=reader.fieldnames or []
    if len(fields)>60 or len(set(fields))!=len(fields):raise ValueError("csv_contract")
    rows=list(reader)
    if len(rows)>10000:raise ValueError("row_cap")
    def col(*names):
        norm=lambda s:re.sub("[^a-z0-9]","",s.lower())
        matching=[f for f in fields if norm(f) in {norm(n) for n in names}]
        return matching[0] if len(matching)==1 else None
    keys={"player":col("player","player_name"),"event":col("event_id","game_id","series_id"),"market":col("stat","stat_key","market_key","market"),"line":col("line","posted_line","book_line"),"outcome":col("outcome","result","graded_outcome"),"actual":col("actual","actual_value","actual_stat","actual_total","result_value"),"start":col("start_time","event_start","event_start_time","starts_at"),"captured":col("captured_at","snapshot_at","quoted_at","line_captured_at")}
    report={"rows":len(rows),"columns":fields,"recognizedFields":{k:bool(v) for k,v in keys.items()},"verifiedOriginalLines":0,"frozenModelDecisions":0,"sourceOutcomeCounts":{},"numericConsistencyChecked":0,"numericDisagreements":0,"timedPregameRows":0,"distinctContractRows":0,"conflictingContracts":0,"modelPromoted":False}
    if not all(keys[k] for k in ("player","event","market","line","outcome")):return report
    seen=defaultdict(set)
    counts=Counter()
    for r in rows:
        value=lambda k:r.get(keys[k],"") if keys[k] else ""
        line=num(value("line"));out=market(value("outcome"))
        outcomes={"over":"Higher","higher":"Higher","under":"Lower","lower":"Lower","push":"Push","tie":"Push"}
        if line is None or out not in outcomes or not all(value(k) for k in ("player","event","market")):continue
        k=(value("event"),value("player"),value("market"),line);o=outcomes[out]
        seen[k].add(o)
        actual=num(value("actual"))
        if actual is not None:
            report["numericConsistencyChecked"]+=1
            expected="Higher" if actual>line else "Lower" if actual<line else "Push"
            report["numericDisagreements"]+=int(expected!=o)
        a,b=clock(value("captured")),clock(value("start"))
        if a and b and a<b:report["timedPregameRows"]+=1
    for outcomes in seen.values():
        if len(outcomes)==1:counts[next(iter(outcomes))]+=1
    report.update(distinctContractRows=sum(counts.values()),conflictingContracts=sum(len(v)>1 for v in seen.values()),sourceOutcomeCounts=dict(counts))
    return report
def main():
    out={"kind":"flash_cs2_keyless_evaluation_v1","researchOnly":True,"paidRequests":0,"rawRowsPublished":0,"originalPlatformVerified":False}
    for kind,url in [("sample","sample?sport=cs2"),("graded","sample/cs2-lines.csv")]:
        try:
            raw=read(url)
            out[kind]={"sha256":hashlib.sha256(raw).hexdigest(),**(sample(json.loads(raw),datetime.now(timezone.utc)) if kind=="sample" else graded(raw))}
        except Exception as e:out[kind]={"status":"unavailable","reason":type(e).__name__}
    print(json.dumps(out))
if __name__=="__main__":main()
