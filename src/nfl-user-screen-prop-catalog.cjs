"use strict";
/**
 * Labels visible in the owner-provided PrizePicks Android recording on 2026-11-08.
 *
 * These are HORIZONTAL MENU/FILTER LABELS, not a complete confirmed board
 * or proof any market had fresh loaded offers at the instant selected.
 * No underlying screenshot/video, balance, personal information or wager
 * is stored. Original app market names are preserved exactly as seen.
 *
 * INT is intentionally ambiguous (QB interceptions thrown vs defense picks)
 * and MUST remain quarantined until athlete/position + official settlement
 * identifies the intended statistic.
 */
const OBSERVATION="owner_prizepicks_android_video_2026-11-08";
const SCREEN_LABELS=Object.freeze([
 ["Pass Yards","passing_yards"],
 ["Receiving Yards","receiving_yards"],
 ["Rush Yards","rushing_yards"],
 ["Anytime TDs","anytime_td"],
 ["Pass TDs","passing_touchdowns"],
 ["Fantasy Score","fantasy_score_offense"],
 ["Receptions","receptions"],
 ["Rush TDs","rushing_touchdowns"],
 ["Pass+Rush+Rec TDs","pass_rush_rec_tds"],
 ["FG Made","fg_made"],
 ["Rec Targets","receiving_targets"],
 ["Sacks","sacks"],
 ["Pass Completions","passing_completions"],
 ["Anytime TDs (Combo)","anytime_tds_combo"],
 ["Rush+Rec Yds","rush_receive_yards"],
 ["INT",null],
 ["Pass+Rush Yds","pass_rush_yards"],
 ["Pass Attempts","passing_attempts"],
 ["Pass Yards (Combo)","passing_yards_combo"],
 ["Rush Attempts","rushing_attempts"],
 ["FG Made (Combo)","fg_made_combo"],
 ["Kicking Points","kicking_points"],
 ["Shortest FG Made Yds (Combo)","fg_shortest_combo"],
 ["Punts","punt_attempts"],
 ["Quarters with 5+ Rush Yards","quarters_5_plus_rush"],
 ["Longest FG Made Yds (Combo)","fg_longest_combo"],
 ["Field Goal Yards (Combo)","fg_yards_combo"],
 ["Quarters with 1+ Reception","quarters_1_plus_reception"],
 ["Longest Completion","longest_completion"],
 ["Sacks Taken","sacks_taken"],
 ["Receiving Yards (Combo)","receiving_yards_combo"],
 ["Longest Rush","longest_rush"],
 ["Rush Yards (Combo)","rushing_yards_combo"],
 ["Quarters with 25+ Pass Yards","quarters_25_plus_pass_yards"],
 ["Completion Percentage","completion_pct"],
 ["Tackles+Ast","tackles_plus_assists"],
 ["Punts Inside 20","punt_inside_20"],
 ["Longest Reception","longest_reception"],
 ["Punts (Combo)","punt_attempts_combo"],
 ["Rush Yards Per Carry","rush_yards_per_carry"],
 ["Punt Touchbacks (Combo)","punt_touchbacks_combo"],
 ["Passer Rating","passer_rating"],
 ["Rush Yards in First 5 Attempts","rushing_yards_first_5_attempts"],
 ["Completions in First 10 Pass Attempts","completions_first_10_pass_attempts"],
 ["Quarters with 5+ Receiving Yards","quarters_5_plus_receiving_yards"],
 ["Halves with 25+ Rush Yards","halves_25_plus_rush"],
 ["Halves with 100+ Pass Yards","halves_100_plus_passing"],
 ["Quarters with 10+ Receiving Yards","quarters_10_plus_receiving_yards"],
 ["Halves with 25+ Receiving Yards","halves_25_plus_receiving"],
 ["Halves with 50+ Rush Yards","halves_50_plus_rush"]
].map(([label,marketId])=>Object.freeze({
 label,marketId,source:OBSERVATION,observationType:"menu_filter_label_only",
 officialSettlementsVerified:false,underlyingOffersAuthenticated:false,
 autoPickEligible:false
})));
module.exports={OBSERVATION,SCREEN_LABELS};
