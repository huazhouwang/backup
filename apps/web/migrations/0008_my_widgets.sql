-- The user's own widgets (#163): widgets installed "for me", drawn in every design they open, as JSON
-- ({ widgets, copies }, packages/core/src/widgets/mine.ts)
alter table user_pref add column widgets text;
