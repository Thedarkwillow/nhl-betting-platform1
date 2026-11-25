"""Fixed prior-only NBA line research on previously examined archive.
Retrospective, not a new untouched test or operator settlement.
"""
import csv,json,hashlib,sys,math,collections
from statistics import mean
from pathlib import Path
from nba_verified_absence_replay import load_boxes,normalize,MARKETS,r
def metrics(rows,key):
    a=[x for x in rows if x[key] is not None]
    if not a:return {"n":0,"games":0,"dates":0,"brier":None,"logLoss":None}
    p=lambda x:x[key]
    return {"n":len(a),"games":len({x["game"] for x in a}),"dates":len({x["day"] for x in a}),"brier":mean((p(x)-x["y"])**2 for x in a),"logLoss":mean(-(x["y"]*math.log(p(x))+(1-x["y"])*math.log1p(-p(x))) for x in a),"higherRate":mean(x["y"] for x in a)}
def audit(offers,boxes):
    names=collections.defaultdict(list);players=collections.defaultdict(list)
    for x in boxes:names[x["name"]].append(x);players[x["id"]].append(x)
    keys=collections.Counter((o.get("game_id"),r.norm(o.get("player","")),o.get("stat")) for o in offers)
    ids=collections.Counter(o.get("prop_id") for o in offers)
    excluded=collections.Counter();out=collections.defaultdict(list);pairs=collections.defaultdict(list)
    for o in offers:
        try:
            field=MARKETS[o["stat"]];start=r.utc(o["start_time_utc"]);opened=r.utc(o["opened_at"]);closed=r.utc(o["closed_at"])
            if not start or not opened or not closed or not opened<=closed<start or keys[o["game_id"],r.norm(o["player"]),o["stat"]]!=1 or not o["prop_id"] or ids[o["prop_id"]]!=1:excluded["ambiguous_or_time"]+=1;continue
            a=[x for x in names[r.norm(o["player"])] if abs((x["tip"]-start).total_seconds())<=1800 and (x["teamName"] if x["home"] else x["opponentName"])==r.table_team(o["home_team"]) and (x["opponentName"] if x["home"] else x["teamName"])==r.table_team(o["away_team"])]
            if len(a)!=1:excluded["identity"]+=1;continue
            x=a[0];actual=float(o["actual"])
            if not math.isfinite(actual) or actual!=x[field]:excluded["actual"]+=1;continue
            prior=sorted([z for z in players[x["id"]] if z["day"]<x["day"] and z["tip"]<opened],key=lambda z:z["tip"])[-30:]
            if len(prior)<12:excluded["warmup"]+=1;continue
            paired={}
            for phase in ("open","close"):
                line=float(o[phase+"_line"])
                if not math.isfinite(line) or line<0 or line%1!=.5:excluded[phase+"_line"]+=1;continue
                if phase=="close" and o["result"]!=("over" if actual>line else "under"):excluded["close_result"]+=1;continue
                recent=prior[-10:];mins=.7*mean(z["minutes"] for z in recent)+.3*mean(z["minutes"] for z in prior)
                prob=lambda vals:(1+sum(v>line for v in vals))/(len(vals)+2)
                old=prob([z[field] for z in prior]);rec=prob([z[field] for z in recent]);minute=prob([z[field]/z["minutes"]*mins for z in prior])
                over=float(o[phase+"_over"]);under=float(o[phase+"_under"]);market=(1/over)/(1/over+1/under) if over>1 and under>1 else None
                z={"game":x["game"],"day":x["day"],"y":int(actual>line),"line":line,"old":old,"recent":.65*old+.35*rec,"minutes":minute,"market":market}
                out[o["stat"],phase].append(z);paired[phase]=z
            if len(paired)==2:pairs[o["stat"]].append(paired)
        except (KeyError,TypeError,ValueError,OverflowError):excluded["invalid"]+=1
    def summarize(a):
        return {"all":{k:metrics(a,k) for k in ("old","recent","minutes","market")},"laterDates":{k:metrics([x for x in a if x["day"]>="2026-10-28"],k) for k in ("old","recent","minutes","market")}}
    markets={m:{"opening":summarize(out[m,"open"]),"closing":summarize(out[m,"close"]),"pairedRows":len(pairs[m]),"differentThresholds":sum(p["open"]["line"]!=p["close"]["line"] for p in pairs[m]),"differentOutcomes":sum(p["open"]["y"]!=p["close"]["y"] for p in pairs[m])} for m in sorted(MARKETS)}
    return {"kind":"nba_pinned_open_close_research_v1","archiveRows":len(offers),"normalizedBoxRows":len(boxes),"excluded":dict(excluded),"markets":markets,"laterDateStart":"2026-10-28","retrospectiveOnly":True,"untouchedHoldoutVerified":False,"originalPlatformVerified":False,"freezeApproved":False,"paidRequests":0,"rawRowsPublished":0}
if __name__=="__main__":
    p=Path(sys.argv[1]);raw=p.read_bytes()
    expected="63adf33a8b6a88eb40e597ae62087902753278cb"
    if hashlib.sha1(("blob "+str(len(raw))).encode()+b"\0"+raw).hexdigest()!=expected:raise ValueError("archive blob mismatch")
    with p.open(encoding="utf-8-sig",newline="") as f:offers=list(csv.DictReader(f))
    print(json.dumps(audit(offers,normalize(load_boxes())),allow_nan=False))
