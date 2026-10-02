import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { uid } from "./store.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const SUM_KEYS = [
  "matches",
  "innings",
  "runs",
  "ballsFaced",
  "notOuts",
  "fours",
  "sixes",
  "fifties",
  "hundreds",
  "wickets",
  "ballsBowled",
  "bowlingRuns",
  "maidens",
  "dotBalls",
  "catches",
  "caughtBehind",
  "runOuts",
  "assistRunOuts",
  "stumpings",
  "caughtAndBowl",
  "totalCatches",
  "dismissals",
  "mvpBatting",
  "mvpBowling",
  "mvpFielding",
  "mvpTotal"
];

const MAX_KEYS = ["highestRun", "highestWicket"];

/** Normalize a player name for exact matching across seasons/files. */
export function normalizePlayerName(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-zA-Z0-9\s'.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Prefer a clean Title Case display name. */
export function displayPlayerName(name) {
  const cleaned = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function preferDisplayName(current, incoming) {
  const a = String(current || "").trim();
  const b = String(incoming || "").trim();
  if (!a) return displayPlayerName(b);
  if (!b) return displayPlayerName(a);
  if (b.length > a.length + 2) return displayPlayerName(b);
  return displayPlayerName(a);
}

function num(v, fallback = 0) {
  if (v == null || v === "") return fallback;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== "") return row[k];
    const found = Object.keys(row).find((h) => h.toLowerCase() === String(k).toLowerCase());
    if (found != null && row[found] !== "" && row[found] != null) return row[found];
  }
  return undefined;
}

function fileKind(filename) {
  const f = filename.toLowerCase();
  if (f.includes("batting") || f.includes("batsman")) return "batting";
  if (f.includes("bowling") || f.includes("bowler")) return "bowling";
  if (f.includes("fielding") || f.includes("fielder")) return "fielding";
  if (f.includes("mvp")) return "mvp";
  return "unknown";
}

export function parseSeasonFolderName(folderName) {
  const m = String(folderName).match(/ACPL[-\s]?(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return { seasonNumber: n, seasonKey: `ACPL-${n}`, label: `ACPL-${n}` };
}

function emptySeasonStats(meta) {
  const z = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const k of MAX_KEYS) z[k] = 0;
  return {
    seasonNumber: meta.seasonNumber,
    seasonKey: meta.seasonKey,
    label: meta.label,
    teamName: "",
    role: "",
    battingHand: "",
    bowlingStyle: "",
    sourceIds: [],
    sources: {},
    ...z
  };
}

function mapBatting(row) {
  return {
    matches: num(pick(row, "total_match", "Matches", "matches")),
    innings: num(pick(row, "innings")),
    runs: num(pick(row, "total_runs", "Runs", "runs")),
    highestRun: num(pick(row, "highest_run")),
    notOuts: num(pick(row, "not_out")),
    ballsFaced: num(pick(row, "ball_faced")),
    fours: num(pick(row, "4s")),
    sixes: num(pick(row, "6s")),
    fifties: num(pick(row, "50s")),
    hundreds: num(pick(row, "100s")),
    battingHand: String(pick(row, "batting_hand") || ""),
    teamName: String(pick(row, "team_name", "Team Name") || ""),
    sourceId: String(pick(row, "player_id") || ""),
    average: num(pick(row, "average"), null),
    strikeRate: num(pick(row, "strike_rate"), null)
  };
}

function mapBowling(row) {
  return {
    matches: num(pick(row, "total_match", "Matches", "matches")),
    innings: num(pick(row, "innings")),
    wickets: num(pick(row, "total_wickets", "Wickets", "wickets")),
    ballsBowled: num(pick(row, "balls")),
    highestWicket: num(pick(row, "highest_wicket")),
    maidens: num(pick(row, "maidens")),
    bowlingRuns: num(pick(row, "runs")),
    dotBalls: num(pick(row, "dot_balls")),
    bowlingStyle: String(pick(row, "bowling_style", "Bowling Style") || ""),
    teamName: String(pick(row, "team_name", "Team Name") || ""),
    sourceId: String(pick(row, "player_id") || ""),
    economy: num(pick(row, "economy"), null),
    bowlingSr: num(pick(row, "SR"), null),
    bowlingAvg: num(pick(row, "avg"), null),
    overs: String(pick(row, "overs") || "")
  };
}

function mapFielding(row) {
  return {
    matches: num(pick(row, "total_match", "Matches", "matches")),
    catches: num(pick(row, "catches")),
    caughtBehind: num(pick(row, "caught_behind")),
    runOuts: num(pick(row, "run_outs")),
    assistRunOuts: num(pick(row, "assist_run_outs")),
    stumpings: num(pick(row, "stumpings")),
    caughtAndBowl: num(pick(row, "caught_and_bowl")),
    totalCatches: num(pick(row, "total_catches")),
    dismissals: num(pick(row, "total_dismissal", "total_dismissals", "Dismissals")),
    teamName: String(pick(row, "team_name", "Team Name") || ""),
    sourceId: String(pick(row, "player_id") || "")
  };
}

function mapMvp(row) {
  return {
    matches: num(pick(row, "Matches", "matches", "total_match")),
    mvpBatting: num(pick(row, "Batting")),
    mvpBowling: num(pick(row, "Bowling")),
    mvpFielding: num(pick(row, "Fielding")),
    mvpTotal: num(pick(row, "Total")),
    role: String(pick(row, "Player Role") || ""),
    battingHand: String(pick(row, "Batting Hand") || ""),
    bowlingStyle: String(pick(row, "Bowling Style") || ""),
    teamName: String(pick(row, "Team Name", "team_name") || ""),
    sourceId: ""
  };
}

function readSheet(filePath, log) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  log.columns.push({ file: path.basename(filePath), headers });
  return { rows, headers, hash: crypto.createHash("sha256").update(buf).digest("hex") };
}

