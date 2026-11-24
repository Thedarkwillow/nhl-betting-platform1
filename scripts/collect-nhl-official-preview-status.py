#!/usr/bin/env python3
"""Current league-published injured/scratched flags, not official active roster."""
import datetime as D,json,pathlib,re,unicodedata,urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse
UTC=D.timezone.utc
NAMES={"ANA":"Anaheim Ducks","BOS":"Boston Bruins","BUF":"Buffalo Sabres","CAR":"Carolina Hurricanes","CBJ":"Columbus Blue Jackets","CGY":"Calgary Flames","CHI":"Chicago Blackhawks","COL":"Colorado Avalanche","DAL":"Dallas Stars","DET":"Detroit Red Wings","EDM":"Edmonton Oilers","FLA":"Florida Panthers","LAK":"Los Angeles Kings","MIN":"Minnesota Wild","MTL":"Montreal Canadiens","NJD":"New Jersey Devils","NSH":"Nashville Predators","NYI":"New York Islanders","NYR":"New York Rangers","OTT":"Ottawa Senators","PHI":"Philadelphia Flyers","PIT":"Pittsburgh Penguins","SEA":"Seattle Kraken","SJS":"San Jose Sharks","STL":"St. Louis Blues","TBL":"Tampa Bay Lightning","TOR":"Toronto Maple Leafs","UTA":"Utah Mammoth","VAN":"Vancouver Canucks","VGK":"Vegas Golden Knights","WPG":"Winnipeg Jets","WSH":"Washington Capitals"}
NICK=dict(zip(NAMES,"Ducks|Bruins|Sabres|Hurricanes|Blue Jackets|Flames|Blackhawks|Avalanche|Stars|Red Wings|Oilers|Panthers|Kings|Wild|Canadiens|Devils|Predators|Islanders|Rangers|Senators|Flyers|Penguins|Kraken|Sharks|Blues|Lightning|Maple Leafs|Mammoth|Canucks|Golden Knights|Jets|Capitals".split("|")))
def canonical(x):return {"SJ":"SJS","NJ":"NJD","TB":"TBL","LA":"LAK","VEG":"VGK","UTAH":"UTA"}.get(str(x).upper(),str(x).upper())
def fold(x):return "".join(c.lower() for c in unicodedata.normalize("NFKD",str(x or "")) if c.isascii() and c.isalnum())
def stamp(s):
    try:
        t=D.datetime.fromisoformat(str(s).replace("Z","+00:00"))
        return t.astimezone(UTC) if t.tzinfo else None
    except ValueError:return None
