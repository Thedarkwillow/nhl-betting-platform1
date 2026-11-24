"use strict";
/**
 * NFL cross-platform market discovery registry, 2026-11-08.
 * Provider documentation != an offer available now.
 * New/unknown labels are quarantined, not discarded or modeled blindly.
 * IMPORTANT: market support is documentary only; autoPickEligible stays false
 * until historical, point-in-time quoted-line and settlement gates pass.
 */
const {SCREEN_LABELS,OBSERVATION}=require("./nfl-user-screen-prop-catalog.cjs");
const SOURCES=Object.freeze({
 ppOfficial:"https://www.prizepicks.com/playbook-article/how-to-play-nfl-dfs-on-prizepicks",
 ppIndependent:"https://prizepicksapi.com/props/nfl",
 ppFantasy:"https://www.prizepicks.com/playbook-article/how-to-play-prizepicks-nfl-fantasy-scoring-system",
 udRules:"https://help.underdogsports.com/en/articles/8974214-pick-em-scoring-nfl"
});
/** id, group, prerequisite level, PP officially documented, PP independent snapshot, Underdog scoring-rule documented */
const specifications=[
 ["passing_yards","passing","boxscore",["Passing Yards"],["Pass Yards"],["Passing Yards"]],
 ["passing_attempts","passing","boxscore",["Pass Attempts"],["Pass Attempts"],["Passing Attempts"]],
 ["passing_completions","passing","boxscore",["Pass Completions"],["Pass Completions"],["Passing Completions"]],
 ["passing_touchdowns","passing","boxscore",["Passing TDs"],["Pass TDs"],["Passing Touchdowns"]],
 ["interceptions_thrown","passing","boxscore",[],[],["Interceptions Thrown"]],
 ["completion_pct","passing","boxscore",[],["Completion Percentage"],["Completion Percentage"]],
 ["longest_completion","passing","play_by_play",["Longest Completion"],["Longest Completion"],["Longest Completion"]],
 ["passing_first_downs","passing","play_by_play",[],[],["Passing First Downs"]],
 ["completions_20_plus","passing","play_by_play",[],[],["20+ Yd Completions"]],
 ["first_completion_yards","passing","play_by_play",[],[],["First Completion (Yards)"]],
 ["first_5_attempt_completions","passing","play_by_play",[],[],["First 5 Attempt Completions"]],
 ["first_attempt_completion","passing","event",[],[],["First Attempt Completions","1st Attempt Completions"]],
 ["first_passing_td_yards","passing","play_by_play",[],[],["First Passing Touchdown (Yards)"]],
 ["first_interception_thrown","passing","event",[],[],["First Interception Thrown"]],
 ["first_sack_taken","passing","event",[],[],["First Sack Taken"]],
 ["first_td_pass","passing","event",[],[],["First TD Pass"]],
 ["rushing_yards","rushing","boxscore",["Rush Yards"],["Rush Yards"],["Rushing Yards"]],
 ["rushing_attempts","rushing","boxscore",["Rush Attempts"],["Rush Attempts"],["Rushing Attempts"]],
 ["rushing_touchdowns","rushing","boxscore",[],[],["Rushing Touchdowns"]],
 ["longest_rush","rushing","play_by_play",["Longest Rush"],["Longest Rush"],["Longest Rush"]],
 ["rushing_yards_first_5_attempts","rushing","play_by_play",["Rush Yards in First 5 Attempts"],[],[]],
 ["first_rush_attempt_yards","rushing","play_by_play",[],[],["First Rush Attempt (Yards)"]],
 ["rushes_10_plus","rushing","play_by_play",[],[],["10+ Yd Rushes"]],
 ["red_zone_rush_attempts","rushing","play_by_play",[],[],["Red Zone Rush Attempts"]],
 ["receiving_yards","receiving","boxscore",["Receiving Yards"],["Receiving Yards"],["Receiving Yards"]],
 ["receptions","receiving","boxscore",["Receptions"],["Receptions"],["Receptions"]],
 ["receiving_targets","receiving","play_by_play",["Targets"],["Rec Targets"],["Targets"]],
 ["receiving_touchdowns","receiving","boxscore",[],[],["Receiving Touchdowns"]],
 ["longest_reception","receiving","play_by_play",["Longest Reception"],["Longest Reception"],["Longest Reception"]],
 ["receiving_yards_first_2","receiving","play_by_play",["Receiving Yards in First 2 Receptions"],[],[]],
 ["first_reception_yards","receiving","play_by_play",[],[],["First Reception (Yards)"]],
 ["receptions_20_plus","receiving","play_by_play",[],[],["20+ Yd Receptions"]],
 ["red_zone_targets","receiving","play_by_play",[],[],["Red Zone Targets"]],
 ["receiving_first_downs","receiving","play_by_play",[],[],["Receiving First Downs"]],
 ["rush_receive_yards","combo","components",[],["Rush+Rec Yds"],["Rush Yards + Receiving Yards"]],
 ["pass_rush_yards","combo","components",[],["Pass+Rush Yds"],["Passing Yards + Rushing Yards"]],
 ["rush_receive_tds","combo","components",["Rush+Rec TD"],[],["Rush + Rec TDs"]],
 ["total_touchdowns","combo","components",[],[],["Total TDs"]],
 ["anytime_td","touchdown","event",[],["Anytime TDs"],["Anytime TD","First/Anytime Touchdown Scorer"]],
 ["first_td_scorer","touchdown","event",[],[],["First TD Scorer"]],
 ["last_td_scorer","touchdown","event",[],[],["Last TD Scorer"]],
 ["team_first_td_scorer","touchdown","event",[],[],["Team First TD Scorer"]],
 ["third_down_conversions","opportunity","play_by_play",[],[],["3rd Down Conversions"]],
 ["first_downs","opportunity","play_by_play",[],[],["First Downs"]],
 ["first_to_x_yards","milestone","event",[],[],["First to X Yards"]],
 ["x_drive_reception","drive","drive_chart",[],[],["X Drive Reception"]],
 ["first_down_of_game","event","event",[],[],["1st First Down"]],
 ["first_team_first_down","event","event",[],[],["1st Team First Down"]],
 ["game_high","leader","comparison",[],[],["Game High"]],
 ["day_high","leader","comparison",[],[],["Day High"]],
 ["most_passing_yards","leader","comparison",[],[],["Most Passing Yards"]],
 ["most_rushing_yards","leader","comparison",[],[],["Most Rushing Yards"]],
 ["most_receiving_yards","leader","comparison",[],[],["Most Receiving Yards"]],
 ["fantasy_score_offense","fantasy","fantasy_rules",["Fantasy Score"],["Fantasy Score"],[]],
 ["fumbles","ball_security","boxscore",[],[],["Total Fumbles"]],
 ["fumbles_lost","ball_security","boxscore",[],[],["Fumbles Lost"]],
 ["broken_tackles","opportunity","tracking",[],[],["Broken Tackles"]],
 ["tackles_solo","defense","boxscore",[],[],["Solo Tackles"]],
 ["tackle_assists","defense","boxscore",[],[],["Assists"]],
 ["tackles_plus_assists","defense","boxscore",["Total Tackles"],["Tackles+Ast"],["Tackles + Assist"]],
 ["sacks","defense","boxscore",["Sacks"],["Sacks"],["Sacks"]],
 ["tackles_for_loss","defense","boxscore",["Tackle for Loss"],[],["Tackles for Loss"]],
 ["defensive_interceptions","defense","boxscore",["Interceptions"],[],[]],
 ["fg_made","kicking","special_teams",["FG Made"],["FG Made"],["Field Goals Made","FG Made"]],
 ["fg_attempts","kicking","special_teams",["FG Attempts"],[],["FG Attempts"]],
 ["fg_yards","kicking","play_by_play",["FG Yards"],[],["Field Goal Yards"]],
 ["fg_longest_made","kicking","play_by_play",[],[],["Longest Field Goal Made"]],
 ["fg_shortest_made","kicking","play_by_play",[],[],["Shortest Field Goal Made"]],
 ["kicking_points","kicking","special_teams",["Kicking Points"],["Kicking Points"],["Kicking Points"]],
 ["pat_attempts","kicking","special_teams",["PAT Attempts"],[],["Extra Point Attempts"]],
 ["pat_made","kicking","special_teams",[],[],["Extra Points Made"]],
 ["kicker_fantasy_score","fantasy","fantasy_rules",["Kicker Fantasy Score"],[],[]],
 ["first_fg_made","kicking","event",[],[],["First Field Goal Made"]],
 ["first_xp_made","kicking","event",[],[],["First Extra Point Made"]],
 ["fg_made_quarter","kicking","period",[],[],["1Q Field Goals Made","2Q Field Goals Made","3Q Field Goals Made","4Q Field Goals Made"]],
 ["fg_xp_each_quarter","kicking","period",[],[],["X+ FG or XP Made in Each Quarter"]],
 ["fg_on_first_drive","drive","drive_chart",[],[],["First Drive Field Goals Made"]],
 ["fg_longest_game","kicking","comparison",[],[],["Longest FG of Game"]],
 ["fg_shortest_game","kicking","comparison",[],[],["Shortest FG of Game"]],
 ["fg_longest_combo","combo","comparison",["Longest FG Made Yards (Combo)"],[],[]],
 ["fg_shortest_combo","combo","comparison",["Shortest FG Made Yards (Combo)"],[],[]],
 ["doinks","kicking","tracking",[],[],["Doinks"]],
 ["successful_onside_kicks","kicking","play_by_play",[],[],["Successful Onside Kicks"]],
 ["kickoff_touchbacks","special_teams","special_teams",[],[],["Kickoff Touchbacks"]],
 ["punt_attempts","punting","special_teams",[],[],["Punts"]],
 ["punt_inside_20","punting","special_teams",["Punts Inside the 20"],[],["Punts Inside 20"]],
 ["punt_gross_yards","punting","special_teams",["Gross Punt Yards"],[],["Total Punt Yardage"]],
 ["punt_50_plus","punting","special_teams",["50+ Yard Punts"],[],[]],
 ["punting_average","punting","special_teams",[],[],["Avg Yards Per Punt"]],
 ["longest_gross_punt","punting","play_by_play",[],[],["Longest Gross Punt (Yards)"]],
 ["first_gross_punt","punting","play_by_play",[],[],["First Gross Punt (Yards)"]],
 ["first_drive_punts","punting","drive_chart",[],[],["First Drive Punts"]],
 ["most_punts","punting","comparison",[],[],["Most Punts"]],
 ["punting_touchbacks","punting","special_teams",[],[],["Punting Touchbacks"]],
 ["return_yards_kick_punt","returns","special_teams",[],[],["Kick + Punt Return Yards"]],
 ["punt_return_yards","returns","special_teams",[],[],["Punt Return Yards"]],
 ["longest_punt_return","returns","play_by_play",[],[],["Longest Punt Return"]],
 ["first_rush_10_game","event","event",[],[],["1st 10+ Yard Rush of Game"]],
 ["first_reception_20_game","event","event",[],[],["1st 20+ Yard Reception of Game"]],
 ["first_to_x_completions","event","event",[],[],["1st to X Completions"]],
 ["yards_each_quarter_half","period","period",[],[],["Yards Gained in Each Quarter / Half"]],
 ["quarters_5_plus_rush","period","period",[],["Quarters with 5+ Rush Yards"],[]],
 ["halves_25_plus_rush","period","period",[],["Halves with 25+ Rush Yards"],[]],
 ["halves_25_plus_receiving","period","period",[],["Halves with 25+ Receiving Yards"],[]],
 ["halves_100_plus_passing","period","period",[],["Halves with 100+ Pass Yards"],[]],
 ["anytime_tds_combo","combo","comparison",[],["Anytime TDs (Combo)"],[]],
 ["two_player_stat_combo","combo","comparison",["Two QB Yards Combo"],[],[]],
 ["first_drive_longest_completion","drive","drive_chart",[],[],["First Drive Longest Completion"]],
 ["drive_outcome","drive","drive_chart",[],[],["Drive markets"]],
 ["season_long","futures","futures",[],[],["NFL Futures"]],
 ["regular_season_games_started","futures","futures",[],[],["Regular Season Games Started"]],
 ["playoff_games_started","futures","futures",[],[],["Playoff Games Started"]],
 ["team_win","team","team_market",["Game Winner"],[],[]],
 ["team_spread","team","team_market",["Spread"],[],[]],
 ["team_total_points","team","team_market",["Total"],[],[]],

// Additional distinct market types observed in 2026-11-08 owner app menu.
// Source labels are deliberately NOT inserted into the independent-provider
// or official-doc arrays below. SCREEN_LABELS carries its own provenance.
 ["pass_rush_rec_tds","combo","components",[],[],[]],
 ["passing_yards_combo","combo","components",[],[],[]],
 ["fg_made_combo","combo","components",[],[],[]],
 ["fg_yards_combo","combo","components",[],[],[]],
 ["quarters_1_plus_reception","period","period",[],[],[]],
 ["sacks_taken","passing","play_by_play",[],[],[]],
 ["receiving_yards_combo","combo","components",[],[],[]],
 ["rushing_yards_combo","combo","components",[],[],[]],
 ["quarters_25_plus_pass_yards","period","period",[],[],[]],
 ["punt_attempts_combo","combo","components",[],[],[]],
 ["rush_yards_per_carry","rushing","components",[],[],[]],
 ["punt_touchbacks_combo","combo","components",[],[],[]],
 ["passer_rating","passing","components",[],[],[]],
 ["completions_first_10_pass_attempts","passing","play_by_play",[],[],[]],
 ["quarters_5_plus_receiving_yards","period","period",[],[],[]],
 ["quarters_10_plus_receiving_yards","period","period",[],[],[]],
 ["halves_50_plus_rush","period","period",[],[],[]]
];
const TYPE=new Set(["boxscore","play_by_play","components","event","drive_chart",
 "comparison","fantasy_rules","tracking","special_teams","period","futures","team_market"]);