function mergeMappedIntoSeason(season, mapped, kind) {
  season.sources[kind] = true;
  if (mapped.sourceId) {
    if (!season.sourceIds.includes(mapped.sourceId)) season.sourceIds.push(mapped.sourceId);
  }
  if (mapped.teamName) season.teamName = mapped.teamName;
  if (mapped.role) season.role = mapped.role;
  if (mapped.battingHand) season.battingHand = mapped.battingHand;
  if (mapped.bowlingStyle) season.bowlingStyle = mapped.bowlingStyle;

  // Within a season, matches appear on every leaderboard — take the max, never sum file×file.
  if (mapped.matches != null) season.matches = Math.max(season.matches || 0, mapped.matches || 0);

  if (kind === "batting") {
    if (mapped.innings != null) season.innings = mapped.innings;
    for (const k of ["runs", "ballsFaced", "notOuts", "fours", "sixes", "fifties", "hundreds"]) {
      if (mapped[k] != null) season[k] = Number(mapped[k] || 0);
    }
    if (mapped.highestRun != null) season.highestRun = Math.max(season.highestRun || 0, mapped.highestRun);
  } else if (kind === "bowling") {
    if (mapped.innings != null) season.bowlingInnings = mapped.innings;
    for (const k of ["wickets", "ballsBowled", "bowlingRuns", "maidens", "dotBalls"]) {
      if (mapped[k] != null) season[k] = Number(mapped[k] || 0);
    }
    if (mapped.highestWicket != null) season.highestWicket = Math.max(season.highestWicket || 0, mapped.highestWicket);
  } else if (kind === "fielding") {
    for (const k of ["catches", "caughtBehind", "runOuts", "assistRunOuts", "stumpings", "caughtAndBowl", "totalCatches", "dismissals"]) {
      if (mapped[k] != null) season[k] = Number(mapped[k] || 0);
    }
    // Prefer total_catches as the public "catches" figure when present
    if (mapped.totalCatches != null) season.catches = mapped.totalCatches;
  } else if (kind === "mvp") {
    for (const k of ["mvpBatting", "mvpBowling", "mvpFielding", "mvpTotal"]) {
      if (mapped[k] != null) season[k] = Number(mapped[k] || 0);
    }
  }
}

function aggregateCareer(seasonsMap) {
  const career = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const k of MAX_KEYS) career[k] = 0;
  for (const s of Object.values(seasonsMap)) {
    for (const k of SUM_KEYS) career[k] += Number(s[k] || 0);
    for (const k of MAX_KEYS) career[k] = Math.max(career[k], Number(s[k] || 0));
  }
  // Display catches as total catches when we tracked them
  if (career.totalCatches > career.catches) career.catches = career.totalCatches;
  return career;
}

