"""Loads a database export into an in-memory SQLite and checks its foreign keys.

Run before importing a copy into D1, which only says the import failed: this names the
tables whose rows refer to rows that are not there. Prints table names and counts only,
never the rows. Usage: python3 check-dump.py <dump.sql>
"""

import sqlite3
import sys

db = sqlite3.connect(':memory:', isolation_level=None)
with open(sys.argv[1], encoding='utf-8') as dump:
    db.executescript(dump.read())

broken = db.execute(
    'select "table", parent, count(*) from pragma_foreign_key_check group by 1, 2 order by 1, 2'
).fetchall()
for table, parent, count in broken:
    print(f'{table}: {count} rows refer to missing {parent} rows')
sys.exit(1 if broken else 0)
