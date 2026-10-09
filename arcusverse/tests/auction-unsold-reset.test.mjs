import test from "node:test";
import assert from "node:assert/strict";
import { markSold, markUnsold, publicState, startAuction, undoLast } from "../server/engine.mjs";

function baseStore() {
  const teamA = { id: "t1", name: "Alpha", retentions: [], categoryId: "c1" };
  const teamB = { id: "t2", name: "Beta", retentions: [], categoryId: "c1" };
  const players = [
    { id: "p1", name: "One", basePrice: 100, role: "Batsman", categoryId: "c1", teamId: null },
    { id: "p2", name: "Two", basePrice: 100, role: "Bowler", categoryId: "c1", teamId: null },
    { id: "p3", name: "Three", basePrice: 200, role: "Batsman", categoryId: "c1", teamId: null }
  ];
  const auction = {
    id: "a1",
    code: "TEST1",
    name: "Test",
    status: "draft",
    purse: 10000,
    maxSquad: 10,
    denominators: [100],
    increments: [{ from: 0, to: 999999, step: 10 }],
    maxByBasePrice: {},
    playerIds: players.map((p) => p.id),
    teamIds: [teamA.id, teamB.id],
    categoryId: "c1",
    tournamentId: null,
    timerSeconds: 30,
    sequence: "random",
    live: null
  };
  return {
    meta: { updatedAt: Date.now(), liveBidding: true },
    categories: [{ id: "c1", name: "Men" }],
    tournaments: [],
    teams: [teamA, teamB],
    players,
    auctions: [auction],
    owners: [],
    users: []
  };
}

test("sold after unsold pass clears player from unsold list", () => {
  const store = baseStore();
  startAuction(store, "a1");
  const auction = store.auctions[0];
  // Force current lot to p1
  auction.live.currentPlayerId = "p1";
  auction.live.currentBid = 100;
  auction.live.lastBidTeamId = null;
  auction.live.phase = "bidding";
  markUnsold(store, "a1");
  assert.equal(auction.live.unsoldPasses.p1, 1);

  // Bring p1 back and sell
  auction.live.currentPlayerId = "p1";
  auction.live.currentBid = 100;
  auction.live.lastBidTeamId = "t1";
  auction.live.phase = "bidding";
  markSold(store, "a1");
  assert.equal(auction.live.unsoldPasses.p1, undefined);

  const pub = publicState(store, "a1");
  const unsoldIds = (pub.live.unsoldPlayers || []).map((p) => p.id);
  assert.ok(!unsoldIds.includes("p1"));
});

test("undo after reset live restores previous sold roster", () => {
  const store = baseStore();
  startAuction(store, "a1");
  const auction = store.auctions[0];
  auction.live.currentPlayerId = "p1";
  auction.live.currentBid = 150;
  auction.live.lastBidTeamId = "t1";
  auction.live.phase = "bidding";
  markSold(store, "a1", { teamId: "t1", price: 150 });
  assert.equal(auction.live.sold.length, 1);
  assert.equal(store.players.find((p) => p.id === "p1").teamId, "t1");

  startAuction(store, "a1"); // accidental reset
  assert.equal(auction.live.sold.length, 0);
  assert.equal(store.players.find((p) => p.id === "p1").teamId, null);

  undoLast(store, "a1");
  assert.equal(auction.live.sold.length, 1);
  assert.equal(auction.live.sold[0].playerId, "p1");
  assert.equal(store.players.find((p) => p.id === "p1").teamId, "t1");
});