/**
 * Import ACPL leaderboard CSVs/XLSX from a root folder containing ACPL-N(*) season dirs.
 * Idempotent: rebuilds historical registry from source files each run.
 */
export function importAcplHistory(rootDir, { uidFn = uid } = {}) {
  const log = {
    totalSeasonsProcessed: 0,
    totalFilesProcessed: 0,
    uniquePlayers: 0,
    playersBySeasonCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    duplicateAmbiguousNames: [],
    importErrors: [],
    missingFiles: [],
    emptyPlayerNames: 0,
    invalidNumbers: 0,
    unexpectedColumns: [],
    columns: [],
    files: []
  };

  if (!rootDir || !fs.existsSync(rootDir)) {
    throw new Error(`ACPL source folder not found: ${rootDir}`);
  }

  const seasonDirs = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /ACPL[-\s]?\d+/i.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => {
      const na = parseSeasonFolderName(a)?.seasonNumber || 0;
      const nb = parseSeasonFolderName(b)?.seasonNumber || 0;
      return na - nb;
    });

  if (!seasonDirs.length) {
    throw new Error(`No ACPL-* season folders under ${rootDir}`);
  }

  /** @type {Map<string, any>} key = sourceId:xxx OR name:normalized */
  const players = new Map();
  const sourceIdToKey = new Map();
  const nameToKeys = new Map();

  const ensurePlayer = (name, sourceId) => {
    const display = displayPlayerName(name);
    const normalized = normalizePlayerName(name);
    if (!normalized) {
      log.emptyPlayerNames += 1;
      return null;
    }

    let key = null;
    if (sourceId && sourceIdToKey.has(sourceId)) key = sourceIdToKey.get(sourceId);
    if (!key) {
      const nameKeys = nameToKeys.get(normalized) || [];
      if (nameKeys.length === 1) key = nameKeys[0];
      else if (nameKeys.length > 1) {
        // Ambiguous name with multiple source ids — keep separate unless sourceId links
        if (sourceId) {
          key = `sid:${sourceId}`;
        } else {
          key = nameKeys[0];
        }
      }
    }
    if (!key) key = sourceId ? `sid:${sourceId}` : `name:${normalized}`;

    if (!players.has(key)) {
      players.set(key, {
        id: uidFn(),
        name: display,
        normalizedName: normalized,
        sourceIds: sourceId ? [String(sourceId)] : [],
        seasons: {},
        seasonsPlayed: [],
        seasonsCount: 0,
        career: null
      });
    }
    const p = players.get(key);
    p.name = preferDisplayName(p.name, display);
    p.normalizedName = normalizePlayerName(p.name) || normalized;
    if (sourceId && !p.sourceIds.includes(String(sourceId))) p.sourceIds.push(String(sourceId));
    if (sourceId) sourceIdToKey.set(String(sourceId), key);
    const nk = nameToKeys.get(normalized) || [];
    if (!nk.includes(key)) {
      nk.push(key);
      nameToKeys.set(normalized, nk);
    }
    return p;
  };

  for (const dirName of seasonDirs) {
    const meta = parseSeasonFolderName(dirName);
    if (!meta) {
      log.importErrors.push(`Could not parse season from folder: ${dirName}`);
      continue;
    }
    const folder = path.join(rootDir, dirName);
    const files = fs.readdirSync(folder).filter((f) => /\.(csv|xlsx|xls)$/i.test(f));
    const kinds = { batting: null, bowling: null, fielding: null, mvp: null };
    for (const f of files) {
      const k = fileKind(f);
      if (kinds[k] === null) kinds[k] = f;
    }
    for (const need of ["batting", "bowling", "fielding", "mvp"]) {
      if (!kinds[need]) log.missingFiles.push(`${dirName}: missing ${need} leaderboard`);
    }

    log.totalSeasonsProcessed += 1;

    /** Per-season merge keyed by sourceId or normalized name */
    const seasonBucket = new Map();

    const getSeasonRow = (name, sourceId) => {
      const player = ensurePlayer(name, sourceId);
      if (!player) return null;
      let sKey = sourceId ? `sid:${sourceId}` : `name:${normalizePlayerName(name)}`;
      if (sourceId && seasonBucket.has(`sid:${sourceId}`)) sKey = `sid:${sourceId}`;
      else if (!sourceId) {
        // try find existing by name
        for (const [k, v] of seasonBucket) {
          if (normalizePlayerName(v._name) === normalizePlayerName(name)) {
            sKey = k;
            break;
          }
        }
      }
      if (!seasonBucket.has(sKey)) {
        const season = emptySeasonStats(meta);
        season._playerRef = player;
        season._name = name;
        seasonBucket.set(sKey, season);
      }
      const season = seasonBucket.get(sKey);
      season._playerRef = player;
      return season;
    };

    for (const [kind, file] of Object.entries(kinds)) {
      if (!file) continue;
      const filePath = path.join(folder, file);
      try {
        const { rows, headers, hash } = readSheet(filePath, log);
        log.totalFilesProcessed += 1;
        log.files.push({ season: meta.seasonKey, kind, file, hash, rows: rows.length });

        const expectedHints = {
          batting: ["name", "total_runs", "total_match"],
          bowling: ["name", "total_wickets"],
          fielding: ["name", "total_dismissal", "total_catches"],
          mvp: ["Player Name", "Total", "Matches"]
        };
        const lower = headers.map((h) => h.toLowerCase());
        for (const hint of expectedHints[kind] || []) {
          if (!lower.includes(hint.toLowerCase()) && !headers.includes(hint)) {
            log.unexpectedColumns.push({ file, missingHint: hint, headers });
          }
        }

        for (const row of rows) {
          const rawName = pick(row, "name", "Player Name", "player_name");
          if (!String(rawName || "").trim()) {
            log.emptyPlayerNames += 1;
            continue;
          }
          let mapped;
          if (kind === "batting") mapped = mapBatting(row);
          else if (kind === "bowling") mapped = mapBowling(row);
          else if (kind === "fielding") mapped = mapFielding(row);
          else mapped = mapMvp(row);

          const season = getSeasonRow(rawName, mapped.sourceId || "");
          if (!season) continue;
          mergeMappedIntoSeason(season, mapped, kind);
        }
      } catch (e) {
        log.importErrors.push(`${dirName}/${file}: ${e.message}`);
      }
    }

    // Commit season rows onto player records (replace that season — idempotent)
    for (const season of seasonBucket.values()) {
      const player = season._playerRef;
      if (!player) continue;
      const { _playerRef, _name, ...clean } = season;
      player.seasons[String(meta.seasonNumber)] = clean;
      const playerKey = [...players.entries()].find(([, v]) => v === player)?.[0];
      for (const sid of clean.sourceIds || []) {
        if (!player.sourceIds.includes(sid)) player.sourceIds.push(sid);
        if (playerKey) sourceIdToKey.set(sid, playerKey);
      }
    }
  }

  // Coalesce name-only keys into source-id keys when they clearly refer to the same person
  for (const [normalized, keys] of [...nameToKeys.entries()]) {
    if (keys.length < 2) continue;
    const nameKeys = keys.filter((k) => k.startsWith("name:"));
    const sidKeys = keys.filter((k) => k.startsWith("sid:"));
    for (const nk of nameKeys) {
      const namePlayer = players.get(nk);
      if (!namePlayer) continue;
      let target = null;
      for (const sid of namePlayer.sourceIds || []) {
        if (sourceIdToKey.has(sid) && sourceIdToKey.get(sid) !== nk) {
          target = sourceIdToKey.get(sid);
          break;
        }
      }
      if (!target && sidKeys.length === 1) target = sidKeys[0];
      if (!target || !players.has(target) || target === nk) continue;
      const dest = players.get(target);
      for (const [sn, season] of Object.entries(namePlayer.seasons || {})) {
        if (!dest.seasons[sn]) dest.seasons[sn] = season;
        else {
          const a = dest.seasons[sn];
          const b = season;
          dest.seasons[sn] = {
            ...a,
            ...b,
            matches: Math.max(a.matches || 0, b.matches || 0),
            runs: Math.max(a.runs || 0, b.runs || 0),
            wickets: Math.max(a.wickets || 0, b.wickets || 0),
            catches: Math.max(a.catches || 0, b.catches || 0),
            dismissals: Math.max(a.dismissals || 0, b.dismissals || 0),
            mvpTotal: Math.max(a.mvpTotal || 0, b.mvpTotal || 0),
            sourceIds: [...new Set([...(a.sourceIds || []), ...(b.sourceIds || [])])]
          };
        }
      }
      dest.name = preferDisplayName(dest.name, namePlayer.name);
      dest.sourceIds = [...new Set([...(dest.sourceIds || []), ...(namePlayer.sourceIds || [])])];
      players.delete(nk);
      nameToKeys.set(
        normalized,
        (nameToKeys.get(normalized) || []).filter((k) => k !== nk)
      );
      for (const sid of dest.sourceIds) sourceIdToKey.set(sid, target);
    }
  }

  // Ambiguous: same normalized name, different source-id keys
  log.duplicateAmbiguousNames = [];
  for (const [normalized, keys] of nameToKeys) {
    const alive = keys.filter((k) => players.has(k));
    if (alive.length > 1) {
      log.duplicateAmbiguousNames.push({
        normalized,
        keys: alive,
        names: alive.map((k) => players.get(k)?.name).filter(Boolean),
        sourceIds: [...new Set(alive.flatMap((k) => players.get(k)?.sourceIds || []))],
        note: "Possible duplicate players — kept separate because source player_ids differ"
      });
    }
  }

  const list = [...players.values()].map((p) => {
    const nums = Object.keys(p.seasons)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    p.seasonsPlayed = nums;
    p.seasonsCount = nums.length;
    p.career = aggregateCareer(p.seasons);
    return p;
  });

  list.sort((a, b) => a.name.localeCompare(b.name));
  log.uniquePlayers = list.length;
  log.playersBySeasonCount = {};
  for (const p of list) {
    const c = p.seasonsCount || 0;
    log.playersBySeasonCount[c] = (log.playersBySeasonCount[c] || 0) + 1;
  }

  return {
    meta: {
      importedAt: Date.now(),
      sourceRoot: path.resolve(rootDir),
      seasons: seasonDirs.map((d) => parseSeasonFolderName(d)).filter(Boolean)
    },
    players: list,
    log
  };
}

