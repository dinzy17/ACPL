import test from "node:test";
import assert from "node:assert/strict";
import { maxBidFromBaseQuotas, teamLiveStats } from "../server/engine.mjs";

test("user example: 100 − (2×10 + 4×2 + 4×5) = 52 Cr", () => {
  // Values in lakhs (1 Cr = 100 L)
  const purseLeft = 10000;
  const baseSlots = [
    { basePrice: 200, owned: 0, cap: 4 },
    { basePrice: 500, owned: 0, cap: 4 },
    { basePrice: 1000, owned: 1, cap: 3 }
  ];
  // need: 4×2 + 4×5 + 2×10 = 8+20+20 = 48 Cr → 4800 L; max = 5200 L = 52 Cr
  assert.equal(maxBidFromBaseQuotas(purseLeft, baseSlots, 1, 11, 1000), 5200);
});

test("falls back to denom formula when no base caps", () => {
  // empty=10, reserve 9*1000=9000, purse 10000 → max 1000
  assert.equal(maxBidFromBaseQuotas(10000, [], 1, 11, 1000), 1000);
});

test("teamLiveStats uses base-quota max bid when caps configured", () => {
  const teamId = "t1";
  const currentId = "cur";
  const retained = {
    playerId: "ret1",
    teamId,
    basePrice: 1000,
    soldPrice: 2000,
    retained: true,
    at: 1
  };
  const store = {
    teams: [{ id: teamId, name: "Warriors", retentions: [retained] }],
    players: [
      { id: currentId, name: "Current", basePrice: 500, role: "Batsman" },
      { id: "ret1", name: "Retained", basePrice: 1000, role: "Batsman" }
    ],
    categories: []
  };
  const auction = {
    purse: 12000,
    maxSquad: 11,
    denominators: [200, 500, 1000],
    increments: [{ from: 0, to: 999999, step: 20 }],
    maxByBasePrice: { "200": 4, "500": 4, "1000": 3 },
    playerIds: [currentId, "ret1"],
    teamIds: [teamId],
    live: {
      currentPlayerId: currentId,
      currentBid: 500,
      lastBidTeamId: null,
      phase: "bidding",
      sold: [],
      status: "live"
    },
    status: "live"
  };
  const stats = teamLiveStats(store, auction, teamId);
  assert.equal(stats.purseLeft, 10000);
  assert.equal(stats.maxBidMode, "baseQuotas");
  assert.equal(stats.maxBid, 5200);
  assert.equal(stats.atBaseLimit, false);
});
