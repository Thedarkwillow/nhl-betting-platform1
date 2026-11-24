#!/usr/bin/env python3
"""First-party NFL.com *explicit* game-day active statements, research only.

A team injury report, expected-to-play language, active 53-man roster,
or omission from the inactives list NEVER counts as game-day active.
Only clearly positive, dated NFL.com 'is active' statements are saved.
All source content and identities remain in the PRIVATE research repo.
"""
import datetime as D
import gzip
import json
import os
import pathlib
import re
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
UTC = D.timezone.utc
ROOT = pathlib.Path(__file__).resolve().parents[1]
SAFE_HOSTS = {"www.nfl.com", "fantasy-www.nfl.com", "nfl.com"}
MAX_BYTES = 5_000_000
POSITIVE = re.compile(r"\b(?:is|was) (?:officially )?active\b|\bhas been declared active\b", re.I)
NEGATIVE = re.compile(r"\b(?:not active|inactive|is out|ruled out|will be inactive)\b", re.I)
NEWS = "https://fantasy-www.nfl.com/news"
HEADERS = ("h1", "h2", "h3", "h4")
def stamp(value):
    try:
        d = D.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return d.astimezone(UTC) if d.tzinfo is not None else None
    except (ValueError, TypeError): return None
def official(url):
    u = urlparse(url)
    return u.scheme == "https" and u.hostname in SAFE_HOSTS and (u.path=="/news" or u.path.startswith("/news/"))
def fetch(url, opener=urllib.request.urlopen):
    if not official(url): raise ValueError("unapproved_official_article_host")
    req = urllib.request.Request(url, headers={"User-Agent": "research-nfl-official-positive-evidence/1.0",
                                                "Accept": "text/html"})
    with opener(req, timeout=18) as resp:
        if not official(resp.geturl()): raise ValueError("redirected_from_nfl_domain")
        raw = resp.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES: raise ValueError("article_size_limit")
    return raw.decode("utf8", errors="replace")
class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[];self.header="";self.title="";self.blocks=[];self.links=[];self.meta={}
        self.active_link=None
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=="meta":
            key=a.get("property",a.get("name",""))
            if key in ("article:published_time","article:modified_time","datePublished","dateModified"):
                self.meta[key]=a.get("content")
        if tag in ("p","li","h1","h2","h3","h4","title"):
            self.stack.append({"tag":tag,"text":[],"header":self.header})
        if tag=="a":
            href=a.get("href")
            if href:self.links.append(href)
    def handle_data(self,data):
        for node in self.stack:node["text"].append(data)
    def handle_endtag(self,tag):
        if self.stack and self.stack[-1]["tag"]==tag:
            node=self.stack.pop()
            t=" ".join("".join(node["text"]).split())
            if not t:return
            if tag=="title":self.title=t
            elif tag in HEADERS:
                if tag=="h1" and not self.title:self.title=t
                if tag!="h1":self.header=t
            elif tag in ("p","li"):
                if POSITIVE.search(t) and not NEGATIVE.search(t) and len(t)<=700:
                    self.blocks.append({"text":t[:300],"teamHeader":node["header"][:90]})
