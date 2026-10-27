"""Puts a database export's rows in an order D1 can import, referenced tables first.

An export lists rows table by table in name order (account before the user it belongs
to), and D1's import checks each reference as the row goes in, deferred or not. This
writes the same statements with every table's rows after the rows of the tables it
refers to. It first loads the export into an in-memory SQLite and stops if any row
refers to one that is not there, naming the tables and counts, never the rows.

Usage: python3 order-rows.py <schema.sql> <rows.sql> <ordered-rows.sql>
"""

import re
import sqlite3
import sys

schema_path, rows_path, out_path = sys.argv[1:]

db = sqlite3.connect(':memory:', isolation_level=None)
for path in (schema_path, rows_path):
    with open(path, encoding='utf-8') as dump:
        db.executescript(dump.read())

broken = db.execute(
    'select "table", parent, count(*) from pragma_foreign_key_check group by 1, 2 order by 1, 2'
).fetchall()
for table, parent, count in broken:
    print(f'{table}: {count} rows refer to missing {parent} rows')
if broken:
    sys.exit(1)

tables = [name for (name,) in db.execute("select name from sqlite_master where type = 'table'")]
parents = {
    table: {p for (p,) in db.execute('select "table" from pragma_foreign_key_list(?)', (table,))}
    - {table}
    for table in tables
}
order = []
while len(order) < len(tables):
    ready = sorted(t for t in tables if t not in order and parents[t] <= set(order))
    if not ready:
        sys.exit('The tables refer to each other in a circle')
    order += ready
# Last: it only records the tables' counters, which the other rows don't need.
if 'sqlite_sequence' in order:
    order.remove('sqlite_sequence')
    order.append('sqlite_sequence')

# Statements, not lines: a text value can hold a line break.
statements = {table: [] for table in order}
head = []
pending = ''
with open(rows_path, encoding='utf-8') as rows:
    for line in rows:
        pending += line
        if not sqlite3.complete_statement(pending):
            continue
        match = re.match(r'\s*INSERT INTO "([^"]+)"', pending)
        if match:
            statements[match.group(1)].append(pending)
        else:
            head.append(pending)
        pending = ''
if pending.strip():
    sys.exit('The rows file ends in the middle of a statement')

with open(out_path, 'w', encoding='utf-8') as out:
    out.writelines(head)
    for table in order:
        out.writelines(statements[table])