def slug(s):return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
class Preview(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.stack=[];self.blocks=[];self.times=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="meta" and a.get("property",a.get("name","")) in ("article:modified_time","article:published_time"):
            self.times.append(a.get("content"))
        if tag in ("h1","h2","h3","h4","p"):
            self.stack.append((tag,[]))
    def handle_data(self,d):
        for _,parts in self.stack:parts.append(d)
    def handle_endtag(self,tag):
        if self.stack and self.stack[-1][0]==tag:
            t,p=self.stack.pop();self.blocks.append((t," ".join("".join(p).split())))
def parse_report(html,game,roster,now):
    start=stamp(game["startTimeUTC"])
    if start is None or start<=now:raise ValueError("game_started")
    teams=[canonical(game[x]) for x in ("away","home")]
    if any(x not in NAMES for x in teams):raise ValueError("unknown_team")
    parser=Preview();parser.feed(html)
    title=" ".join(s for tag,s in parser.blocks if tag=="h1")
    if not all(fold(NICK[x]) in fold(title) for x in teams) or "projectedlineup" not in fold(title):raise ValueError("article_game_mismatch")
    dates=[x for x in map(stamp,parser.times+re.findall(r'"date(?:Published|Modified)"\s*:\s*"([^"]+)"',html)) if x]
    if not dates:raise ValueError("article_timestamp_missing")
    modified=max(dates)
    if not now-D.timedelta(hours=36)<=modified<=now:raise ValueError("article_timestamp_stale")
    ids={}
    for p in roster:
        key=(canonical(p.get("team")),fold(p.get("name")))
        if isinstance(p.get("playerId"),int):ids.setdefault(key,set()).add(p["playerId"])
    current=None;found={};unknown=0;covered=set()
    for tag,txt in parser.blocks:
        heading=[t for t in teams if fold(txt)==fold(NICK[t]+" projected lineup") or fold(txt)==fold(NAMES[t]+" projected lineup")]
        if len(heading)==1:
            current=heading[0];covered.add(current);continue
        if not current:continue
        m=re.match(r"^(Injured|Scratched):\s*(.*)$",txt,re.I)
        if not m:continue
        status=m.group(1).lower()
        vals=re.sub(r"\([^()]*\)","",m.group(2))
        for n in vals.split(","):
            n=n.strip().rstrip(".")
            if not n or n.lower() in ("none","n/a"):continue
            matches=ids.get((current,fold(n)),set())
            if len(matches)!=1:unknown+=1;continue
            pid=next(iter(matches));key=(current,pid)
            row=dict(team=current,playerId=pid,gameId=game["id"],eventStartsAt=game["startTimeUTC"],reportedAt=modified.isoformat(),status=status)
            if key in found and found[key]["status"]!=status:row["status"]="ambiguous"
            found[key]=row
    if set(teams)!=covered:raise ValueError("article_team_sections_missing")
    return list(found.values()),unknown
def main():
    now=D.datetime.now(UTC)
    folder=pathlib.Path("outputs/pregame-availability")
    cross=json.loads((folder/"official-roster-crosswalk-latest.json").read_text())
    cap=stamp(cross.get("capturedAt"))
    if cross.get("kind")!="official_nhl_current_roster_crosswalk_v1" or not cap or not now-D.timedelta(hours=12)<=cap<=now:raise ValueError("current_roster_unavailable")
    schedule=json.loads(pathlib.Path("outputs/official-nhl/season-schedules/2026-27.json").read_text())
    if schedule.get("complete") is not True:raise ValueError("official_schedule_unavailable")
    from zoneinfo import ZoneInfo
    games=[g for g in schedule["games"] if stamp(g.get("startTimeUTC")) and now<stamp(g["startTimeUTC"])<now+D.timedelta(hours=16)]
    rows=[];sources=[];missing=0
    for g in games[:16]:
        away,home=[canonical(g[x]) for x in ("away","home")]
        if away not in NAMES or home not in NAMES:continue
        day=stamp(g["startTimeUTC"]).astimezone(ZoneInfo("America/New_York"))
        url=f"https://www.nhl.com/news/{slug(NAMES[away])}-{slug(NAMES[home])}-game-preview-{day.strftime('%B').lower()}-{day.day}-{day.year}"
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"private-roster-status-research/1.0"})
            with urllib.request.urlopen(req,timeout=15) as r:
                if urlparse(r.geturl()).hostname not in ("www.nhl.com","nhl.com"):raise ValueError("official_host_changed")
                data=r.read(4_000_001)
            if len(data)>4_000_000:raise ValueError("article_size")
            found,unknown=parse_report(data.decode("utf8",errors="replace"),g,cross["rows"],now)
            rows.extend(found);sources.append({"gameId":g["id"],"url":url});missing+=unknown
        except (ValueError,OSError):continue
    if not sources:raise ValueError("no_current_official_preview_sources")
    out=dict(kind="nhl_league_published_pregame_status_v1",capturedAt=now.isoformat(),rows=rows,sources=sources,medicalClearanceVerified=False,projectedLineupsNotFinal=True)
    (folder/"official-preview-snapshots").mkdir(parents=True,exist_ok=True)
    with (folder/"official-preview-snapshots"/(now.strftime("%Y%m%dT%H%M%SZ")+".json")).open("x") as f:json.dump(out,f)
    (folder/"official-preview-latest.json").write_text(json.dumps(out)+"\n")
    print(json.dumps(dict(officialNhlPreviewGames=len(sources),scheduledGames=len(games),reportedStatuses=len(rows),unmatchedNames=missing,medicalClearanceVerified=False)))
if __name__=="__main__":main()
