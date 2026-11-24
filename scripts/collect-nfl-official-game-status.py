#!/usr/bin/env python3
"""Private NFL.com explicit game-status research; no inferences from omissions."""
import datetime as D, gzip, json, pathlib, re, unicodedata, urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse
UTC=D.timezone.utc
TEAMS=dict(zip("CARDINALS FALCONS RAVENS BILLS PANTHERS BEARS BENGALS BROWNS COWBOYS BRONCOS LIONS PACKERS TEXANS COLTS JAGUARS CHIEFS RAIDERS CHARGERS RAMS DOLPHINS VIKINGS PATRIOTS SAINTS GIANTS JETS EAGLES STEELERS 49ERS SEAHAWKS BUCCANEERS TITANS COMMANDERS".split(),"ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LA MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS".split()))
def code(x): return {"LAR":"LA","AZ":"ARI","JAC":"JAX","WSH":"WAS"}.get(str(x).upper(),str(x).upper())
def name(x): return "".join(c.lower() for c in unicodedata.normalize("NFKD",str(x or "")) if c.isascii() and c.isalnum())
def stamp(x):
    try:
        t=D.datetime.fromisoformat(str(x).replace("Z","+00:00"))
        return t.astimezone(UTC) if t.tzinfo else None
    except ValueError: return None
class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.blocks=[]; self.stack=[]; self.times=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="meta" and a.get("property",a.get("name","")) in ("article:modified_time","article:published_time"):
            self.times.append(a.get("content"))
        if tag in ("h1","h2","h3","h4","li","p"):
            self.stack.append({"tag":tag,"text":[],"links":[],"link":None})
        elif tag=="a" and self.stack:
            href=a.get("href","")
            if urlparse(href).path.startswith("/players/"): self.stack[-1]["link"]=[]
    def handle_data(self,data):
        if self.stack:
            for b in self.stack: b["text"].append(data)
            if self.stack[-1]["link"] is not None:self.stack[-1]["link"].append(data)
    def handle_endtag(self,tag):
        if tag=="a" and self.stack and self.stack[-1]["link"] is not None:
            b=self.stack[-1];linked="".join(b["link"]).strip();b["link"]=None
            for parent in self.stack:parent["links"].append(linked)
        elif self.stack and self.stack[-1]["tag"]==tag:
            b=self.stack.pop()
            self.blocks.append((tag," ".join("".join(b["text"]).split()),b["links"]))
def parse_report(html,week,year,now,rosters,expected_teams):
    parser=ReportParser();parser.feed(html)
    if not any(t=="h1" and re.search(rf"\bNFL Week {week} injury report\b",s,re.I) for t,s,l in parser.blocks): raise ValueError("official_report_title_mismatch")
    if not re.search(rf"\b{year} NFL season\b",html,re.I): raise ValueError("official_report_season_mismatch")
    # NFL.com's current article also emits Schema.org JSON-LD timestamps.
    times=parser.times+re.findall(r'"date(?:Published|Modified)"\s*:\s*"([^"]+)"',html)
    dates=[x for x in map(stamp,times) if x is not None]
    if not dates: raise ValueError("official_report_timestamp_missing")
    modified=max(dates)
    if not now-D.timedelta(hours=72)<=modified<=now: raise ValueError("official_report_timestamp_stale")
    latest={}
    for r in rosters:
        try:
            wk=int(r["week"]);sea=int(r["season"])
        except (KeyError,TypeError,ValueError):continue
        identity=r.get("gsis_id") or r.get("player_id")
        n=r.get("full_name") or r.get("player_name") or " ".join(str(r.get(k) or "") for k in ("first_name","last_name"))
        if sea!=year or not week-3<=wk<=week or not identity or not name(n):continue
        old=latest.get(identity)
        if old is None or wk>old[0]:latest[identity]=(wk,code(r.get("team") or r.get("recent_team")),name(n))
        elif wk==old[0] and (code(r.get("team")),name(n))!=old[1:]:latest[identity]=(wk,None,None)
    roster={}
    for pid,(_,team,n) in latest.items():roster.setdefault((team,n),set()).add(pid)
    team=None;rows={};unmatched=0;seen_teams=set()
    for tag,txt,links in parser.blocks:
        if tag in ("h2","h3","h4"):
            team=TEAMS.get(txt.rstrip(":").upper())
            if team not in expected_teams:team=None
            elif team:seen_teams.add(team)
            continue
        if not team or tag!="li":continue
        m=re.match(r"^(OUT|DOUBTFUL|QUESTIONABLE)\s*:",txt,re.I)
        if not m:continue
        status=m.group(1).lower()
        for n in links:
            ids=roster.get((team,name(n)),set())
            if len(ids)!=1:unmatched+=1;continue
            pid=next(iter(ids));k=(team,pid,week)
            row=dict(team=team,gsisId=pid,season=year,week=week,modifiedAt=modified.isoformat(),status=status)
            if k in rows and rows[k]["status"]!=status:row["status"]="ambiguous"
            rows[k]=row
    if not rows or len(seen_teams)<2:raise ValueError("official_report_no_exact_status_matches")
    return list(rows.values()),len(seen_teams),unmatched
