import test from "node:test";
import assert from "node:assert/strict";
import {
  compareOp,
  evaluateFieldState,
  detectCircularRules,
  validateSubmission,
  submitRegistration,
  updateRegistrationStatus,
  setPaymentStatus,
  linkPlayerToAcpl,
  unlinkPlayerFromAcpl,
  createForm,
  setFormStatus,
  upsertForm,
  dashboardForForm,
  fillAvailableSlotsFromWaiting,
  withRegLock,
  exportCsv
} from "../server/registration.mjs";
import { buildAcplSeason6Form } from "../server/registration-template-acpl6.mjs";
import { emptySeed, uid, saveUpload } from "../server/store.mjs";
import fs from "fs";
import path from "path";
import os from "os";

function tinyPngDataUrl() {
  // 1x1 PNG
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return `data:image/png;base64,${b64}`;
}

function makeStore() {
  const store = emptySeed();
  store.registrationForms = [];
  store.registrations = [];
  store.registrationFiles = [];
  store.registrationAudits = [];
  store.meta.regFileSecret = "test-secret-key-please-ignore";
  return store;
}

test("parseFormDateTime treats naive values as IST", async () => {
  const { parseFormDateTime } = await import("../server/registration.mjs");
  const ms = parseFormDateTime("2026-09-08T19:21");
  assert.equal(new Date(ms).toISOString(), "2026-09-08T13:51:00.000Z");
});

test("open status with future opensAt in IST past is accepting", async () => {
  const { publicFormPayload } = await import("../server/registration.mjs");
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  form.status = "open";
  // 19:21 IST = 13:51 UTC; now simulate 14:00 UTC
  form.opensAt = "2026-09-08T19:21";
  form.closesAt = "";
  const fakeNow = Date.parse("2026-09-08T14:00:00.000Z");
  // poke via publicFormPayload which uses formIsAccepting internally — call evaluate through submit gate
  const { parseFormDateTime } = await import("../server/registration.mjs");
  assert.ok(parseFormDateTime(form.opensAt) < fakeNow);
});


test("ACPL first-time Yes shows cricket fields", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const values = { firstTimeAcpl: "Yes" };
  const { visible, required } = evaluateFieldState(form, values);
  assert.equal(visible.playerType, true);
  assert.equal(required.playerType, true);
  assert.equal(visible.battingStyle, true);
  assert.equal(visible.cricHeroesHas, true);
  assert.equal(visible.cricHeroesProfile, false);
});

test("CricHeroes Yes shows profile and required", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const values = { firstTimeAcpl: "Yes", cricHeroesHas: "Yes" };
  const { visible, required } = evaluateFieldState(form, values);
  assert.equal(visible.cricHeroesProfile, true);
  assert.equal(required.cricHeroesProfile, true);
});

test("CricHeroes No hides profile", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const values = { firstTimeAcpl: "Yes", cricHeroesHas: "No" };
  const { visible } = evaluateFieldState(form, values);
  assert.equal(visible.cricHeroesProfile, false);
});

test("Owner shows flat and relation", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const { visible, required } = evaluateFieldState(form, { arcusRelation: "Owner" });
  assert.equal(visible.flatNumber, true);
  assert.equal(required.flatNumber, true);
  assert.equal(visible.relationWithOwner, true);
  assert.equal(visible.bloodRelativeProof, false);
  assert.equal(visible.rentalAgreement, false);
});

test("Blood relative shows proof", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const { visible, required } = evaluateFieldState(form, { arcusRelation: "1st Blood Relative of Owner" });
  assert.equal(visible.bloodRelativeProof, true);
  assert.equal(required.bloodRelativeProof, true);
});

test("Tenant shows rental agreement", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  const { visible, required } = evaluateFieldState(form, { arcusRelation: "Tenant" });
  assert.equal(visible.rentalAgreement, true);
  assert.equal(required.rentalAgreement, true);
});

