-- Free credits (issue 185): what each model call on the platform's own model cost, so balances and the daily cap can be summed
alter table usage add column platform integer not null default 0;
alter table usage add column credits integer not null default 0;
create index usage_platform_idx on usage (platform, created_at);
create index usage_user_platform_idx on usage (user_id, platform, created_at);
