#!/usr/bin/env bash
# Compares two remote D1 databases table by table (row counts), after copying one into the
# other. Prints both counts; exits 1 if any table differs. Run from apps/api (wrangler).
# Usage: compare-databases.sh <from> <to> [--warn]  (--warn: report, but exit 0)
set -euo pipefail
from=$1
to=$2
mode=${3:-}

tables() {
  pnpm exec wrangler d1 execute "$1" --remote --json --command \
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' order by name" |
    jq -r '.[0].results[].name'
}

counts() {
  local db=$1 query=''
  for table in $(tables "$from"); do
    query+="${query:+ union all }select '$table' as name, count(*) as n from \"$table\""
  done
  pnpm exec wrangler d1 execute "$db" --remote --json --command "$query" |
    jq -r '.[0].results[] | "\(.name) \(.n)"'
}

report=$(mktemp)
echo "table $from $to"
join -a 1 -e missing -o '0,1.2,2.2' <(counts "$from" | sort) <(counts "$to" | sort) | tee "$report"
if awk '$2 != $3 { bad = 1 } END { exit !bad }' "$report"; then
  if [ "$mode" = --warn ]; then
    echo "::warning::$from has rows $to lacks (written while the app switched over); see the table above."
    exit 0
  fi
  echo "::error::The copy of $from in $to differs; see the table above."
  exit 1
fi
echo "Every table in $to matches $from."
