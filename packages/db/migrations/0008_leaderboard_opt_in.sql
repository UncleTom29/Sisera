ALTER TABLE account_preferences
  ADD COLUMN leaderboard_opt_in boolean NOT NULL DEFAULT false;
CREATE INDEX account_preferences_leaderboard_idx ON account_preferences (subject)
  WHERE leaderboard_opt_in;