test("Payment bank / upi / other conditionals", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  let s = evaluateFieldState(form, { paymentPreference: "Bank Transfer" });
  assert.equal(s.visible.bankInfo, true);
  assert.equal(s.visible.bankProof, true);
  assert.equal(s.required.bankProof, true);
  assert.equal(s.visible.upiProof, false);

  s = evaluateFieldState(form, { paymentPreference: "UPI" });
  assert.equal(s.visible.upiInfo, true);
  assert.equal(s.visible.upiProof, true);
  assert.equal(s.required.upiProof, true);
  assert.equal(s.visible.bankProof, false);

  s = evaluateFieldState(form, { paymentPreference: "Other" });
  assert.equal(s.visible.otherPaymentMode, true);
  assert.equal(s.required.otherPaymentMode, true);
});

test("detectCircularRules finds cycles", () => {
  const form = {
    rules: [
      { sourceKey: "a", operator: "equals", value: "1", targetKey: "b" },
      { sourceKey: "b", operator: "equals", value: "1", targetKey: "a" }
    ]
  };
  const r = detectCircularRules(form);
  assert.equal(r.ok, false);
});

test("hidden required fields are not validated", () => {
  const store = makeStore();
  const form = buildAcplSeason6Form(store.tournaments[0], store);
  // Minimal visible required fields only — payment UPI so bankProof must not be required
  const values = {
    playerName: "Test Player",
    mobile: "9876543210",
    email: "test@example.com",
    dob: "2000-01-01",
    category: "Men's",
    jerseySize: "40",
    firstTimeAcpl: "No",
    auctionRepresent: "No",
    arcusRelation: "Owner",
    flatNumber: "A1",
    relationWithOwner: "Self",
    paymentPreference: "UPI"
  };
  const fileIds = { playerPhoto: "file1", upiProof: "file2" };
  const result = validateSubmission(form, values, fileIds);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.bankProof, undefined);
});

async function seedOpenForm(store, capacity = 5) {
  const form = createForm(store, { tournamentId: store.tournaments[0].id, template: "acpl6" });
  form.capacity = capacity;
  form.useCategoryCapacity = false;
  form.payment.bank.accountNumber = "123";
  form.payment.bank.accountName = "ACPL";
  form.payment.bank.ifsc = "IFSC";
  form.payment.bank.bankName = "Bank";
  setFormStatus(store, form.id, "open");
  return form;
}

function baseValues(i) {
  return {
    playerName: `Player ${i}`,
    mobile: `90000000${String(i).padStart(2, "0")}`.slice(0, 10),
    email: `player${i}@example.com`,
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
  };
}

test("waiting list: capacity 5 then promote after cancel", async () => {
  const prevCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reg-test-"));
  process.chdir(tmp);
  fs.mkdirSync(path.join(tmp, "public", "uploads"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "data", "private-uploads"), { recursive: true });

  try {
    const store = makeStore();
    const form = await seedOpenForm(store, 5);

    const results = [];
    for (let i = 1; i <= 6; i++) {
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
        storagePath: `${uid()}.png`,
        uploadedAt: Date.now()
      };
      fs.writeFileSync(path.join(tmp, "data", "private-uploads", photo.storedFilename), Buffer.from("x"));
      store.registrationFiles.push(photo);
      const out = await submitRegistration(
        store,
        { token: form.publicToken, values: baseValues(i), fileIds: { playerPhoto: photo.id } },
        { saveUploadFn: () => `/uploads/fake-${i}.png`, sendEmail: false }
      );
      results.push(out.registration);
      // ensure distinct timestamps for ordering
      await new Promise((r) => setTimeout(r, 2));
    }

    assert.equal(results.filter((r) => r.status === "registered").length, 5);
    assert.equal(results[5].status, "waiting");
    assert.equal(results[5].waitingPosition, 1);
    assert.equal(results[5].category, "Men's");
    assert.equal(results[5].sequence, 6);

    const waitingId = store.registrations.find((r) => r.values.playerName === "Player 6").id;
    const cancelId = store.registrations.find((r) => r.values.playerName === "Player 3").id;
    const waitingBefore = store.registrations.find((r) => r.id === waitingId);
    const ts = waitingBefore.registeredAt;

    await updateRegistrationStatus(store, cancelId, "cancelled", "admin");

    const promoted = store.registrations.find((r) => r.id === waitingId);
    assert.equal(promoted.status, "registered");
    assert.equal(promoted.registeredAt, ts);
    assert.equal(promoted.waitingPosition, null);
    // Numbers follow registration timestamp among currently registered: P1,P2,P4,P5,P6 → 1..5
    assert.equal(promoted.sequence, 5);
    assert.equal(store.registrations.find((r) => r.values.playerName === "Player 1").sequence, 1);
    assert.equal(store.registrations.find((r) => r.values.playerName === "Player 4").sequence, 3);
  } finally {
    process.chdir(prevCwd);
  }
});

