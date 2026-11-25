"""Shared quota checkpoints from restricted DataSportsAPI archives.
No credentials or provider rows are printed.
"""
from datetime import datetime,timezone,timedelta
from pathlib import Path
import json

def parse_time(value):
    try:
        t=datetime.fromisoformat(value.replace("Z","+00:00"))
        return t.astimezone(timezone.utc) if t.tzinfo else None
    except (ValueError,AttributeError,TypeError):
        return None

def read_docs(root):
    if not root:return []
    out=[]
    for p in sorted(Path(root).glob("*.json")):
        if p.stat().st_size>8_000_000:raise ValueError("archive_size")
        d=json.loads(p.read_text())
        if isinstance(d,dict) and d.get("kind") in ("datasportsapi_restricted_game_archive_v1","datasportsapi_quota_checkpoint_v1"):
            if d.get("source")!="DataSportsAPI":raise ValueError("archive_source")
            out.append(d)
    return out

def blocked_until(docs,now):
    ends=[]
    for d in docs:
        if d.get("source")!="DataSportsAPI":continue
        r=d.get("report",{}) if d.get("kind")=="datasportsapi_restricted_game_archive_v1" else d
        if not isinstance(r,dict):continue
        reason=r.get("rateLimitReason",r.get("reason"))
        if reason not in ("quota_exceeded","rate_limited"):continue
        observed=parse_time(d.get("observedAt"))
        end=parse_time(r.get("blockedUntil"))
        delay=r.get("rateLimitRetryAfterSeconds",r.get("retryAfterSeconds"))
        if end is None and observed and type(delay) is int and 0<delay<=172800:
            end=observed+timedelta(seconds=delay)
        if observed and end and observed<=now and observed<end<=observed+timedelta(days=2) and end>now:
            ends.append(end)
    return max(ends,default=None)

def quota_result(client,now):
    reason=getattr(client,"rateLimitReason",None)
    delay=getattr(client,"rateLimitRetryAfterSeconds",None)
    if reason not in ("quota_exceeded","rate_limited"):return {}
    # If the provider omits a valid wait, use a conservative fallback.
    if type(delay) is not int or not 0<delay<=172800:
        delay=86400 if reason=="quota_exceeded" else 120
    return {"rateLimitReason":reason,"rateLimitRetryAfterSeconds":delay,
            "blockedUntil":(now+timedelta(seconds=delay)).isoformat()}
