"use strict";
/**
 * NFL source and commercial-rights registry. A website is not an API.
 * "collector_implemented" describes code, never claims a successful run.
 */
const SOURCES=Object.freeze([
 {id:"nflverse",name:"nflverse / nflreadpy",url:"https://nflreadpy.nflverse.com/",
  usage:["weekly box scores","historical play-by-play","kicker attempts","schedule","matchups"],
  integration:"collector_implemented",collector:"scripts/collect-nfl-history.py",commercialDisplay:"not_cleared"},
 {id:"rotowire",name:"RotoWire Defense vs Position",url:"https://www.rotowire.com/football/defense-vs-pos.php",
  usage:["defense versus position","kicker opponent matchup"],integration:"research_reference_only",
  collector:null,commercialDisplay:"not_cleared"},
 {id:"fantasylife",name:"Fantasy Life Utilization",url:"https://www.fantasylife.com/nfl/utilization-report/season-stats",
  usage:["snap share","routes","targets per route","red-zone usage"],integration:"research_reference_only",
  collector:null,commercialDisplay:"not_cleared"},
 {id:"pff",name:"PFF NFL advanced grades and charting",url:"https://www.pff.com/",
  usage:["offensive line and pass pressure","coverage matchups","defensive grades"],
  integration:"research_reference_only_no_licensed_private_API",
  collector:null,commercialDisplay:"not_cleared"},
 {id:"nextgenstats",name:"NFL Next Gen Stats via nflreadpy",url:"https://nextgenstats.nfl.com/",
  usage:["advanced passing","advanced rushing","advanced receiving"],integration:"optional_history_adapter_implemented",
  collector:"scripts/collect-nfl-history.py",commercialDisplay:"not_cleared"},
 {id:"profootballreference",name:"Pro Football Reference via nflreadpy",url:"https://www.pro-football-reference.com/",
  usage:["historical advanced passing","rushing","receiving","defense"],integration:"optional_history_adapter_implemented",
  collector:"scripts/collect-nfl-history.py",commercialDisplay:"not_cleared"},
 {id:"ftncharting",name:"FTN Charting via nflverse",url:"https://nflreadr.nflverse.com/reference/load_ftn_charting.html",
  usage:["blitz and pressure","defensive box","catchability","motion and route context"],
  integration:"research_only_license_sharealike",collector:"scripts/collect-nfl-history.py",
  commercialDisplay:"CC-BY-SA_reuse_needs_specific_review"},
 {id:"weather",name:"NFL game/stadium weather context",url:"https://open-meteo.com/en/docs",
  usage:["wind","forecast precipitation","roof/stadium context","temperature"],
  integration:"historical_schedule_fields_only_no_automated_forecast",collector:null,
  commercialDisplay:"not_cleared"},
 {id:"pfn",name:"Pro Football Network Defense vs Position",url:"https://www.profootballnetwork.com/fantasy-hq/fantasy-points-allowed",
  usage:["opponent allowed by position","kicker DvP"],integration:"research_reference_only",
  collector:null,commercialDisplay:"not_cleared"},
 {id:"prizepickshistory",name:"PrizePicksAPI independent historical board",url:"https://prizepicksapi.com/docs",
  usage:["dated NFL offers","opening lines","line moves","6 AM and 9 AM source boards"],
  integration:"scheduled_key_required",collector:"scripts/collect-nfl-board.cjs",commercialDisplay:"not_cleared"},
 {id:"underdog",name:"Underdog source/settlement rules",url:"https://help.underdogsports.com/en/articles/8974214-pick-em-scoring-nfl",
  usage:["official settlement definitions","line comparison pending authorized feed"],
  integration:"research_reference_only",collector:null,commercialDisplay:"not_cleared"}
]);
function sourceStatus(){return SOURCES.map(x=>({...x,connected:false,livePullVerified:false,commercialRightsVerified:false}));}
module.exports={SOURCES,sourceStatus};
