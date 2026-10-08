import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  normalizePlayerName,
  displayPlayerName,
  importAcplHistory,
  acplCareerSummary,
  defaultAcplDataRoot
} from "../server/acpl.mjs";

test("normalizePlayerName collapses case and spacing", () => {
  const names = ["Omkar Sinha", "omkar sinha", "OMKAR SINHA", "Omkar  Sinha"];
  const norms = names.map(normalizePlayerName);
  assert.equal(new Set(norms).size, 1);
  assert.equal(norms[0], "omkar sinha");
});

test("displayPlayerName title-cases cleanly", () => {
  assert.equal(displayPlayerName("  jayant   parkhi "), "Jayant Parkhi");
});

test("import aggregates seasons and is idempotent", () => {
  const root = defaultAcplDataRoot();
  assert.ok(fs.existsSync(root), "data/acpl must exist for tests");
  const a = importAcplHistory(root);
  const b = importAcplHistory(root);
  assert.equal(a.players.length, b.players.length);
  assert.equal(a.log.totalSeasonsProcessed, 5);
  assert.equal(a.log.totalFilesProcessed, 20);

  const jayant = a.players.find((p) => /jayant parkhi/i.test(p.name));
  assert.ok(jayant, "Jayant Parkhi should exist");
  assert.deepEqual(jayant.seasonsPlayed, [1, 2, 3, 4, 5]);
  assert.equal(jayant.seasonsCount, 5);
  const again = b.players.find((p) => p.normalizedName === jayant.normalizedName);
  assert.equal(jayant.career.runs, again.career.runs);
  assert.equal(jayant.career.matches, again.career.matches);

  // Cross-category merge: batting + fielding one record
  assert.ok(jayant.career.runs > 0);
  assert.ok(jayant.career.catches > 0);
});

test("missing player summary shows not found (dashes in UI)", () => {
  const store = { acplHistory: importAcplHistory(defaultAcplDataRoot()) };
  const summary = acplCareerSummary(store, "Definitely Not A Real ACPL Player XYZ");
  assert.equal(summary.found, false);
  assert.equal(summary.matches, null);
  assert.equal(summary.runs, null);
});

test("found player career summary has combined stats", () => {
  const hist = importAcplHistory(defaultAcplDataRoot());
  const store = { acplHistory: hist };
  const jayant = hist.players.find((p) => /jayant parkhi/i.test(p.name));
  const summary = acplCareerSummary(store, "JAYANT  PARKHI");
  assert.equal(summary.found, true);
  assert.equal(summary.matches, jayant.career.matches);
  assert.equal(summary.runs, jayant.career.runs);
  assert.equal(summary.seasonsCount, 5);
  assert.equal(summary.seasonsLabel, "1, 2, 3, 4, 5");
});

test("season tracking for subset seasons", () => {
  const hist = importAcplHistory(defaultAcplDataRoot());
  const multi = hist.players.find((p) => p.seasonsCount >= 2 && p.seasonsCount < 5);
  assert.ok(multi);
  assert.equal(multi.seasonsPlayed.join(","), [...multi.seasonsPlayed].sort((a, b) => a - b).join(","));
  assert.equal(multi.seasonsCount, multi.seasonsPlayed.length);
});

test("synthetic multi-season aggregation", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acpl-test-"));
  const mk = (season, battingRows, bowlingRows) => {
    const dir = path.join(tmp, `ACPL-${season}(Men's)`);
    fs.mkdirSync(dir);
    const bat =
      "player_id,name,team_id,team_name,total_match,innings,total_runs,highest_run,average,not_out,strike_rate,ball_faced,batting_hand,4s,6s,50s,100s\n" +
      battingRows.join("\n");
    const bowl =
      "player_id,name,team_id,team_name,total_match,innings,total_wickets,balls,highest_wicket,economy,SR,maidens,avg,runs,bowling_style,overs,dot_balls\n" +
      bowlingRows.join("\n");
    const field =
      "player_id,name,team_id,team_name,total_match,catches,caught_behind,run_outs,assist_run_outs,stumpings,caught_and_bowl,total_catches,total_dismissal\n" +
      `1,Omkar Sinha,1,T,5,2,0,0,0,0,0,2,2`;
    const mvp =
      "Player Name,Team Name,Player Role,Bowling Style,Batting Hand,Matches,Batting,Bowling,Fielding,Total\n" +
      `Omkar Sinha,T,All-Rounder,Right-arm fast,RHB,5,1,1,1,3`;
    fs.writeFileSync(path.join(dir, "batting_leaderboard.csv"), bat);
    fs.writeFileSync(path.join(dir, "bowling_leaderboard.csv"), bowl);
    fs.writeFileSync(path.join(dir, "fielding_leaderboard.csv"), field);
    fs.writeFileSync(path.join(dir, "mvp_leaderboard.csv"), mvp);
  };
  mk(
    1,
    ["1,Omkar Sinha,1,T,5,5,120,40,24,0,100,120,RHB,10,2,0,0"],
    ["1,Omkar Sinha,1,T,5,5,3,60,2,5,20,0,20,60,Right-arm fast,10.0,10"]
  );
  mk(
    2,
    ["1,omkar  sinha,1,T,6,6,150,50,25,0,110,130,RHB,12,3,1,0"],
    ["1,OMKAR SINHA,1,T,6,6,4,70,2,5,17,0,18,70,Right-arm fast,11.0,12"]
  );
  // fielding in mk() always writes matches=5 — season 2 fielding should still max matches with batting
  const dir2 = path.join(tmp, "ACPL-2(Men's)");
  fs.writeFileSync(
    path.join(dir2, "fielding_leaderboard.csv"),
    "player_id,name,team_id,team_name,total_match,catches,caught_behind,run_outs,assist_run_outs,stumpings,caught_and_bowl,total_catches,total_dismissal\n" +
      "1,Omkar Sinha,1,T,6,3,0,0,0,0,0,3,3"
  );

  const hist = importAcplHistory(tmp);
  const p = hist.players.find((x) => x.normalizedName === "omkar sinha");
  assert.ok(p);
  assert.deepEqual(p.seasonsPlayed, [1, 2]);
  assert.equal(p.career.matches, 11);
  assert.equal(p.career.runs, 270);
  assert.equal(p.career.wickets, 7);
  assert.equal(p.career.catches, 5);

  const again = importAcplHistory(tmp);
  const p2 = again.players.find((x) => x.normalizedName === "omkar sinha");
  assert.equal(p2.career.runs, 270);
});