def collect(now, html_by_url, candidates):
    output={"kind":"nfl_official_explicit_active_news_archive_v1",
       "capturedAt":now.isoformat(),"articlesExamined":0,
       "positiveSnippets":[], "providerCalls":0,
       "gameSpecificActiveRosterVerified":False,"firstGitPending":True,
       "researchOnly":True,"noMedicalClearanceByOmission":True}
    for url in candidates[:18]:
        if not official(url) or url not in html_by_url:continue
        parser=Parser();parser.feed(html_by_url[url])
        # New NFL.com articles publish dates in Schema.org JSON-LD, not
        # necessarily in their HTML meta tags.
        source=html_by_url[url]
        pub_date=next(iter(re.findall(r'"datePublished"\s*:\s*"([^"]+)"',source)),None)
        mod_date=next(iter(re.findall(r'"dateModified"\s*:\s*"([^"]+)"',source)),None)
        published=stamp(parser.meta.get("article:published_time") or parser.meta.get("datePublished") or pub_date)
        updated=stamp(parser.meta.get("article:modified_time") or parser.meta.get("dateModified") or mod_date)
        if published is None or not now-D.timedelta(hours=36)<=published<=now or (
            updated is not None and not published<=updated<=now):
            continue
        output["articlesExamined"]+=1
        for x in parser.blocks[:30]:
            output["positiveSnippets"].append({
              "sourceUrl":url,"title":parser.title[:180],
              "publishedAt":published.isoformat(),"updatedAt":(updated or published).isoformat(),
              "observedAt":now.isoformat(), "teamHeader":x["teamHeader"],
              "snippet":x["text"]})
    output["positiveSnippets"]=output["positiveSnippets"][:100]
    return output
def discover(now, week, opener=urllib.request.urlopen):
    candidates=set()
    # The official NFL news landing lists current-day articles and published
    # pregame status reports; never infer availability from missing articles.
    for url in (NEWS, NEWS+"/series/around-the-nfl-news"):
        try:
            text=fetch(url,opener)
            p=Parser();p.feed(text)
            for href in p.links:
                nxt=urljoin(url,href)
                if not official(nxt):continue
                path=urlparse(nxt).path.lower()
                if ("inactiv" in path or "injur" in path or "active-for" in path):
                    candidates.add(nxt.split("?")[0])
        except (ValueError, OSError, TimeoutError) as exc:
            print("OFFICIAL_NEWS_DISCOVERY_UNAVAILABLE",type(exc).__name__)
    if week:
        candidates.add(NEWS+"/week-"+str(week)+"-injuries-sunday-pregame-2026-nfl-season")
        candidates.add(NEWS+"/nfl-week-"+str(week)+"-injury-report-2026-season")
    # Direct first-party week link must not be displaced by related stories.
    direct=(NEWS+"/nfl-week-"+str(week)+"-injury-report-2026-season") if week else None
    return ([direct] if direct else [])+[u for u in sorted(candidates) if u!=direct][:17]
def upcoming_week(now):
    p=ROOT/"outputs/nfl/history/2026/schedule.json.gz"
    data=json.loads(gzip.decompress(p.read_bytes()))
    if data.get("dataset")!="schedule" or data.get("recordCount")!=len(data.get("rows",[])):
        raise ValueError("invalid_original_season_schedule")
    for r in sorted(data["rows"],key=lambda x:x.get("gameday","9999")):
        try:day=D.date.fromisoformat(r["gameday"])
        except (KeyError,TypeError,ValueError):continue
        if 0<=(day-now.date()).days<=4 and r.get("game_type")=="REG":
            return int(r["week"])
    return None
def main():
    now=D.datetime.now(UTC)
    week=upcoming_week(now)
    urls=discover(now,week)
    html={}
    for url in urls:
        try:html[url]=fetch(url)
        except (OSError,ValueError,TimeoutError) as e:
            print("OFFICIAL_NEWS_ARTICLE_UNAVAILABLE",type(e).__name__)
    report=collect(now,html,urls)
    report["officialWeek"] = week
    # Keep each original immutable pregame observation, including a no-claims
    # record. The grader only considers its FIRST Git commit before kickoff.
    folder=ROOT/"outputs/nfl/availability/official-positive-snapshots"
    folder.mkdir(parents=True,exist_ok=True)
    filename=now.strftime("%Y%m%dT%H%M%SZ")+".json"
    dest=folder/filename
    dest.write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    print(json.dumps({"kind":report["kind"],"week":week,
      "officialNewsArticles":report["articlesExamined"],
      "explicitPositiveStatements":len(report["positiveSnippets"]),
      "activePlayersVerifiedForPicks":0,"providerRequests":0,
      "firstGitPending":True,"archive":str(dest.relative_to(ROOT))}))
if __name__=="__main__":main()
