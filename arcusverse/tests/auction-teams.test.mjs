import test from "node:test";
import assert from "node:assert/strict";
import { groupRegistrationsByAuctionTeam, isMensCategory } from "../lib/auction-teams.mjs";

test("isMensCategory accepts Men's variants and rejects Women/Kids", () => {
  assert.equal(isMensCategory({ values: { category: "Men's" } }), true);
  assert.equal(isMensCategory({ category: "Men" }), true);
  assert.equal(isMensCategory({ values: { category: "mens" } }), true);
  assert.equal(isMensCategory({ values: { category: "Women's" } }), false);
  assert.equal(isMensCategory({ values: { category: "Kid's" } }), false);
  assert.equal(isMensCategory({ values: { category: "Kids" } }), false);
});

test("Not representing a team lists Men's only", () => {
  const regs = [
    { id: "1", values: { category: "Men's", auctionRepresent: "No", playerName: "Arjun" } },
    { id: "2", values: { category: "Women's", auctionRepresent: "No", playerName: "Ananya" } },
    { id: "3", values: { category: "Kid's", auctionRepresent: "No", playerName: "Aarav" } },
    {
      id: "4",
      values: { category: "Men's", auctionRepresent: "Yes", auctionTeam: "Raptors", playerName: "Kabir" }
    },
    {
      id: "5",
      values: { category: "Women's", auctionRepresent: "Yes", auctionTeam: "Raptors", playerName: "Meera" }
    }
  ];
  const groups = groupRegistrationsByAuctionTeam(regs, { teamOptions: ["Raptors", "Titans"] });
  const byTeam = Object.fromEntries(groups.map((g) => [g.team, g.players.map((p) => p.id)]));

  assert.deepEqual(byTeam["Not representing a team"], ["1"]);
  assert.deepEqual(byTeam.Raptors, ["4", "5"]);
  assert.deepEqual(byTeam.Titans, []);
  assert.equal(byTeam["Team not specified"], undefined);
});
