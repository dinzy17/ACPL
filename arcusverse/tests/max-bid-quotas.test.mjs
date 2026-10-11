import test from "node:test";
import assert from "node:assert/strict";
import { maxBidFromBaseQuotas, teamLiveStats } from "../server/engine.mjs";

test("reserves cheapest (empty-1) slots, not all remaining capacity", () => {
  // Values in lakhs (1 Cr = 100 L). Start: 1×10 retained, caps 4/4/3.
  // empty=10 → reserve 9 cheapest: 4×2 + 4×5 + 1×10 = 38 Cr → max 62 Cr
  const purseLeft = 10000;
  const baseSlots = [
    { basePrice: 200, owned: 0, cap: 4 },
    { basePrice: 500, owned: 0, cap: 4 },
    { basePrice: 1000, owned: 1, cap: 3 }
  ];
  assert.equal(maxBidFromBaseQuotas(purseLeft, baseSlots, 1, 11, 1000), 6200);
});

test("RW live case: 34.9 − (3×2 + 2×5) = 18.9 Cr", () => {
  // Royal Warriors: roster 5, empty 6, purse left 34.9 Cr
  // capacity left 3×2 + 2×5 + 1×10 → reserve cheapest 5 = 16 Cr → max 18.9 Cr
  const purseLeft = 3490;
  const baseSlots = [
    { basePrice: 200, owned: 1, cap: 4 },
    { basePrice: 500, owned: 2, cap: 4 },
    { basePrice: 1000, owned: 2, cap: 3 }
  ];
  assert.equal(maxBidFromBaseQuotas(purseLeft, baseSlots, 5, 11, 1000), 1890);
});

test("falls back to denom formula when no base caps", () => {
  // empty=10, reserve 9*1000=9000, purse 10000 → max 1000
  assert.equal(maxBidFromBaseQuotas(10000, [], 1, 11, 1000), 1000);
});

test("last roster slot: full purse even with base quotas configured", () => {
  // maxSquad=1, roster=0 → empty=1 → may spend entire purse (20 Cr = 2000 L)
  const baseSlots = [{ basePrice: 1000, owned: 0, cap: 1 }];
  assert.equal(maxBidFromBaseQuotas(2000, baseSlots, 0, 1, 1000), 2000);
  // Same via denom path
  assert.equal(maxBidFromBaseQuotas(2000, [], 0, 1, 1000), 2000);
});

test("nextMaxBid last slot is full purse", async () => {
  const { nextMaxBid } = await import("../server/engine.mjs");
  assert.equal(nextMaxBid(2000, 0, 1, 1000), 2000);
  assert.equal(nextMaxBid(2000, 0, 2, 1000), 1000); // empty=2 → reserve 1*1000
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
  // empty=10 → cheapest 9 of 4×2+4×5+2×10 = 38 Cr reserve → 62 Cr max
  assert.equal(stats.maxBid, 6200);
  assert.equal(stats.atBaseLimit, false);
});