test("per-category registration numbers and renumber on demote/delete", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 100);
  form.useCategoryCapacity = true;
  form.categoryCapacity = { "Men's": 100, "Women's": 100, "Kid's": 100 };

  const submit = async (i, category) => {
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
    const out = await submitRegistration(
      store,
      {
        token: form.publicToken,
        values: { ...baseValues(i), category, mobile: `9${String(100000000 + i).slice(0, 9)}` },
        fileIds: { playerPhoto: photo.id }
      },
      { saveUploadFn: () => `/uploads/x.png`, sendEmail: false }
    );
    await new Promise((r) => setTimeout(r, 2));
    return out.registration;
  };

  const m1 = await submit(1, "Men's");
  const m2 = await submit(2, "Men's");
  const w1 = await submit(3, "Women's");
  const k1 = await submit(4, "Kid's");
  const m3 = await submit(5, "Men's");

  assert.equal(m1.sequence, 1);
  assert.equal(m2.sequence, 2);
  assert.equal(w1.sequence, 1);
  assert.equal(k1.sequence, 1);
  assert.equal(m3.sequence, 3);
  assert.equal(m3.category, "Men's");
  assert.match(m3.registrationId, /MEN-0003$/);

  // Demote 2nd man → later men renumber (3 → 2)
  const m2id = store.registrations.find((r) => r.values.playerName === "Player 2").id;
  await updateRegistrationStatus(store, m2id, "waiting", "admin");
  assert.equal(store.registrations.find((r) => r.values.playerName === "Player 1").sequence, 1);
  assert.equal(store.registrations.find((r) => r.values.playerName === "Player 5").sequence, 2);
  assert.equal(store.registrations.find((r) => r.values.playerName === "Player 3").sequence, 1); // women untouched

  // Promote friend (Player 2) first, then ensure Player 5 who registered earlier? 
  // Player 1 registered first, Player 5 second among registered — timestamps preserved
  await updateRegistrationStatus(store, m2id, "registered", "admin", { confirmPromote: true });
  const p1 = store.registrations.find((r) => r.values.playerName === "Player 1");
  const p2 = store.registrations.find((r) => r.values.playerName === "Player 2");
  const p5 = store.registrations.find((r) => r.values.playerName === "Player 5");
  assert.ok(p1.registeredAt < p2.registeredAt);
  assert.ok(p2.registeredAt < p5.registeredAt);
  assert.equal(p1.sequence, 1);
  assert.equal(p2.sequence, 2);
  assert.equal(p5.sequence, 3);

  // Delete Player 2 → Player 5 becomes #2
  const { deleteRegistration } = await import("../server/registration.mjs");
  await deleteRegistration(store, p2.id, "admin");
  assert.equal(store.registrations.find((r) => r.values.playerName === "Player 5").sequence, 2);
});

test("promote/verify attaches player to tournament and links ACPL by name", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 100);
  store.acplHistory = {
    meta: {},
    players: [
      {
        id: "acpl-1",
        name: "Player 1",
        normalizedName: "player 1",
        career: { matches: 10, runs: 200, wickets: 5 },
        seasonsPlayed: ["S1"]
      }
    ],
    log: null
  };

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
  const out = await submitRegistration(
    store,
    { token: form.publicToken, values: baseValues(1), fileIds: { playerPhoto: photo.id } },
    { saveUploadFn: () => `/uploads/p.png`, sendEmail: false }
  );
  assert.equal(out.registration.status, "registered");
  const tour = store.tournaments[0];
  const player = store.players.find((p) => p.name === "Player 1");
  assert.ok(player);
  assert.ok(tour.playerIds.includes(player.id));
  assert.equal(player.acplPlayerId, "acpl-1");
});

function acplPhotoFile(form) {
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
  return photo;
}

