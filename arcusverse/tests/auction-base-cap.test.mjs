import test from "node:test";
import assert from "node:assert/strict";
import { teamLiveStats } from "../server/engine.mjs";

function fixture({ maxByBasePrice, ownedAtBase = 3 }) {
  const teamId = "team1";
  const currentId = "p-current";
  const sold = [];
  for (let i = 0; i < ownedAtBase; i++) {
    sold.push({
      playerId: `owned-${i}`,
      teamId,
      basePrice: 200,
      soldPrice: 200,
      at: i + 1
    });
  }
  const store = {
    teams: [{ id: teamId, name: "Raptors", retentions: [] }],
    players: [
      { id: currentId, name: "Current", basePrice: 200, role: "Batsman" },
      ...sold.map((s) => ({ id: s.playerId, name: s.playerId, basePrice: 200, role: "Batsman" }))
    ]
  };
  const auction = {
    purse: 12000,
    maxSquad: 20,
    denominators: [600, 800, 1000],
    increments: [{ from: 0, to: 999999, step: 20 }],
    maxByBasePrice,
    playerIds: [currentId, ...sold.map((s) => s.playerId)],
    live: {
      currentPlayerId: currentId,
      currentBid: 200,
      lastBidTeamId: null,
      sold
    }
  };
  return { store, auction, teamId };
}

test("blank / missing maxByBasePrice means no cap at that base", () => {
  const { store, auction, teamId } = fixture({ maxByBasePrice: {}, ownedAtBase: 5 });
  const stats = teamLiveStats(store, auction, teamId);
  assert.equal(stats.baseCap, null);
  assert.equal(stats.atBaseLimit, false);
  assert.equal(stats.baseSlots.length, 0);
});

test("numeric maxByBasePrice still enforces the cap", () => {
  const { store, auction, teamId } = fixture({ maxByBasePrice: { "200": 3 }, ownedAtBase: 3 });
  const stats = teamLiveStats(store, auction, teamId);
  assert.equal(stats.baseCap, 3);
  assert.equal(stats.atBaseLimit, true);
  assert.equal(stats.baseSlots[0]?.left, 0);
});

test("empty-string maxByBasePrice entry is treated as no cap", () => {
  const { store, auction, teamId } = fixture({ maxByBasePrice: { "200": "" }, ownedAtBase: 4 });
  const stats = teamLiveStats(store, auction, teamId);
  assert.equal(stats.baseCap, null);
  assert.equal(stats.atBaseLimit, false);
});