def dataset(name):
    p=pathlib.Path("outputs/nfl/history/2026")/(name+".json.gz")
    d=json.loads(gzip.decompress(p.read_bytes()))
    if d.get("dataset")!=name or d.get("recordCount")!=len(d.get("rows",[])):raise ValueError("history_contract")
    return d["rows"]
def main():
    now=D.datetime.now(UTC);schedule=dataset("schedule");rosters=dataset("weekly_rosters")
    dates={}
    for g in schedule:
        if g.get("game_type")!="REG":continue
        try:
            day=D.date.fromisoformat(g["gameday"]);week=int(g["week"])
        except (KeyError,ValueError,TypeError):continue
        if now.date()-D.timedelta(days=1)<=day<=now.date()+D.timedelta(days=4):dates.setdefault(week,set()).update((code(g["home_team"]),code(g["away_team"])))
    rows=[];sources=[];total=0;unknown=0
    for week,teams in sorted(dates.items())[:2]:
        urls=(
            f"https://fantasy-www.nfl.com/news/nfl-week-{week}-injury-report-2026-season",
            f"https://www.nfl.com/news/nfl-week-{week}-injury-report-2026-season")
        for url in urls:
            try:
                req=urllib.request.Request(url,headers={"User-Agent":"private-research-status-check/1.0","Accept":"text/html"})
                with urllib.request.urlopen(req,timeout=25) as r:
                    if urlparse(r.geturl()).hostname not in ("fantasy-www.nfl.com","www.nfl.com","nfl.com"):
                        raise ValueError("official_host_changed")
                    data=r.read(5_000_001)
                if len(data)>5_000_000:raise ValueError("official_report_size")
                found,covered,missing=parse_report(data.decode("utf8",errors="replace"),week,2026,now,rosters,teams)
                rows.extend(found);sources.append(url);total+=covered;unknown+=missing
                break
            except (OSError,ValueError) as e:
                print("REPORT_REFUSED",week,type(e).__name__,
                      str(e) if isinstance(e,ValueError) else "source_unavailable")
    if not rows:raise ValueError("no_current_official_report_evidence")
    out=dict(kind="nfl_first_party_published_game_status_v1",capturedAt=now.isoformat(),sources=sources,rows=rows,missingIsHealthy=False,activeGameRosterVerified=False)
    p=pathlib.Path("outputs/nfl/availability");(p/"official-snapshots").mkdir(parents=True,exist_ok=True)
    with (p/"official-snapshots"/(now.strftime("%Y%m%dT%H%M%SZ")+".json")).open("x") as f:json.dump(out,f)
    (p/"official-report-latest.json").write_text(json.dumps(out)+"\n")
    print(json.dumps(dict(officialReportedStatuses=len(rows),teamsCovered=total,unmatchedNames=unknown,medicalClearanceVerified=False)))
if __name__=="__main__":main()