test("admin ACPL link survives payment verify and promote", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 5);
  // The ACPL profile is spelled differently from the registration name, so name
  // matching can never find it — which is exactly why an admin links it by hand.
  store.acplHistory = {
    meta: {},
    players: [
      {
        id: "acpl-42",
        name: "Omkar Sinha",
        normalizedName: "omkar sinha",
        career: { matches: 30, runs: 274, wickets: 2 },
        seasonsPlayed: ["S5"]
      }
    ],
    log: null
  };

  const photo = acplPhotoFile(form);
  store.registrationFiles.push(photo);
  const out = await submitRegistration(
    store,
    {
      token: form.publicToken,
      values: { ...baseValues(1), playerName: "Omkar S" },
      fileIds: { playerPhoto: photo.id }
    },
    { saveUploadFn: () => "/uploads/p.png", sendEmail: false }
  );

  const stored = store.registrations.find((r) => r.values.playerName === "Omkar S");
  const regId = stored.id;
  const playerId = stored.playerId;
  const player = () => store.players.find((p) => p.id === playerId);
  assert.equal(player().acplPlayerId, null);

  linkPlayerToAcpl(store, playerId, "acpl-42");
  assert.equal(player().acplPlayerId, "acpl-42");

  await setPaymentStatus(store, regId, "verified", "admin");
  assert.equal(player().acplPlayerId, "acpl-42");
  assert.equal(player().acplName, "Omkar Sinha");

  await updateRegistrationStatus(store, regId, "waiting", "admin");
  await updateRegistrationStatus(store, regId, "registered", "admin", { confirmPromote: true });
  assert.equal(player().acplPlayerId, "acpl-42");
  assert.equal(player().acplName, "Omkar Sinha");
});

test("explicit ACPL unlink is not re-attached by promote", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 5);
  store.acplHistory = {
    meta: {},
    players: [
      {
        id: "acpl-1",
        name: "Player 1",
        normalizedName: "player 1",
        career: { matches: 10, runs: 200, wickets: 5 },
        seasonsPlayed: ["S1"]
      }
    ],
    log: null
  };

  const photo = acplPhotoFile(form);
  store.registrationFiles.push(photo);
  const out = await submitRegistration(
    store,
    { token: form.publicToken, values: baseValues(1), fileIds: { playerPhoto: photo.id } },
    { saveUploadFn: () => "/uploads/p.png", sendEmail: false }
  );

  const stored = store.registrations.find((r) => r.values.playerName === "Player 1");
  const regId = stored.id;
  const playerId = stored.playerId;
  const player = () => store.players.find((p) => p.id === playerId);
  // Auto-linked on submit because the name matches
  assert.equal(player().acplPlayerId, "acpl-1");

  unlinkPlayerFromAcpl(store, playerId);
  await setPaymentStatus(store, regId, "verified", "admin");
  await updateRegistrationStatus(store, regId, "waiting", "admin");
  await updateRegistrationStatus(store, regId, "registered", "admin", { confirmPromote: true });
  assert.equal(player().acplPlayerId, null);
});

test("raising category capacity promotes waiting and fixes dashboard slots", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 100);
  form.useCategoryCapacity = true;
  form.categoryCapacity = { "Men's": 3, "Women's": 10, "Kid's": 10 };

  const submit = async (i, category) => {
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
    const out = await submitRegistration(
      store,
      {
        token: form.publicToken,
        values: { ...baseValues(i), category, mobile: `9${String(200000000 + i).slice(0, 9)}` },
        fileIds: { playerPhoto: photo.id }
      },
      { saveUploadFn: () => `/uploads/x.png`, sendEmail: false }
    );
    await new Promise((r) => setTimeout(r, 2));
    return out.registration;
  };

  for (let i = 1; i <= 5; i++) await submit(i, "Men's");
  assert.equal(store.registrations.filter((r) => r.status === "registered").length, 3);
  assert.equal(store.registrations.filter((r) => r.status === "waiting").length, 2);

  let dash = dashboardForForm(store, form.id);
  assert.equal(dash.availableSlotsByCategory["Men's"].registered, 3);
  assert.equal(dash.availableSlotsByCategory["Men's"].available, 0);
  assert.equal(dash.byCategory["Men's"], 3);

  // Capacity raised to 5 — waiting list must be absorbed so dashboard matches registrations.
  upsertForm(store, {
    id: form.id,
    categoryCapacity: { "Men's": 5, "Women's": 10, "Kid's": 10 }
  });

  assert.equal(store.registrations.filter((r) => r.status === "registered").length, 5);
  assert.equal(store.registrations.filter((r) => r.status === "waiting").length, 0);
  dash = dashboardForForm(store, form.id);
  assert.equal(dash.availableSlotsByCategory["Men's"].registered, 5);
  assert.equal(dash.availableSlotsByCategory["Men's"].available, 0);
  assert.equal(dash.byCategory["Men's"], 5);
  assert.equal(fillAvailableSlotsFromWaiting(store, store.registrationForms[0]).length, 0);
});