export function findAcplPlayer(store, nameOrId) {
  const hist = store.acplHistory;
  if (!hist?.players?.length) return null;
  const key = String(nameOrId || "").trim();
  if (!key) return null;
  const byId = hist.players.find((p) => p.id === key);
  if (byId) return byId;
  const norm = normalizePlayerName(key);
  if (!norm) return null;
  const exact = hist.players.filter((p) => p.normalizedName === norm);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[0];
  return null;
}

/** Compact career summary for hammer desk / UI. `found:false` → show dashes. */
export function acplCareerSummary(store, playerName) {
  const p = findAcplPlayer(store, playerName);
  if (!p) {
    return {
      found: false,
      matches: null,
      runs: null,
      wickets: null,
      catches: null,
      dismissals: null,
      mvpTotal: null,
      seasonsPlayed: null,
      seasonsCount: null,
      seasonsLabel: null
    };
  }
  const c = p.career || {};
  return {
    found: true,
    id: p.id,
    name: p.name,
    matches: c.matches ?? 0,
    runs: c.runs ?? 0,
    wickets: c.wickets ?? 0,
    catches: c.catches ?? c.totalCatches ?? 0,
    dismissals: c.dismissals ?? 0,
    mvpTotal: c.mvpTotal ?? 0,
    mvpBatting: c.mvpBatting ?? 0,
    mvpBowling: c.mvpBowling ?? 0,
    mvpFielding: c.mvpFielding ?? 0,
    seasonsPlayed: p.seasonsPlayed || [],
    seasonsCount: p.seasonsCount || 0,
    seasonsLabel: (p.seasonsPlayed || []).join(", ") || "—"
  };
}

export function defaultAcplDataRoot() {
  const local = path.join(process.cwd(), "data", "acpl");
  if (fs.existsSync(local)) return local;
  const downloads = path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");
  if (fs.existsSync(downloads)) return downloads;
  return local;
}
