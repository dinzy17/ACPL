# ACPL Historical Player Statistics

## Overview

ArcusVerse stores auction players in `data/store.json`. ACPL career statistics live alongside that store under `store.acplHistory` — a separate historical registry keyed by CricHeroes `player_id` (when present) and normalized name.

Source leaderboards are CSV files (exported from CricHeroes), not XLSX. The importer accepts `.csv`, `.xlsx`, and `.xls`.

## Where to place Excel/CSV files

Project-local (preferred):

```text
data/acpl/
  ACPL-1(Men's)/
    *_batting_leaderboard.csv
    *_bowling_leaderboard.csv
    *_fielding_leaderboard.csv
    *_mvp_leaderboard.csv
  ACPL-2(Men's)/
  ...
  ACPL-N(...)/
```

The five current seasons were copied from the machine Downloads folder into `data/acpl`.

## How to import

CLI (idempotent — rebuilds history from files, does not double-count):

```bash
node scripts/import-acpl.mjs
node scripts/import-acpl.mjs --root "C:/path/to/folder-with-ACPL-N-dirs"
```

Or in Admin → **ACPL Stats** → **Re-import from data/acpl**.

Also: `npm run import:acpl`

## Adding a future season (ACPL-6+)

1. Create `data/acpl/ACPL-6(Men's)/` (folder name must contain `ACPL-<number>`).
2. Add the four leaderboard files (batting, bowling, fielding, MVP).
3. Run the importer again.

Season number is parsed from the folder name; no code changes are required.

## Player matching

1. Prefer source `player_id` from batting/bowling/fielding files.
2. Fall back to normalized name: trim, collapse whitespace, case-insensitive.
3. MVP files have no `player_id` — rows attach via normalized name.
4. Names that share a normalized form but different source IDs stay separate and are listed as ambiguous in the import log.

## Duplicate import prevention

Each import **replaces** `store.acplHistory` by re-reading all season folders. Season stats are rebuilt from files, not incremented, so running twice leaves career totals unchanged.

## Column mapping (from actual CSVs)

| File | Key columns |
|------|-------------|
| Batting | `name`, `total_match`, `total_runs`, `4s`, `6s`, … |
| Bowling | `name`, `total_match`, `total_wickets`, … |
| Fielding | `name`, `total_catches`, `total_dismissal`, … |
| MVP | `Player Name`, `Matches`, `Batting`, `Bowling`, `Fielding`, `Total` |

**Total Dismissals** uses fielding `total_dismissal` (not invented).

**Matches** within one season: max across leaderboards (not summed). Across seasons: summed.

## UI

- Hammer desk / LiveBoard: ACPL card on the current player (career totals, or `—` if no match).
- Admin Players: live ACPL preview while typing a name; player **details** page.
- Admin **ACPL Stats**: browse registry, re-import, open full season breakdown.

## Tests

```bash
node --test tests/acpl.test.mjs
```
