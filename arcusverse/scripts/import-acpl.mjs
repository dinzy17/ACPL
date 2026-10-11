#!/usr/bin/env node
/**
 * Import ACPL historical leaderboards into data/store.json
 *
 * Usage:
 *   node scripts/import-acpl.mjs
 *   node scripts/import-acpl.mjs --root "C:/path/to/acpl-or-Downloads"
 */
import path from "path";
import { fileURLToPath } from "url";
import { loadStore, saveStore } from "../server/store.mjs";
import { importAcplHistory, defaultAcplDataRoot } from "../server/acpl.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = process.argv.includes("--root")
  ? process.argv[process.argv.indexOf("--root") + 1]
  : defaultAcplDataRoot();

const store = loadStore();
const result = importAcplHistory(rootArg);
store.acplHistory = {
  meta: result.meta,
  players: result.players,
  log: result.log
};
saveStore(store);

const log = result.log;
console.log("ACPL import complete");
console.log(`  Source: ${result.meta.sourceRoot}`);
console.log(`  Total seasons processed: ${log.totalSeasonsProcessed}`);
console.log(`  Total Excel/CSV files processed: ${log.totalFilesProcessed}`);
console.log(`  Unique players discovered: ${log.uniquePlayers}`);
for (let i = 1; i <= 5; i++) {
  console.log(`  Players appearing in ${i} season(s): ${log.playersBySeasonCount[i] || 0}`);
}
console.log(`  Duplicate/ambiguous player names: ${log.duplicateAmbiguousNames.length}`);
console.log(`  Import errors: ${log.importErrors.length}`);
if (log.missingFiles.length) console.log("  Missing files:", log.missingFiles);
if (log.importErrors.length) console.log("  Errors:", log.importErrors);
if (log.duplicateAmbiguousNames.length) {
  console.log("  Ambiguous (sample):");
  for (const a of log.duplicateAmbiguousNames.slice(0, 15)) {
    console.log(`    - ${a.normalized || a.name}: ${(a.names || []).join(" | ")} ids=${(a.sourceIds || []).join(",")}`);
  }
}
