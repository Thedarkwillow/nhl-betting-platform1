"""Exact historical offered-line replay with archived primary injury row hashes.
Fixed heuristic, no fitting or approval. Only explicit OUT teammates from prior
team appearances; no inference of active status or target-game usage."""
import collections,csv,hashlib,importlib.util,io,json,math,pathlib,sys,urllib.request
from statistics import mean
from datetime import timedelta
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("recon",ROOT/"scripts/reconcile-nba-dated-injury-cohort.py")
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
MARKETS={"Points":"points","Rebounds":"rebounds","Assists":"assists","Threes Made":"three_point_field_goals_made","Pts & Rebs & Asts":"pra"}
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True).encode()).hexdigest()
def load_boxes():
    import pyarrow.parquet as pq
    cfg=json.loads((ROOT/"config/nba/free-pinned-recovery-v1.json").read_text())
    rows=[]
    for s in cfg["assets"]:
        if not s["path"].endswith(("player_box_2026.parquet","player_box_2027.parquet")):continue
        with urllib.request.urlopen(urllib.request.Request(s["url"],headers={"User-Agent":"NBAHistoricalResearch/1.0"}),timeout=35) as f:raw=f.read(s["bytes"]+1)
        if len(raw)!=s["bytes"] or hashlib.sha1(("blob "+str(len(raw))).encode()+b"\0"+raw).hexdigest()!=s["gitBlob"]:raise ValueError("box integrity")
        rows.extend(pq.read_table(io.BytesIO(raw)).to_pylist())
    return rows
def normalize(raw):
    out=[];seen=set()
    for p in raw:
        try:
            if int(p["season_type"])!=2 or p["did_not_play"] is not False:continue
            id=r.ident(p["athlete_id"]);game=r.ident(p["game_id"]);t=r.utc(p["game_date_time"]);m=float(p["minutes"])
            if not id or not game or not t or not 0<m<=70:continue
            k=(game,id)
            if k in seen:raise RuntimeError("duplicate box")
            vals={k:float(p[k]) for k in ("points","rebounds","assists","three_point_field_goals_made","field_goals_attempted","free_throws_attempted","turnovers")}
            if not all(math.isfinite(v) and v>=0 and v.is_integer() for v in vals.values()):continue
            vals["pra"]=vals["points"]+vals["rebounds"]+vals["assists"]
            out.append(dict(id=id,game=game,day=t.astimezone(r.EAST).date().isoformat(),tip=t,team=r.abbr(p["team_abbreviation"]),teamName=r.table_team(p["team_display_name"]),opponentName=r.table_team(p["opponent_team_display_name"]),home=p["home_away"]=="home",name=r.norm(p["athlete_display_name"]),minutes=m,usage=vals["field_goals_attempted"]+.44*vals["free_throws_attempted"]+vals["turnovers"],**vals))
            seen.add(k)
        except (ValueError,TypeError,KeyError):continue
    return out
def features(past,teammates,field,line):
    if len(past)<12 or len(teammates)<5:return None
    p=sorted(past,key=lambda x:x["tip"])[-30:];recent=p[-10:]
    mins=min(48,.7*mean(x["minutes"] for x in recent)+.3*mean(x["minutes"] for x in p))
    absent=mean(x["usage"] for x in teammates[-10:])
    if absent<8:return None
    # Fixed conservative stress: half the absent player's usage share capped at 10%.
    # No target stat or observed game minutes/usage used in this transformation.
    lift=min(.10,.5*absent/100)
    if field not in ("points","three_point_field_goals_made","pra"):lift=0
    vals=[x[field]/x["minutes"]*mins for x in p]
    prob=lambda a:(1+sum(v>line for v in a))/(len(a)+2)
    return prob(vals),prob([v*(1+lift) for v in vals]),lift
