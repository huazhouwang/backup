-- Look libraries as files (#93): a library keeps what its file has besides looks (description, version, author, licence,
-- groups, materials) as JSON; library_look.data becomes a look of the file without its version
-- ({ name, for, group?, newType?, params?, seed?, script }); rows from before are converted when read.
alter table look_library add column data text not null default '{}';