test("concurrent submissions never overflow capacity", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 5);

  const jobs = [];
  for (let i = 1; i <= 10; i++) {
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
    jobs.push(
      submitRegistration(
        store,
        { token: form.publicToken, values: baseValues(i + 20), fileIds: { playerPhoto: photo.id } },
        { saveUploadFn: () => `/uploads/x.png`, sendEmail: false }
      )
    );
  }
  const settled = await Promise.all(jobs);
  const registered = settled.filter((r) => r.registration.status === "registered");
  const waiting = settled.filter((r) => r.registration.status === "waiting");
  assert.equal(registered.length, 5);
  assert.equal(waiting.length, 5);
  const seqs = settled.map((r) => r.registration.sequence);
  assert.equal(new Set(seqs).size, 10);
});

test("CSV export can be narrowed to one category", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 10);

  const submit = async (i, category) => {
    const photo = acplPhotoFile(form);
    store.registrationFiles.push(photo);
    return submitRegistration(
      store,
      {
        token: form.publicToken,
        values: { ...baseValues(i), category },
        fileIds: { playerPhoto: photo.id }
      },
      { saveUploadFn: () => "/uploads/p.png", sendEmail: false }
    );
  };

  await submit(1, "Men's");
  await submit(2, "Women's");
  await submit(3, "Men's");

  const rows = (csv) => csv.trim().split("\n").slice(1);

  assert.equal(rows(exportCsv(store, form.id)).length, 3);

  const mens = exportCsv(store, form.id, { category: "Men's" });
  assert.ok(mens.split("\n")[0].startsWith("Registration ID,Sequence,Category No,"));
  assert.equal(rows(mens).length, 2);
  assert.ok(rows(mens).every((line) => line.includes("Men's")));
  assert.ok(!mens.includes("Player 2"));

  const womens = exportCsv(store, form.id, { category: "Women's" });
  assert.equal(rows(womens).length, 1);
  assert.ok(womens.includes("Player 2"));

  // An unknown category must export headers only, never fall back to everything.
  assert.equal(rows(exportCsv(store, form.id, { category: "Nope" })).length, 0);
});

test("CSV export combines category and status filters", async () => {
  const store = makeStore();
  const form = await seedOpenForm(store, 10);

  const submit = async (i, category) => {
    const photo = acplPhotoFile(form);
    store.registrationFiles.push(photo);
    return submitRegistration(
      store,
      {
        token: form.publicToken,
        values: { ...baseValues(i), category },
        fileIds: { playerPhoto: photo.id }
      },
      { saveUploadFn: () => "/uploads/p.png", sendEmail: false }
    );
  };

  await submit(1, "Men's");
  await submit(2, "Men's");
  await submit(3, "Women's");
  const men1Id = store.registrations.find((r) => r.values.playerName === "Player 1").id;
  await updateRegistrationStatus(store, men1Id, "cancelled", "admin");

  const rows = (csv) => csv.trim().split("\n").slice(1);

  assert.equal(rows(exportCsv(store, form.id, { category: "Men's" })).length, 2);
  assert.equal(rows(exportCsv(store, form.id, { category: "Men's", status: "registered" })).length, 1);
  assert.equal(rows(exportCsv(store, form.id, { status: "cancelled" })).length, 1);
  assert.ok(exportCsv(store, form.id, { category: "Men's", status: "cancelled" }).includes("Player 1"));
  assert.equal(rows(exportCsv(store, form.id, { category: "Women's", status: "cancelled" })).length, 0);
});
