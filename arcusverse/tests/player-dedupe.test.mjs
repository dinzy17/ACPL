import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFieldState,
  dedupePlayersByName,
  mergeAuctionPlayers,
  linkPlayerToAcpl
} from "../server/registration.mjs";
import { buildAcplSeason6Form } from "../server/registration-template-acpl6.mjs";
import { emptySeed, uid } from "../server/store.mjs";

function makeStore() {
  const store = emptySeed();
  store.registrationForms = [];
  store.registrations = [];
  store.registrationFiles = [];
  store.registrationAudits = [];
  store.acplHistory = { meta: {}, players: [], log: null };
  return store;
}

test("Batter hides bowlingStyle; Bowler shows it", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const batter = evaluateFieldState(form, { firstTimeAcpl: "Yes", playerType: "Batter" });
  assert.equal(batter.visible.battingStyle, true);
  assert.equal(batter.visible.bowlingStyle, false);

  const bowler = evaluateFieldState(form, { firstTimeAcpl: "Yes", playerType: "Bowler" });
  assert.equal(bowler.visible.bowlingStyle, true);
  assert.equal(bowler.required.bowlingStyle, true);

  const ar = evaluateFieldState(form, { firstTimeAcpl: "Yes", playerType: "All-rounder" });
  assert.equal(ar.visible.bowlingStyle, true);
});

test("dedupePlayersByName merges duplicates and keeps latest photo", () => {
  const store = makeStore();
  const a = {
    id: "a1",
    name: "Amit Deshmukh",
    photo: "/uploads/old.jpg",
    basePrice: 200,
    tournamentIds: ["t1"],
    phone: ""
  };
  const b = {
    id: "b1",
    name: "Amit deshmukh",
    photo: "/uploads/new.jpg",
    basePrice: null,
    tournamentIds: ["t2"],
    phone: "9876543210",
    acplPlayerId: "acpl-1",
    acplName: "Amit Deshmukh"
  };
  store.players = [a, b];
  store.tournaments[0].playerIds = ["a1", "b1"];
  store.registrations = [{ id: "r1", playerId: "b1" }];

  const removed = dedupePlayersByName(store);
  assert.equal(removed, 1);
  assert.equal(store.players.length, 1);
  const p = store.players[0];
  assert.equal(normalizeLike(p.name), "amit deshmukh");
  assert.equal(p.photo, "/uploads/new.jpg");
  assert.equal(p.phone, "9876543210");
  assert.equal(p.acplPlayerId, "acpl-1");
  assert.ok(Number.isFinite(Number(p.basePrice)));
  assert.deepEqual(new Set(p.tournamentIds), new Set(["t1", "t2"]));
  assert.equal(store.registrations[0].playerId, p.id);
  assert.deepEqual(store.tournaments[0].playerIds, [p.id]);
});

function normalizeLike(name) {
  return String(name).trim().toLowerCase();
}

test("mergeAuctionPlayers absorbs duplicate into keep", () => {
  const store = makeStore();
  store.players = [
    { id: "keep", name: "Amit Deshmukh", photo: "", basePrice: 150, tournamentIds: [], acplPlayerId: "acpl-1" },
    { id: "dup", name: "Amit Deshmukh", photo: "/uploads/reg.jpg", basePrice: null, tournamentIds: ["t9"], phone: "9999999999" }
  ];
  store.tournaments[0].playerIds = ["dup"];
  const keep = mergeAuctionPlayers(store, "keep", "dup");
  assert.equal(store.players.length, 1);
  assert.equal(keep.id, "keep");
  assert.equal(keep.photo, "/uploads/reg.jpg");
  assert.equal(keep.phone, "9999999999");
  assert.equal(keep.acplPlayerId, "acpl-1");
  assert.deepEqual(keep.tournamentIds, ["t9"]);
});

test("linkPlayerToAcpl sets acplPlayerId", () => {
  const store = makeStore();
  store.players = [{ id: "p1", name: "Amit Deshmukh", basePrice: null }];
  store.acplHistory.players = [
    { id: "acpl-1", name: "Amit Deshmukh", normalizedName: "amit deshmukh", career: { runs: 100 } }
  ];
  const { player, acpl } = linkPlayerToAcpl(store, "p1", "Amit Deshmukh");
  assert.equal(player.acplPlayerId, "acpl-1");
  assert.equal(acpl.id, "acpl-1");
});

test("registration create uses null basePrice", async () => {
  const { submitRegistration, createForm, setFormStatus } = await import("../server/registration.mjs");
  const store = makeStore();
  const form = createForm(store, { tournamentId: store.tournaments[0].id, template: "acpl6" });
  form.capacity = 50;
  form.useCategoryCapacity = false;
  form.payment.bank.accountNumber = "123";
  form.payment.bank.accountName = "ACPL";
  form.payment.bank.ifsc = "IFSC";
  form.payment.bank.bankName = "Bank";
  setFormStatus(store, form.id, "open");

  const photo = {
    id: uid(),
    formId: form.id,
    fieldKey: "playerPhoto",
    registrationId: null,
    playerId: null,
    originalFilename: "p.png",
    storedFilename: `${uid()}.png`,
    mimeType: "image/png",
    fileSize: 10,
    storagePath: "x.png",
    uploadedAt: Date.now()
  };
  store.registrationFiles.push(photo);
  // Private upload file must exist for photo materialization
  const fs = await import("fs");
  const path = await import("path");
  const { PRIVATE_UPLOAD_DIR } = await import("../server/registration.mjs");
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRIVATE_UPLOAD_DIR, photo.storedFilename), Buffer.from("fake-image"));

  // Pre-existing player with same name and a base price
  store.players.push({
    id: "existing",
    name: "Unique Reg Player",
    photo: "/uploads/old.png",
    role: "Batsman",
    categoryId: store.categories[0].id,
    sport: "Cricket",
    basePrice: 250,
    phone: "",
    teamId: null,
    assignment: "auction",
    tournamentIds: []
  });

  await submitRegistration(
    store,
    {
      token: form.publicToken,
      values: {
        playerName: "Unique Reg Player",
        mobile: "9876501234",
        email: "unique@example.com",
        dob: "1995-05-05",
        category: "Men's",
        jerseySize: "42",
        firstTimeAcpl: "No",
        auctionRepresent: "No",
        arcusRelation: "Owner",
        flatNumber: "B2",
        relationWithOwner: "Self",
        paymentPreference: "Other",
        otherPaymentMode: "Cash"
      },
      fileIds: { playerPhoto: photo.id }
    },
    { saveUploadFn: () => "/uploads/newest.png", sendEmail: false }
  );

  const matches = store.players.filter((p) => /unique reg player/i.test(p.name));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "existing");
  assert.equal(matches[0].photo, "/uploads/newest.png");
  assert.equal(matches[0].basePrice, 250);
});