const GROUPS=new Set(["passing","rushing","receiving","combo","touchdown","opportunity",
 "milestone","drive","event","leader","fantasy","ball_security","defense","kicking",
 "special_teams","punting","returns","period","futures","team"]);
function normalizeLabel(s){return String(s||"").trim().toLowerCase()
 .replace(/[‐‑‒–—]/g,"-").replace(/\b(yds|yd)\b/g,"yards")
 .replace(/\brec\b/g,"receiving").replace(/\brush\b/g,"rushing")
 .replace(/\bpass\b/g,"passing").replace(/\bast\b/g,"assists")
 .replace(/\bpat\b/g,"extra point").replace(/\bfg\b/g,"field goal")
 .replace(/\btds\b/g,"touchdowns").replace(/\btd\b/g,"touchdown")
 .replace(/[+&]/g," plus ").replace(/[^a-z0-9]/g,"")
}
const MARKET_REGISTRY=Object.freeze(specifications.map(([id,group,requiredData,prizePicksOfficial,
 prizePicksObservedIndependent,underdogOfficialRules])=>{
 if(!GROUPS.has(group)||!TYPE.has(requiredData))throw Error("Malformed static NFL market registry: "+id);
 const videoLabels=SCREEN_LABELS.filter(x=>x.marketId===id).map(x=>x.label);
 return Object.freeze({id,group,requiredData,
  documentedByPrizePicks:prizePicksOfficial.length>0,
  observedByIndependentPrizePicksFeed:prizePicksObservedIndependent.length>0,
  describedByUnderdogOfficialRules:underdogOfficialRules.length>0,
  observedInOwnerAppMenu:videoLabels.length>0,
  ownerAppRecordingProvenance:videoLabels.length?OBSERVATION:null,
  appMenuLabelDoesNotVerifyLoadedOffers:true,
  labels:Object.freeze({prizepicks:Object.freeze([...new Set([...prizePicksOfficial,...prizePicksObservedIndependent,...videoLabels])]),
   underdog:Object.freeze(underdogOfficialRules)}),
  registeredButNotLiveOffer:true,playerProjectionModelValidated:false,
  confirmedPlatformSettlementRule:false,autoPickEligible:false
 });
}));
function classifyPeriod(period){
 const p=String(period||"full_game").toLowerCase().replace(/[\s_-]+/g,"");
 if(["full","fullgame","game","fg"].includes(p))return "full_game";
 if(["1q","q1","firstquarter","1stquarter","nfl1q","quarter1"].includes(p))return "quarter_1";
 if(["2q","q2","secondquarter","2ndquarter","nfl2q","quarter2"].includes(p))return "quarter_2";
 if(["3q","q3","thirdquarter","3rdquarter","nfl3q","quarter3"].includes(p))return "quarter_3";
 if(["4q","q4","fourthquarter","4thquarter","nfl4q","quarter4"].includes(p))return "quarter_4";
 if(["1h","h1","firsthalf","1sthalf","nfl1h","half1"].includes(p))return "half_1";
 if(["2h","h2","secondhalf","2ndhalf","nfl2h","half2"].includes(p))return "half_2";
 if(["live"].includes(p))return "live";
 if(["firstdrive"].includes(p))return "first_drive";
 return null;
}
// Explicit period labels are distinct from the full-game market.
function labelPeriod(raw){
 const p="(?:[1-4]Q|Q[1-4]|[12]H|H[12]|(?:1st|2nd|3rd|4th|First|Second|Third|Fourth)\\s+(?:Quarter|Half))";
 const s=String(raw||"").trim(),a=new RegExp("^("+p+")\\s+(.+)$","i").exec(s),b=new RegExp("^(.+?)\\s*\\(("+p+")\\)$","i").exec(s),z=a||b;
 return z?{label:a?z[2]:z[1],period:classifyPeriod(a?z[1]:z[2])}:null;
}
function classifyMarket(platform,rawLabel,{period=null,observedAt=null,
 sourceAuthenticity="unverified",participants=1}={}){
 if(!["prizepicks","underdog"].includes(platform))throw Error("Unknown NFL platform");
 if(!Number.isInteger(participants)||participants<1)return {status:"quarantine",reason:"invalid_participant_count"};
 const tag=labelPeriod(rawLabel),explicit=period==null?null:classifyPeriod(period);
 if(tag&&(!tag.period||period!=null&&explicit!==tag.period))return {status:"quarantine",reason:"conflicting_or_unknown_period_label",platform};
 const find=label=>MARKET_REGISTRY.filter(x=>x.labels[platform].some(y=>normalizeLabel(y)===normalizeLabel(label)));
 let matches=find(rawLabel);
 if(matches.length===0&&tag&&platform==="prizepicks")matches=find(tag.label);
 const normalizedPeriod=tag?.period??classifyPeriod(period);
 if(!normalizedPeriod)return {status:"quarantine",reason:"unknown_period",
  rawLabel:String(rawLabel||"").slice(0,120),platform};
 if(matches.length!==1)return {status:"quarantine",reason:matches.length?
  "ambiguous_label_requires_manual_resolution":"undocumented_or_new_market",
  rawLabel:String(rawLabel||"").slice(0,120),platform,period:normalizedPeriod};
 const market=matches[0];
 return {status:"recognized_research_only",platform,marketId:market.id,
  group:market.group,requiredData:market.requiredData,period:normalizedPeriod,
  sourceAuthenticity,observedAt,participants,
  comboValidationNeeded:participants>1||market.group==="combo"||market.requiredData==="components",
  periodSpecificValidationNeeded:normalizedPeriod!=="full_game"||market.requiredData==="period",
  menuFilterSeenButOfferNotVerified:market.observedInOwnerAppMenu,
  platformOfferAuthenticated:false,claimedSourceAuthenticity:sourceAuthenticity,
  historicalResultsValidated:false,autoPickEligible:false,
  caution:"Catalog recognition does not establish availability, a matched opponent/game, scoring rules, selection side, model calibration, or a playable lineup."};
}
function auditBoardLabels(platform,rows){
 if(!Array.isArray(rows))throw Error("Actual archived provider rows required");
 const counts={recognized:0,quarantined:0,unknownMarkets:{}};
 for(const r of rows){
  const x=classifyMarket(platform,r?.market??r?.statType,{period:r?.period,
    observedAt:r?.capturedAt,participants:r?.participants??1});
  if(x.status==="recognized_research_only")counts.recognized++;
  else {counts.quarantined++;const name=String(r?.market??r?.statType??"unknown").slice(0,100);
   counts.unknownMarkets[name]=(counts.unknownMarkets[name]||0)+1;}
 }
 return {kind:"nfl_platform_market_discovery_audit_v1",platform,...counts,
  sourceOffersIndependentlyAuthenticated:false,
  unrecognizedDataNeverAutoPicked:true};
}
module.exports={SOURCES,SCREEN_LABELS,MARKET_REGISTRY,normalizeLabel,classifyPeriod,classifyMarket,auditBoardLabels};
