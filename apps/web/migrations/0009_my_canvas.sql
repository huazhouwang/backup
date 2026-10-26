-- The user's own canvas modules (issue 171): modules they add for themselves, run in the sample-room page of every design they
-- open, with the data each keeps, as JSON ({ modules, data }, packages/core/src/capabilities/canvas.ts)
alter table user_pref add column canvas text;
