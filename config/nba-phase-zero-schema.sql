-- ISOLATED NBA RESEARCH SCHEMA: documentation/migration draft only.
-- Never auto-run against NHL, NFL or MLB. All raw rows remain private.
-- Timestamps are UTC ISO-8601 strings; the ingest service validates chronology.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS nba_games (
 game_id INTEGER PRIMARY KEY,
 season TEXT NOT NULL,
 home_team TEXT NOT NULL,
 away_team TEXT NOT NULL,
 scheduled_start_at TEXT NOT NULL,
 official_status TEXT NOT NULL DEFAULT 'scheduled',
 official_final_at TEXT,
 source_observed_at TEXT NOT NULL,
 first_git_committed_at TEXT NOT NULL,
 CHECK (home_team <> away_team)
);
CREATE TABLE IF NOT EXISTS nba_players (
 player_id INTEGER PRIMARY KEY,
 full_name TEXT NOT NULL,
 team TEXT NOT NULL,
 source_observed_at TEXT NOT NULL,
 first_git_committed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nba_player_game_boxes (
 game_id INTEGER NOT NULL REFERENCES nba_games(game_id),
 player_id INTEGER NOT NULL REFERENCES nba_players(player_id),
 appeared INTEGER NOT NULL CHECK (appeared IN (0,1)),
 official_dnp_verified INTEGER NOT NULL DEFAULT 0 CHECK (official_dnp_verified IN (0,1)),
 started INTEGER CHECK (started IS NULL OR started IN (0,1)),
 minutes REAL CHECK (minutes IS NULL OR (minutes > 0 AND minutes <= 70)),
 points INTEGER CHECK (points IS NULL OR points >= 0),
 rebounds INTEGER CHECK (rebounds IS NULL OR rebounds >= 0),
 assists INTEGER CHECK (assists IS NULL OR assists >= 0),
 three_pointers_made INTEGER CHECK (three_pointers_made IS NULL OR three_pointers_made >= 0),
 steals INTEGER CHECK (steals IS NULL OR steals >= 0),
 blocks INTEGER CHECK (blocks IS NULL OR blocks >= 0),
 turnovers INTEGER CHECK (turnovers IS NULL OR turnovers >= 0),
 official_final_at TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 source_revision TEXT NOT NULL,
 PRIMARY KEY (game_id,player_id,source_revision),
 CHECK (appeared=1 OR (minutes IS NULL AND points IS NULL AND rebounds IS NULL
                         AND assists IS NULL AND official_dnp_verified=1))
);
CREATE TABLE IF NOT EXISTS nba_injury_observations (
 observation_id TEXT PRIMARY KEY,
 game_id INTEGER NOT NULL,
 player_id INTEGER NOT NULL,
 status TEXT NOT NULL,
 official_document_url TEXT NOT NULL,
 report_published_at TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 first_git_committed_at TEXT NOT NULL,
 normalized_source_hash TEXT NOT NULL,
 CHECK (length(normalized_source_hash) >= 12)
);
CREATE TABLE IF NOT EXISTS nba_independent_offers (
 observation_id TEXT PRIMARY KEY,
 platform TEXT NOT NULL CHECK (platform IN ('PrizePicks','Underdog')),
 provider_offer_id TEXT NOT NULL,
 game_id INTEGER NOT NULL,
 player_id INTEGER NOT NULL,
 market TEXT NOT NULL,
 period TEXT NOT NULL,
 tier TEXT NOT NULL CHECK (tier IN ('Standard','Goblin','Demon')),
 line REAL NOT NULL CHECK (line >= 0),
 offered_side TEXT NOT NULL CHECK (offered_side IN ('Higher','Lower')),
 source_observed_at TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 first_git_committed_at TEXT,
 market_scoring_fingerprint TEXT NOT NULL,
 original_app_offer_authenticated INTEGER NOT NULL DEFAULT 0
   CHECK (original_app_offer_authenticated IN (0,1)),
 UNIQUE(platform,provider_offer_id,source_observed_at)
);
CREATE TABLE IF NOT EXISTS nba_frozen_trials (
 trial_id TEXT PRIMARY KEY,
 offer_observation_id TEXT NOT NULL REFERENCES nba_independent_offers(observation_id),
 original_direction TEXT NOT NULL CHECK (original_direction IN ('Higher','Lower','Abstain')),
 model_version TEXT NOT NULL,
 feature_cutoff_at TEXT NOT NULL,
 first_git_committed_at TEXT NOT NULL,
 trial_type TEXT NOT NULL CHECK(trial_type IN ('shadow','approved')),
 prediction_calibrated INTEGER NOT NULL DEFAULT 0 CHECK(prediction_calibrated IN (0,1)),
 selection_betting_eligible INTEGER NOT NULL DEFAULT 0 CHECK(selection_betting_eligible IN (0,1))
);
CREATE INDEX IF NOT EXISTS nba_box_game_idx ON nba_player_game_boxes(game_id,player_id);
CREATE INDEX IF NOT EXISTS nba_box_player_idx ON nba_player_game_boxes(player_id,game_id);
CREATE INDEX IF NOT EXISTS nba_offer_game_idx ON nba_independent_offers(game_id,player_id,market,period,source_observed_at);
CREATE INDEX IF NOT EXISTS nba_injury_game_idx ON nba_injury_observations(game_id,player_id,captured_at);
-- Source integrity guards must run BEFORE any row insert. This SQL alone
-- neither verifies league licenses nor authorizes live picks or wagers.