def study(offers,boxes,injuries,proof):
    verified={x["rowSha256"] for x in proof["evidence"] if x["status"]=="primary_dated_out_verified"}
    if len(verified)!=135 or len(injuries)!=135 or {digest(x) for x in injuries}!=verified:raise ValueError("primary proof binding")
    groups=collections.defaultdict(list);players=collections.defaultdict(list);team=collections.defaultdict(list);names=collections.defaultdict(list)
    for x in boxes:
        groups[x["game"]].append(x);players[x["id"]].append(x);team[x["team"]].append(x);names[x["name"]].append(x)
    # Match archived injury game namespace via both team labels and exact scheduled clock.
    mapped=collections.defaultdict(list);counts=collections.Counter()
    for inj in injuries:
        cut=r.utc(inj["cutoffAt"]);day=cut.astimezone(r.EAST).date().isoformat()
        games=[(g,a) for g,a in groups.items() if a[0]["day"]==day and {x["team"] for x in a}=={inj["home"],inj["away"]} and abs((a[0]["tip"]-cut-timedelta(hours=1)).total_seconds())<=1800]
        if len(games)!=1:counts["injury_game_unmatched"]+=1;continue
        g,a=games[0]
        # Only prior name + team records; never infer identity from a target DNP.
        past=[x for x in team[inj["team"]] if x["day"]<day and cut-x["tip"]<=timedelta(days=60) and x["name"] in r.names(inj["reportName"])]
        ids={x["id"] for x in past}
        if len(ids)!=1:counts["injury_prior_identity_missing"]+=1;continue
        pid=next(iter(ids));mapped[g,inj["team"]].append((pid,sorted(past,key=lambda x:x["tip"])));counts["injury_prior_identity_matched"]+=1
    out=collections.defaultdict(list);seen=set();dups=collections.Counter((o["game_id"],r.norm(o["player"]),o["stat"]) for o in offers)
    for o in offers:
        try:
            field=MARKETS[o["stat"]];line=float(o["close_line"]);actual=float(o["actual"]);start=r.utc(o["start_time_utc"]);close=r.utc(o["closed_at"])
            if not start or not close or close>=start or line%1!=.5 or dups[o["game_id"],r.norm(o["player"]),o["stat"]]!=1 or o["prop_id"] in seen:continue
            seen.add(o["prop_id"])
            candidates=[x for x in names[r.norm(o["player"])] if abs((x["tip"]-start).total_seconds())<=1800 and (x["teamName"] if x["home"] else x["opponentName"])==r.table_team(o["home_team"]) and (x["opponentName"] if x["home"] else x["teamName"])==r.table_team(o["away_team"])]
            if len(candidates)!=1:counts["offer_identity_unmatched"]+=1;continue
            x=candidates[0]
            if actual!=x[field]:counts["actual_mismatch"]+=1;continue
            absent=[(pid,a) for pid,a in mapped[x["game"],x["team"]] if pid!=x["id"] and len(a)>=5]
            if not absent:continue
            # Rank on prior shot-use only, not the target result.
            pid,a=max(absent,key=lambda z:(mean(t["usage"] for t in z[1][-10:]),z[0]))
            past=[z for z in players[x["id"]] if z["day"]<x["day"]]
            f=features(past,a,field,line)
            if f is None:continue
            p,q,lift=f;y=int(actual>line)
            out[o["stat"]].append((p,q,y,x["game"],x["day"],lift))
        except (TypeError,ValueError,KeyError):continue
    metrics={}
    for m,a in out.items():
        loss=lambda p,y:-(y*math.log(p)+(1-y)*math.log1p(-p))
        metrics[m]={"n":len(a),"games":len({x[3] for x in a}),"dates":len({x[4] for x in a}),"baselineBrier":mean((p-y)**2 for p,q,y,*_ in a),"adjustedBrier":mean((q-y)**2 for p,q,y,*_ in a),"baselineLogLoss":mean(loss(p,y) for p,q,y,*_ in a),"adjustedLogLoss":mean(loss(q,y) for p,q,y,*_ in a),"nonzeroAdjustment":sum(x[-1]>0 for x in a)}
    return {"kind":"nba_primary_absence_real_line_replay_v1","verifiedInjuryRows":len(verified),"counts":dict(counts),"markets":metrics,"historicalOnly":True,"originalImmutableRowsVerified":False,"untouchedHoldoutVerified":False,"freezeApproved":False,"paidRequests":0,"rawRowsPublished":0}
if __name__=="__main__":
    with open(sys.argv[1],encoding="utf-8-sig",newline="") as f:offers=list(csv.DictReader(f))
    injuries=json.loads(pathlib.Path(sys.argv[2]).read_text())["rows"];proof=json.loads(pathlib.Path(sys.argv[3]).read_text())
    print(json.dumps(study(offers,normalize(load_boxes()),injuries,proof)))
