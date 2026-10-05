#!/usr/bin/env node
/**
 * Insert missing ACPL6 registrations from Men's CSV + Women's/Kid's recovery lists.
 * NEVER modifies or deletes existing registrations / players / config.
 */
import fs from "fs";
import { randomUUID } from "crypto";

const STORE_PATH = process.argv[2] || "/tmp/prod-store.json";
const OUT_PATH = process.argv[3] || "/tmp/prod-store.restored.json";
const MEN_CSV = process.argv[4] || "/home/ubuntu/.cursor/projects/workspace/uploads/REG-ACPL6-Mens_654b.csv";

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.length);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Simple CSV split — Men's export has no quoted commas in practice
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function uid(store) {
  const used = new Set([
    ...(store.registrations || []).map((r) => r.id),
    ...(store.players || []).map((p) => p.id),
    ...(store.registrationFiles || []).map((f) => f.id)
  ]);
  let id;
  do {
    id = randomUUID().slice(0, 8);
  } while (used.has(id));
  used.add(id);
  return id;
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function normalizePlayerNameKey(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mapRoleFromValues(values) {
  if (values.playerType === "Batter") return "Batsman";
  if (values.playerType === "Bowler") return "Bowler";
  if (values.playerType === "All-rounder") return "All-Rounder";
  if (values.wicketkeeper === "Yes") return "Wicketkeeper";
  return "Player";
}

function resolveCategoryId(store, categoryLabel) {
  const label = String(categoryLabel || "").toLowerCase().replace(/['’]/g, "");
  const found = (store.categories || []).find((c) => {
    const n = String(c.name || "")
      .toLowerCase()
      .replace(/['’]/g, "");
    return n === label || n === label.replace(/s$/, "") || `${n}s` === label || n.startsWith(label.slice(0, 3));
  });
  return found?.id || store.categories[0]?.id;
}

function findOrCreatePlayer(store, form, values, { attachToTournament }) {
  const phone = normalizePhone(values.mobile);
  const name = String(values.playerName || "").trim();
  const nameKey = normalizePlayerNameKey(name);
  let player =
    (nameKey && (store.players || []).find((p) => normalizePlayerNameKey(p.name) === nameKey)) ||
    (phone && (store.players || []).find((p) => normalizePhone(p.phone) === phone)) ||
    null;

  const categoryId = resolveCategoryId(store, values.category);
  const tournament = store.tournaments.find((t) => t.id === form.tournamentId);

  if (!player) {
    player = {
      assignment: "auction",
      sport: tournament?.sport || "Cricket",
      id: uid(store),
      name,
      photo: "",
      role: mapRoleFromValues(values),
      categoryId,
      basePrice: null,
      phone: phone || "",
      teamId: null,
      tournamentIds: [],
      registrationMeta: {
        category: values.category || "",
        dob: values.dob || "",
        jerseyName: "",
        jerseyNumber: "",
        playerType: values.playerType || "",
        battingHand: "",
        bowlingHand: "",
        auctionTeam: values.auctionTeam || ""
      },
      acplPlayerId: null,
      acplName: null
    };
    store.players.push(player);
  } else {
    if (phone && !player.phone) player.phone = phone;
  }

  // Match live data: only Men's registered players are on the tournament roster
  if (attachToTournament && tournament && values.category === "Men's") {
    const tids = new Set(player.tournamentIds || []);
    tids.add(form.tournamentId);
    player.tournamentIds = [...tids];
    if (!Array.isArray(tournament.playerIds)) tournament.playerIds = [];
    if (!tournament.playerIds.includes(player.id)) tournament.playerIds.push(player.id);
  }

  return player;
}

function recomputeWaitingPositions(store, form) {
  if (form.useCategoryCapacity) {
    const byCat = new Map();
    for (const r of store.registrations || []) {
      if (r.formId !== form.id || r.status !== "waiting") continue;
      const c = r.values?.category || "_";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(r);
    }
    for (const rows of byCat.values()) {
      rows
        .sort((a, b) => (Number(a.registeredAt) || 0) - (Number(b.registeredAt) || 0))
        .forEach((r, i) => {
          r.waitingPosition = i + 1;
        });
    }
  } else {
    (store.registrations || [])
      .filter((r) => r.formId === form.id && r.status === "waiting")
      .sort((a, b) => (Number(a.registeredAt) || 0) - (Number(b.registeredAt) || 0))
      .forEach((r, i) => {
        r.waitingPosition = i + 1;
      });
  }
}

function audit(store, registrationId, action, oldValue, newValue, performedBy) {
  store.registrationAudits = store.registrationAudits || [];
  store.registrationAudits.push({
    id: uid(store),
    registrationId,
    action,
    oldValue,
    newValue,
    performedBy,
    at: Date.now()
  });
}

function insertRegistration(store, form, {
  registrationId,
  categorySequence,
  registeredAt,
  status,
  paymentStatus,
  waitingPosition,
  values
}) {
  const existing = (store.registrations || []).find((r) => r.registrationId === registrationId);
  if (existing) {
    return { skipped: true, registrationId };
  }

  const attachToTournament = status === "registered";
  const player = findOrCreatePlayer(store, form, values, { attachToTournament });

  const registration = {
    id: uid(store),
    registrationId,
    tournamentId: form.tournamentId,
    formId: form.id,
    formVersion: form.version,
    playerId: player.id,
    registrationSequence: categorySequence,
    sequence: categorySequence,
    categorySequence,
    registeredAt,
    status,
    waitingPosition: status === "waiting" ? waitingPosition ?? null : null,
    paymentStatus: paymentStatus || "pending",
    values,
    fileIds: {},
    createdAt: registeredAt,
    updatedAt: registeredAt
  };
  store.registrations.push(registration);

  audit(store, registration.id, "restored_missing", null, {
    registrationId,
    status,
    source: "csv_or_screenshot_recovery"
  }, "admin-recovery");

  return { skipped: false, registrationId, id: registration.id, playerId: player.id };
}

// --- Sources ---
const womenMissing = [
  { seq: 16, name: "Garima", email: "hellogarima14@gmail.com", at: 1790687399000 },
  { seq: 17, name: "Neha Gade", email: "nehabansode@gmail.com", at: 1790692238000 },
  { seq: 18, name: "Sneha Deepak Bagde", email: "sdbagde66@gmail.com", at: 1790697122000 },
  { seq: 19, name: "Pournima Rohanekar", email: "rohanekarchandan@gmail.com", at: 1790697814000 },
  { seq: 20, name: "Anju Kumari", email: "anjukumari.kumari0@gmail.com", at: 1790698449000 },
  { seq: 21, name: "Kinjal Bhayani", email: "kinjalchandarana@gmail.com", at: 1790701778000 },
  { seq: 22, name: "Sindhuja Sudhir", email: "sindhuja.sudhir@gmail.com", at: 1790781301000 },
  { seq: 23, name: "Pooja Santosh Shinde", email: "pooja9walunj@gmail.com", at: 1790829270000 },
  { seq: 24, name: "apeksha ghate", email: "ghateapeksha@gmail.com", at: 1790836943000 },
  { seq: 25, name: "Dipti Patil", email: "diptidayanandpatil@gmail.com", at: 1790852579000 },
  { seq: 26, name: "Pooja Patil", email: "deshmukhpallavi1642@gmail.com", at: 1790925089000 },
  { seq: 27, name: "HARSHADA VINAY BHALSHANKAR", email: "bhanushali.hnb@gmail.com", at: 1790928457000 },
  { seq: 28, name: "Shruti Patil", email: "sap2790@gmail.com", at: 1790933086000 },
  { seq: 29, name: "Ruchi More", email: "r.ruchi0606@gmail.com", at: 1790933430000 },
  { seq: 30, name: "Priyanka Mistry", email: "sakhardande.priyanka@eclerx.com", at: 1790952286000, paymentStatus: "verified" }
];

const kidsMissing = [
  { seq: 12, name: "Ok", email: "ok@ok.com", at: 1790688494000 },
  { seq: 13, name: "Srujan Jadhav", email: "srujan.jadhav2015@gmail.com", at: 1790752785000 },
  { seq: 14, name: "Urvil Jadhav", email: "urvil.jadhav2017@gmail.com", at: 1790753029000 },
  { seq: 15, name: "Aahansh Ghamande", email: "ghamandeashwin.1@gmail.com", at: 1790842201000 },
  { seq: 16, name: "Gaurang Nayyar", email: "nayyarp60@gmail.com", at: 1790862747000 },
  { seq: 17, name: "Arnav Shailesh Pardikar", email: "pardikar.anamika@gmail.com", at: 1790920190000 },
  { seq: 18, name: "Shourya Awalgaonkar", email: "suchit1401@gmail.com", at: 1790939810000 },
  { seq: 19, name: "Shounak Ashtaputre", email: "sandeepashtaputr@gmail.com", at: 1790951873000 },
  { seq: 20, name: "Aaryan Pandit", email: "amitd1642@gmail.com", at: 1790960616000 },
  { seq: 21, name: "Atharv Ghanate", email: "sushmadr12@gmail.com", at: 1790961621000 },
  { seq: 22, name: "Gaurang Deshpande", email: "nikhildeshpande80@gmail.com", at: 1790962120000 },
  { seq: 23, name: "Shalmali Deshpande", email: "aartideshpande82@gmail.com", at: 1790988515000 }
];

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const form = (store.registrationForms || []).find((f) => f.id === "d862ec1b") || store.registrationForms[0];
if (!form) throw new Error("Registration form not found");

const before = {
  total: store.registrations.length,
  ids: new Set(store.registrations.map((r) => r.registrationId)),
  players: store.players.length,
  snapshot: JSON.stringify(store.registrations)
};

const results = { added: [], skipped: [] };

// Men's from CSV — only missing IDs
const menCsv = parseCsv(fs.readFileSync(MEN_CSV, "utf8"));
for (const row of menCsv) {
  const registrationId = String(row["Registration ID"] || "").trim();
  if (!registrationId) continue;
  if (before.ids.has(registrationId)) {
    results.skipped.push(registrationId);
    continue;
  }
  const seq = Number(row["Category No"] || row.Sequence) || 0;
  const registeredAt = Date.parse(row["Registered At"]) || Date.now();
  const status = String(row["Registration Status"] || "registered").trim() || "registered";
  const paymentStatus = String(row["Payment Status"] || "pending").trim() || "pending";
  const waitingPosition = row["Waiting Position"] ? Number(row["Waiting Position"]) : null;
  const values = {
    playerName: row["Player Name"] || "",
    mobile: String(row.Mobile || "").trim(),
    email: "", // CSV export lacks email; journal has some
    dob: row["Date of Birth"] || "",
    category: "Men's",
    jerseyNameNumber: row["Jersey Name/Number"] || "",
    jerseySize: row["Jersey Size"] || "",
    playerType: row["Player Type"] || "",
    battingStyle: row["Batting Style"] || "",
    bowlingStyle: row["Bowling Style"] || "",
    wicketkeeper: row.Wicketkeeper || "",
    cricHeroesHas: row.CricHeroes === "No" || row.CricHeroes === "Yes" ? row.CricHeroes : row.CricHeroes ? "Yes" : "",
    cricHeroesProfile: row.CricHeroes && row.CricHeroes !== "No" && row.CricHeroes !== "Yes" ? row.CricHeroes : "",
    auctionTeam: row["Auction Team"] || "",
    arcusRelation: row["Arcus Relationship"] || "",
    paymentPreference: row["Payment Preference"] || ""
  };
  // Fill emails from journal where known
  const menEmails = {
    "REG-ACPL6-MEN-0064": "tushar.h.saykar@gmail.com",
    "REG-ACPL6-MEN-0065": "suraj@irajrobotics.com",
    "REG-ACPL6-MEN-0066": "gauravmishragm@gmail.com"
  };
  if (menEmails[registrationId]) values.email = menEmails[registrationId];

  // Drop empty optional keys to keep values tidy
  for (const k of Object.keys(values)) {
    if (values[k] === "") delete values[k];
  }
  values.playerName = row["Player Name"] || "";
  values.category = "Men's";
  if (row.Mobile) values.mobile = String(row.Mobile).trim();

  const res = insertRegistration(store, form, {
    registrationId,
    categorySequence: seq,
    registeredAt,
    status,
    paymentStatus,
    waitingPosition,
    values
  });
  if (res.skipped) results.skipped.push(registrationId);
  else results.added.push(res);
}

for (const w of womenMissing) {
  const registrationId = `REG-ACPL6-WOMEN-${String(w.seq).padStart(4, "0")}`;
  if (before.ids.has(registrationId)) {
    results.skipped.push(registrationId);
    continue;
  }
  const res = insertRegistration(store, form, {
    registrationId,
    categorySequence: w.seq,
    registeredAt: w.at,
    status: "registered",
    paymentStatus: "pending",
    waitingPosition: null,
    values: {
      playerName: w.name,
      email: w.email,
      category: "Women's",
      paymentPreference: "UPI"
    }
  });
  if (res.skipped) results.skipped.push(registrationId);
  else results.added.push(res);
}

for (const k of kidsMissing) {
  const registrationId = `REG-ACPL6-KIDS-${String(k.seq).padStart(4, "0")}`;
  if (before.ids.has(registrationId)) {
    results.skipped.push(registrationId);
    continue;
  }
  const res = insertRegistration(store, form, {
    registrationId,
    categorySequence: k.seq,
    registeredAt: k.at,
    status: "registered",
    paymentStatus: "pending",
    waitingPosition: null,
    values: {
      playerName: k.name,
      email: k.email,
      category: "Kid's",
      paymentPreference: "UPI"
    }
  });
  if (res.skipped) results.skipped.push(registrationId);
  else results.added.push(res);
}

// Recompute waiting positions only (does not alter non-waiting rows' identity/data beyond waitingPosition)
recomputeWaitingPositions(store, form);

store.meta = store.meta || {};
store.meta.updatedAt = Date.now();

// Safety: existing registration payloads unchanged
const afterById = new Map(store.registrations.map((r) => [r.registrationId, r]));
for (const id of before.ids) {
  const prev = JSON.parse(before.snapshot).find((r) => r.registrationId === id);
  const next = afterById.get(id);
  // waitingPosition may be recomputed for waiting rows — compare without that field for waiting
  const strip = (r) => {
    const c = { ...r };
    if (c.status === "waiting") delete c.waitingPosition;
    return c;
  };
  if (JSON.stringify(strip(prev)) !== JSON.stringify(strip(next))) {
    // Allow waitingPosition-only changes on waiting rows
    const p2 = { ...prev };
    const n2 = { ...next };
    delete p2.waitingPosition;
    delete n2.waitingPosition;
    if (JSON.stringify(p2) !== JSON.stringify(n2)) {
      throw new Error(`Existing registration mutated: ${id}`);
    }
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(store, null, 2));

const byCat = {};
for (const r of store.registrations) {
  const c = r.values?.category || "?";
  byCat[c] = (byCat[c] || 0) + 1;
}

console.log(JSON.stringify({
  beforeTotal: before.total,
  afterTotal: store.registrations.length,
  playersBefore: before.players,
  playersAfter: store.players.length,
  added: results.added.map((a) => a.registrationId),
  addedCount: results.added.length,
  skippedExisting: results.skipped.length,
  byCategory: byCat,
  menWaiting: store.registrations
    .filter((r) => r.values?.category === "Men's" && r.status === "waiting")
    .map((r) => ({ id: r.registrationId, pos: r.waitingPosition })),
  out: OUT_PATH
}, null, 2));
