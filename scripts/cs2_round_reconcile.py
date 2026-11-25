"""Pinned round-table totals, same-demo-lineage consistency only. Slots are NOT Steam IDs."""
import io,json,hashlib,urllib.request
from collections import defaultdict,Counter
from cs2_ektarr_wide_history import finished_score
BASE="https://huggingface.co/datasets/blanchon/opencs2_dataset/resolve/main/"
FILES={"index/matches.parquet":"b4d83ba3413d35a7f5da6d04f8d5c41597caddb4fb29b4a3a865f5446945a685","events/round_player.parquet":"5b5ccbf30d9892b92e2978e03a0b6a130242a9b48135fe3b8619690ed775772e","events/kills.parquet":"6d98975eec40abfb23d0442eb867ee9bf6734897f29170f4437cbbc4090c0699"}
M=("kills","deaths","assists","headshots")
def norm(x):return str(x or "").lower().replace("de_","").replace(" ","")
def key(r):return (str(r["match_id"]),str(r["map_id"]),norm(r["map_name"]))
def read(f):
    import pyarrow.parquet as pq
    with urllib.request.urlopen(BASE+f,timeout=50) as r:raw=r.read(25_000_001)
    if len(raw)>25_000_000 or hashlib.sha256(raw).hexdigest()!=FILES[f]:raise ValueError("pinned table changed")
    return pq.read_table(io.BytesIO(raw)).to_pylist()
def reconcile(index,rounds,kills,native):
    ri=defaultdict(list);ki=defaultdict(list);ix=defaultdict(list);nix=defaultdict(list);counts=Counter()
    for r in index:ix[key(r)].append(r)
    for r in rounds:ri[key(r)].append(r)
    for r in kills:ki[key(r)].append(r)
    for r in native:nix[r["event"]].append(r)
    for k,a in ix.items():
        if len(a)!=1:counts["duplicate_index"]+=1;continue
        m=a[0];n=m["rounds_played"];score=(m["score1"],m["score2"])
        # The index score fields have not been proven to be per-map team scores.
        # Require a matching, separately reconstructed MR12 regulation map instead.
        # Do not promote the index or infer identities from same-demo agreement.
        eid=str(m["match_id"])+"|"+str(m["map_index"]);prior=nix.get(eid,[])
        if type(n) is not int or not 13<=n<=24:counts["invalid_round_count"]+=1;continue
        if not prior:counts["not_in_native_regulation_cohort"]+=1;continue
        if len(prior)!=10 or len({x.get("player") for x in prior})!=10 or any(norm(x.get("map"))!=k[2] or x["rounds"]!=n or str(x["date"])!=str(m["match_date"])[:10] for x in prior):counts["native_event_context_conflict"]+=1;continue
        pairs=[x.get("regulationScorePair") for x in prior]
        pair=pairs[0]
        if not (isinstance(pair,(list,tuple)) and len(pair)==2 and all(type(v) is int and v>=0 for v in pair) and max(pair)==13 and min(pair)<=11 and sum(pair)==n and all(p==pair for p in pairs)):counts["native_regulation_score_unverified"]+=1;continue
        index_final=all(type(v) is int and v>=0 for v in score) and sum(score)==n and finished_score(*score)
        if index_final and sorted(score)!=sorted(pair):counts["index_native_score_conflict"]+=1;continue
        if not index_final:counts["index_score_not_confirmed"]+=1
        rs=ri[k];slots=set();by=defaultdict(list);seen=set();bad=False
        for r in rs:
            sl,rd=r["player_slot"],r["round"]
            if type(sl) is not int or not 0<=sl<=9 or type(rd) is not int or (sl,rd) in seen or any(type(r[v]) is not int or r[v]<0 for v in M) or r["headshots"]>r["kills"]:bad=True;break
            seen.add((sl,rd));slots.add(sl);by[sl].append(r)
        if bad or len(slots)!=10 or len(rs)!=10*n or len({r["round"] for r in rs})!=n:counts["incomplete_round_slots"]+=1;continue
        nums=sorted({r["round"] for r in rs})
        if nums[0] not in (0,1) or nums!=list(range(nums[0],nums[0]+n)):counts["round_sequence"]+=1;continue
        totals={sl:tuple(sum(r[v] for r in by[sl]) for v in M) for sl in slots}
        # Kill-event cross-check: count attacks, deaths, and explicit headshots separately.
        ev=defaultdict(lambda:[0,0,0]);ids=set();eventbad=False
        for r in ki[k]:
            if not r.get("kill_id") or r["kill_id"] in ids or r["round"] not in nums:eventbad=True;break
            ids.add(r["kill_id"]);a,b=r["attacker_player_slot"],r["victim_player_slot"];h=r["headshot"]
            if a not in slots or b not in slots or a==b or type(h) not in (int,bool) or h not in (0,1):eventbad=True;break
            ev[a][0]+=1;ev[b][1]+=1;ev[a][2]+=int(h)
        if eventbad or any((totals[sl][0],totals[sl][1],totals[sl][3])!=tuple(ev[sl]) for sl in slots):counts["kill_event_disagreement"]+=1;continue
        counts["round_and_kill_event_agree"]+=1

        if sorted(totals.values())!=sorted(tuple(r[v] for v in M) for r in prior):counts["native_totals_disagreement"]+=1;continue
        counts["exact_full_map_totals_agree"]+=1
        counts["exact_totals_index_score_confirmed" if index_final else "exact_totals_index_score_unconfirmed_diagnostic"]+=1
        # Unique boxscore fingerprints can be diagnostics, never source identity authority.
        freq=Counter(totals.values());counts["unique_slot_stat_fingerprints"]+=sum(v==1 for v in freq.values())
    return dict(counts)
def run(native):
    try:
        t={f:read(f) for f in FILES}
        report={"status":"read","indexMaps":len(t["index/matches.parquet"]),"roundRows":len(t["events/round_player.parquet"]),"killRows":len(t["events/kills.parquet"]),"counts":reconcile(t["index/matches.parquet"],t["events/round_player.parquet"],t["events/kills.parquet"],native)}
    except Exception as e:report={"status":"unavailable","reason":type(e).__name__}
    print(json.dumps({"kind":"cs2_pinned_round_reconcile_v1",**report,"sameDemoLineage":True,"authoritativeLinksAdded":0,"newPermanentPlayerRows":0,"paidRequests":0,"rawRowsPublished":0,"modelPromoted":False}),flush=True)
