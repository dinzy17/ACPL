import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { uid, saveUpload } from "./store.mjs";
import { buildAcplSeason6Form, blankRegistrationForm, normalizePublicSlug, suggestPublicSlug } from "./registration-template-acpl6.mjs";
import { findAcplPlayer } from "./acpl.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE_UPLOAD_DIR = path.join(__dirname, "..", "data", "private-uploads");

let chain = Promise.resolve();

/** Serialize critical registration mutations in-process. */
export function withRegLock(fn) {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function ensureCollections(store) {
  store.registrationForms ||= [];
  store.registrations ||= [];
  store.registrationFiles ||= [];
  store.registrationAudits ||= [];
  store.meta ||= {};
  if (!store.meta.regFileSecret) store.meta.regFileSecret = randomBytes(32).toString("hex");
}

export function migrateRegistration(store) {
  ensureCollections(store);
  store.tournaments = (store.tournaments || []).map((t) => ({
    logo: "",
    ...t,
    logo: t.logo || ""
  }));
  store.registrationForms = (store.registrationForms || []).map((f) => {
    const tournament = (store.tournaments || []).find((t) => t.id === f.tournamentId);
    let publicSlug = normalizePublicSlug(f.publicSlug);
    if (!publicSlug) publicSlug = suggestPublicSlug(tournament, { idPrefix: f.idPrefix });
    // Ensure uniqueness among forms
    const taken = new Set(
      (store.registrationForms || [])
        .filter((x) => x.id !== f.id)
        .map((x) => String(x.publicSlug || "").toLowerCase())
        .filter(Boolean)
    );
    let candidate = publicSlug;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${publicSlug}-${n++}`.slice(0, 64);
    }

    // Ensure Email ID field exists on player section
    let fields = [...(f.fields || [])];
    if (!fields.some((x) => x.key === "email")) {
      const mobileIdx = fields.findIndex((x) => x.key === "mobile");
      const emailField = {
        id: uid(),
        key: "email",
        sectionKey: "player",
        label: "Email ID",
        fieldType: "email",
        required: true,
        enabled: true,
        displayOrder: 25,
        placeholder: "you@example.com",
        options: [],
        validation: {},
        config: {}
      };
      if (mobileIdx >= 0) fields.splice(mobileIdx + 1, 0, emailField);
      else fields.push(emailField);
    }

    // Patch bowlingStyle rules: hide when player type is Batter
    let rules = [...(f.rules || [])];
    const bowlingRules = rules.filter((r) => r.targetKey === "bowlingStyle");
    const hasBatterGuard = bowlingRules.some(
      (r) => r.sourceKey === "playerType" && (r.operator === "notEquals" || r.value === "Bowler" || r.value === "All-rounder")
    );
    if (bowlingRules.length && !hasBatterGuard) {
      rules = rules.filter((r) => r.targetKey !== "bowlingStyle");
      rules.push(
        {
          id: uid(),
          sourceKey: "firstTimeAcpl",
          operator: "equals",
          value: "Yes",
          targetKey: "bowlingStyle",
          action: "show",
          makeRequired: true,
          groupId: "bowling-bowler"
        },
        {
          id: uid(),
          sourceKey: "playerType",
          operator: "equals",
          value: "Bowler",
          targetKey: "bowlingStyle",
          action: "show",
          makeRequired: true,
          groupId: "bowling-bowler"
        },
        {
          id: uid(),
          sourceKey: "firstTimeAcpl",
          operator: "equals",
          value: "Yes",
          targetKey: "bowlingStyle",
          action: "show",
          makeRequired: true,
          groupId: "bowling-ar"
        },
        {
          id: uid(),
          sourceKey: "playerType",
          operator: "equals",
          value: "All-rounder",
          targetKey: "bowlingStyle",
          action: "show",
          makeRequired: true,
          groupId: "bowling-ar"
        }
      );
    }

    return { ...f, publicSlug: candidate, fields, rules };
  });

  dedupePlayersByName(store);
  // If capacity was raised while people sat on the waiting list, promote them now.
  for (const form of store.registrationForms || []) {
    fillAvailableSlotsFromWaiting(store, form, { performedBy: "system" });
  }
  return store;
}

function audit(store, registrationId, action, oldValue, newValue, performedBy) {
  store.registrationAudits.push({
    id: uid(),
    registrationId,
    action,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    performedBy: performedBy || "system",
    performedAt: Date.now()
  });
}

export function compareOp(operator, left, right) {
  const L = left == null ? "" : String(left);
  const R = right == null ? "" : String(right);
  switch (operator) {
    case "equals":
      return L === R;
    case "notEquals":
      return L !== R;
    case "contains":
      return L.toLowerCase().includes(R.toLowerCase());
    case "doesNotContain":
      return !L.toLowerCase().includes(R.toLowerCase());
    case "greaterThan":
      return Number(L) > Number(R);
    case "lessThan":
      return Number(L) < Number(R);
    case "isEmpty":
      return L.trim() === "";
    case "isNotEmpty":
      return L.trim() !== "";
    default:
      return false;
  }
}

function ruleMatches(rule, values) {
  if (rule.alsoRequireSource) {
    const src = values[rule.alsoRequireSource.key];
    if (String(src) !== String(rule.alsoRequireSource.value)) return false;
  }
  return compareOp(rule.operator, values[rule.sourceKey], rule.value);
}

/** Visibility + required overrides from conditional rules. */
export function evaluateFieldState(form, values) {
  const fields = (form.fields || []).filter((f) => f.enabled !== false && f.fieldType !== "section");
  const rules = form.rules || [];
  const targets = new Set(rules.map((r) => r.targetKey));
  const visible = {};
  const required = {};

  for (const f of fields) {
    const isTarget = targets.has(f.key);
    visible[f.key] = isTarget ? false : true;
    required[f.key] = !!f.required;
  }

  // Group rules by target; within a group OR of matching groups named, default AND for same target
  const byTarget = new Map();
  for (const r of rules) {
    if (!byTarget.has(r.targetKey)) byTarget.set(r.targetKey, []);
    byTarget.get(r.targetKey).push(r);
  }

  for (const [targetKey, list] of byTarget) {
    const groups = new Map();
    for (const r of list) {
      const g = r.groupId || r.group || "default";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    // OR across groups, AND within group
    let show = false;
    let makeReq = false;
    for (const [, groupRules] of groups) {
      const allMatch = groupRules.every((r) => ruleMatches(r, values));
      if (allMatch) {
        show = true;
        if (groupRules.some((r) => r.makeRequired || r.action === "require")) makeReq = true;
      }
    }
    if (show) {
      visible[targetKey] = true;
      if (makeReq) required[targetKey] = true;
    } else {
      visible[targetKey] = false;
      required[targetKey] = false;
    }
  }

  return { visible, required };
}

export function detectCircularRules(form) {
  const edges = new Map();
  for (const r of form.rules || []) {
    if (!edges.has(r.targetKey)) edges.set(r.targetKey, new Set());
    edges.get(r.targetKey).add(r.sourceKey);
  }
  const visiting = new Set();
  const visited = new Set();
  const cycle = [];

  function dfs(node) {
    if (visiting.has(node)) {
      cycle.push(node);
      return true;
    }
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) || []) {
      if (dfs(next)) {
        cycle.push(node);
        return true;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const key of edges.keys()) {
    if (dfs(key)) return { ok: false, cycle: [...new Set(cycle)].reverse() };
  }
  return { ok: true };
}

export function validateFormForOpen(form) {
  const errors = [];
  if (!String(form.title || "").trim()) errors.push("Form title is required");
  const enabled = (form.fields || []).filter((f) => f.enabled !== false && f.fieldType !== "section" && f.fieldType !== "info");
  if (!enabled.length) errors.push("At least one enabled field is required");
  if (!(Number(form.capacity) > 0)) errors.push("Capacity must be greater than 0");
  const circ = detectCircularRules(form);
  if (!circ.ok) errors.push(`Circular conditional rules: ${circ.cycle.join(" → ")}`);
  const paymentFields = enabled.some((f) => ["paymentPreference", "bankProof", "upiProof"].includes(f.key));
  if (paymentFields) {
    const bank = form.payment?.bank || {};
    const upi = form.payment?.upi || {};
    if (!bank.accountNumber && !upi.upiId) {
      errors.push("Configure bank or UPI payment details before opening");
    }
  }
  const catField = (form.fields || []).find((f) => f.key === "category" && f.enabled !== false);
  if (catField && !(catField.options || []).length) errors.push("Category options are required");
  return errors;
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function isValidMobile10(raw) {
  const phone = normalizePhone(raw);
  return /^[6-9]\d{9}$/.test(phone) && phone.length === 10;
}

function ageFromDob(dob, at = new Date()) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) age -= 1;
  return age;
}

export function validateSubmission(form, values, fileIds) {
  const errors = {};
  const { visible, required } = evaluateFieldState(form, values);
  const fields = (form.fields || []).filter((f) => f.enabled !== false);

  for (const f of fields) {
    if (f.fieldType === "section" || f.fieldType === "info") continue;
    if (!visible[f.key]) continue;
    const isFile = f.fieldType === "file" || f.fieldType === "image";
    const val = isFile ? fileIds?.[f.key] : values?.[f.key];
    const empty =
      val == null ||
      val === "" ||
      (Array.isArray(val) && !val.length);

    if (required[f.key] && empty) {
      errors[f.key] = `${f.label || f.key} is required`;
      continue;
    }
    if (empty) continue;

    if (f.fieldType === "phone") {
      const phone = normalizePhone(val);
      if (phone.length !== 10) {
        errors[f.key] = "Mobile number must be exactly 10 digits";
      } else if (!isValidMobile10(phone)) {
        errors[f.key] = f.validation?.message || "Enter a valid 10-digit Indian mobile number";
      }
    }
    if (f.fieldType === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) errors[f.key] = "Invalid email";
    }
    if ((f.fieldType === "dropdown" || f.fieldType === "single") && (f.options || []).length) {
      if (!(f.options || []).includes(String(val))) errors[f.key] = "Invalid option";
    }
  }

  const dob = values.dob;
  const category = values.category;
  if (dob && category && form.ageRules?.[category]) {
    const age = ageFromDob(dob);
    const rule = form.ageRules[category];
    if (age != null) {
      if (rule.min != null && age < rule.min) errors.dob = `Minimum age for ${category} is ${rule.min}`;
      if (rule.max != null && age > rule.max) errors.dob = `Maximum age for ${category} is ${rule.max}`;
    }
  }

  return { ok: !Object.keys(errors).length, errors, visible, required };
}

/** Parse form schedule datetimes. Naive values (from datetime-local) are treated as IST. */
export function parseFormDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  // Already has timezone or Z
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const t = new Date(raw).getTime();
    return t;
  }
  // date only
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const iso = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+05:30`;
    return new Date(iso).getTime();
  }
  // datetime-local: YYYY-MM-DDTHH:mm or with seconds
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const sec = m[6] || "00";
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${sec}+05:30`;
    return new Date(iso).getTime();
  }
  return new Date(raw).getTime();
}

export function formIsAccepting(form, now = Date.now()) {
  if (form.status !== "open") {
    if (form.status === "draft") {
      return { ok: false, reason: "draft", message: "Registration for this tournament is currently closed." };
    }
    return { ok: false, reason: "closed", message: "Registration for this tournament is currently closed." };
  }
  if (form.opensAt) {
    const t = parseFormDateTime(form.opensAt);
    if (!Number.isNaN(t) && now < t) {
      return { ok: false, reason: "not_started", message: "Registration has not started yet." };
    }
  }
  if (form.closesAt) {
    const t = parseFormDateTime(form.closesAt);
    if (!Number.isNaN(t) && now > t) {
      return { ok: false, reason: "ended", message: "Registration is closed." };
    }
  }
  return { ok: true };
}

function activeStatuses() {
  return new Set(["registered", "waiting", "submitted", "under_review", "approved"]);
}

function findDuplicate(store, form, mobile, name) {
  const phone = normalizePhone(mobile);
  const active = activeStatuses();
  return (store.registrations || []).find((r) => {
    if (r.tournamentId !== form.tournamentId) return false;
    if (!active.has(r.status)) return false;
    const m = normalizePhone(r.values?.mobile);
    if (m && phone && m === phone) return r;
    return false;
  });
}

function nextSequence(store, tournamentId) {
  const seqs = (store.registrations || []).filter((r) => r.tournamentId === tournamentId).map((r) => r.sequence || 0);
  return (seqs.length ? Math.max(...seqs) : 0) + 1;
}

function formatRegId(prefix, sequence) {
  const p = String(prefix || "REG").replace(/-+$/, "");
  return `${p}-${String(sequence).padStart(4, "0")}`;
}

function categoryKey(values) {
  return String(values?.category || "").trim();
}

/** Short code for registration IDs: Men's → MEN, Women's → WOMEN, Kid's → KIDS */
export function categoryCode(category) {
  const s = String(category || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z]/g, "");
  if (s.startsWith("men")) return "MEN";
  if (s.startsWith("women")) return "WOMEN";
  if (s.startsWith("kid")) return "KIDS";
  return (s.slice(0, 6) || "CAT").toUpperCase();
}

function formatCategoryRegId(prefix, category, sequence) {
  const p = String(prefix || "REG").replace(/-+$/, "");
  const code = categoryCode(category);
  return `${p}-${code}-${String(sequence).padStart(4, "0")}`;
}

/** Statuses that can hold a category registration number. */
function numberedStatuses() {
  return new Set(["registered", "waiting", "approved", "under_review"]);
}

function holdsCategoryNumber(r) {
  return numberedStatuses().has(r.status) && Number(r.categorySequence || r.sequence) > 0;
}

/**
 * New submissions get max+1 within the category (order of signup / timestamp).
 * Promote does not change numbers.
 */
export function assignNextCategorySequence(store, form, registration) {
  const cat = categoryKey(registration.values);
  const existing = (store.registrations || []).filter(
    (r) => r.formId === form.id && r.id !== registration.id && categoryKey(r.values) === cat && holdsCategoryNumber(r)
  );
  const max = existing.reduce((m, r) => Math.max(m, Number(r.categorySequence || r.sequence) || 0), 0);
  const n = max + 1;
  registration.categorySequence = n;
  registration.sequence = n;
  registration.registrationSequence = n;
  registration.registrationId = formatCategoryRegId(form.idPrefix, cat, n);
  return n;
}

/** After a registration leaves the numbered set, decrement later numbers in that category. */
export function decrementCategorySequencesAfter(store, form, category, removedSequence) {
  const removed = Number(removedSequence) || 0;
  if (!removed) return;
  for (const r of store.registrations || []) {
    if (r.formId !== form.id) continue;
    if (categoryKey(r.values) !== category) continue;
    if (!holdsCategoryNumber(r)) continue;
    const n = Number(r.categorySequence || r.sequence) || 0;
    if (n > removed) {
      const next = n - 1;
      r.categorySequence = next;
      r.sequence = next;
      r.registrationSequence = next;
      r.registrationId = formatCategoryRegId(form.idPrefix, category, next);
    }
  }
}

function clearCategoryNumber(registration) {
  registration.categorySequence = 0;
  registration.sequence = 0;
  registration.registrationSequence = 0;
}

/** Full rebuild by registeredAt — repair / re-promote. */
export function recomputeCategorySequences(store, form, category = null) {
  ensureCollections(store);
  const cats = new Set();
  if (category != null && category !== "") cats.add(category);
  else {
    for (const r of store.registrations || []) {
      if (r.formId !== form.id) continue;
      cats.add(categoryKey(r.values) || "");
    }
  }
  for (const cat of cats) {
    const rows = (store.registrations || [])
      .filter(
        (r) =>
          r.formId === form.id &&
          categoryKey(r.values) === cat &&
          numberedStatuses().has(r.status)
      )
      .sort((a, b) => {
        const ta = Number(a.registeredAt) || 0;
        const tb = Number(b.registeredAt) || 0;
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id));
      });
    rows.forEach((r, i) => {
      const n = i + 1;
      r.categorySequence = n;
      r.sequence = n;
      r.registrationSequence = n;
      r.registrationId = formatCategoryRegId(form.idPrefix, cat, n);
    });
  }
}

function countRegistered(store, form, category = null) {
  return (store.registrations || []).filter((r) => {
    if (r.formId !== form.id) return false;
    if (r.status !== "registered") return false;
    if (category != null) return categoryKey(r.values) === category;
    return true;
  }).length;
}

function capacityLimit(form, category) {
  if (form.useCategoryCapacity && category && form.categoryCapacity?.[category] != null) {
    return Number(form.categoryCapacity[category]);
  }
  return Number(form.capacity) || 0;
}

function recomputeWaitingPositions(store, form) {
  const waiting = (store.registrations || [])
    .filter((r) => r.formId === form.id && r.status === "waiting")
    .sort((a, b) => {
      const ta = Number(a.registeredAt) || 0;
      const tb = Number(b.registeredAt) || 0;
      if (ta !== tb) return ta - tb;
      return (a.sequence || 0) - (b.sequence || 0);
    });

  if (form.useCategoryCapacity) {
    const byCat = new Map();
    for (const r of waiting) {
      const c = categoryKey(r.values) || "_";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(r);
    }
    for (const [, list] of byCat) {
      list.forEach((r, i) => {
        r.waitingPosition = i + 1;
      });
    }
  } else {
    waiting.forEach((r, i) => {
      r.waitingPosition = i + 1;
    });
  }
}

function mapRoleFromValues(values) {
  if (values.playerType === "Batter") return "Batsman";
  if (values.playerType === "Bowler") return "Bowler";
  if (values.playerType === "All-rounder") return "All-Rounder";
  if (values.wicketkeeper === "Yes") return "Wicketkeeper";
  return "Player";
}

function normalizePlayerNameKey(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

/**
 * Find existing player by phone or normalized name.
 * Name match reuses the existing entry (photo-only update); never creates a duplicate.
 */
function findOrCreatePlayer(store, form, values, fileMeta, { attachToTournament = false, linkAcpl = false } = {}) {
  const phone = normalizePhone(values.mobile);
  const name = String(values.playerName || "").trim();
  const nameKey = normalizePlayerNameKey(name);

  let player =
    (nameKey && (store.players || []).find((p) => normalizePlayerNameKey(p.name) === nameKey)) ||
    (phone && (store.players || []).find((p) => normalizePhone(p.phone) === phone)) ||
    null;

  const categoryId = resolveCategoryId(store, values.category);
  const tournament = store.tournaments.find((t) => t.id === form.tournamentId);
  const photoUrl = fileMeta?.publicPhotoUrl || "";

  if (player) {
    // Existing player: only refresh photo from registration (latest upload wins)
    if (photoUrl) player.photo = photoUrl;
    if (phone && !player.phone) player.phone = phone;
    // Keep name casing from the first/canonical player entry
  } else {
    player = {
      id: uid(),
      name,
      photo: photoUrl || "",
      role: mapRoleFromValues(values),
      categoryId,
      sport: tournament?.sport || "Cricket",
      // No default base price — admin sets it later
      basePrice: null,
      phone: phone || "",
      teamId: null,
      assignment: "auction",
      tournamentIds: [],
      registrationMeta: {
        category: values.category || "",
        dob: values.dob || "",
        jerseyName: values.jerseyName || values.jersey || "",
        jerseyNumber: values.jerseyNumber || "",
        playerType: values.playerType || "",
        battingHand: values.battingHand || "",
        bowlingHand: values.bowlingHand || "",
        auctionTeam: values.auctionTeam || ""
      }
    };
    store.players.push(player);
  }

  if (attachToTournament && tournament) {
    const tids = new Set(player.tournamentIds || []);
    tids.add(form.tournamentId);
    player.tournamentIds = [...tids];
    if (!Array.isArray(tournament.playerIds)) tournament.playerIds = [];
    if (!tournament.playerIds.includes(player.id)) tournament.playerIds.push(player.id);
  }

  if (linkAcpl) {
    linkPlayerAcplStats(store, player);
  }

  return player;
}

/** Merge duplicate players that share the same normalized name (keep oldest / richest). */
export function dedupePlayersByName(store) {
  ensureCollections(store);
  const byName = new Map();
  const removeIds = new Set();
  for (const p of store.players || []) {
    const key = normalizePlayerNameKey(p.name);
    if (!key) continue;
    if (!byName.has(key)) {
      byName.set(key, p);
      continue;
    }
    const keep = byName.get(key);
    const drop = p;
    // Prefer entry that already has base price / more tournament links
    const keepScore =
      (Number.isFinite(Number(keep.basePrice)) ? 2 : 0) + (keep.tournamentIds?.length || 0) + (keep.photo ? 1 : 0);
    const dropScore =
      (Number.isFinite(Number(drop.basePrice)) ? 2 : 0) + (drop.tournamentIds?.length || 0) + (drop.photo ? 1 : 0);
    let winner = keep;
    let loser = drop;
    if (dropScore > keepScore) {
      winner = drop;
      loser = keep;
      byName.set(key, winner);
    }
    // Merge useful fields onto winner — prefer later entry's photo (registration upload)
    if (drop.photo) winner.photo = drop.photo;
    else if (loser.photo && !winner.photo) winner.photo = loser.photo;
    if (loser.phone && !winner.phone) winner.phone = loser.phone;
    if (keep.phone && !winner.phone) winner.phone = keep.phone;
    if (loser.acplPlayerId && !winner.acplPlayerId) {
      winner.acplPlayerId = loser.acplPlayerId;
      winner.acplName = loser.acplName;
      winner.acplLinkSource = loser.acplLinkSource;
    }
    if (keep.acplPlayerId && !winner.acplPlayerId) {
      winner.acplPlayerId = keep.acplPlayerId;
      winner.acplName = keep.acplName;
      winner.acplLinkSource = keep.acplLinkSource;
    }
    if (Number.isFinite(Number(loser.basePrice)) && !Number.isFinite(Number(winner.basePrice))) {
      winner.basePrice = loser.basePrice;
    }
    // Never invent a base price during dedupe of registration duplicates with null
    winner.tournamentIds = [...new Set([...(winner.tournamentIds || []), ...(loser.tournamentIds || []), ...(keep.tournamentIds || [])])];
    if (loser.registrationMeta && !winner.registrationMeta) winner.registrationMeta = loser.registrationMeta;
    removeIds.add(loser.id);
    // Retarget registrations / tournament playerIds
    for (const r of store.registrations || []) {
      if (r.playerId === loser.id) r.playerId = winner.id;
    }
    for (const t of store.tournaments || []) {
      if (!Array.isArray(t.playerIds)) continue;
      t.playerIds = t.playerIds.map((id) => (id === loser.id ? winner.id : id));
      t.playerIds = [...new Set(t.playerIds)];
    }
    for (const team of store.teams || []) {
      if (!Array.isArray(team.playerIds)) continue;
      team.playerIds = [...new Set(team.playerIds.map((id) => (id === loser.id ? winner.id : id)))];
    }
  }
  if (removeIds.size) {
    store.players = store.players.filter((p) => !removeIds.has(p.id));
  }
  return removeIds.size;
}

/**
 * Merge absorbPlayer into keepPlayer (auction roster), then delete absorb.
 * Used when registration created a duplicate of an existing player.
 */
export function mergeAuctionPlayers(store, keepPlayerId, absorbPlayerId) {
  ensureCollections(store);
  if (!keepPlayerId || !absorbPlayerId || keepPlayerId === absorbPlayerId) {
    throw new Error("Select two different players to merge");
  }
  const keep = store.players.find((p) => p.id === keepPlayerId);
  const absorb = store.players.find((p) => p.id === absorbPlayerId);
  if (!keep || !absorb) throw new Error("Player not found");

  if (absorb.photo) keep.photo = absorb.photo;
  if (absorb.phone && !keep.phone) keep.phone = absorb.phone;
  if (absorb.acplPlayerId) {
    keep.acplPlayerId = absorb.acplPlayerId;
    keep.acplName = absorb.acplName || keep.acplName;
    keep.acplLinkSource = absorb.acplLinkSource || keep.acplLinkSource;
  }
  if (Number.isFinite(Number(absorb.basePrice)) && !Number.isFinite(Number(keep.basePrice))) {
    keep.basePrice = absorb.basePrice;
  }
  if (absorb.role && (!keep.role || keep.role === "Player")) keep.role = absorb.role;
  keep.tournamentIds = [...new Set([...(keep.tournamentIds || []), ...(absorb.tournamentIds || [])])];
  if (absorb.registrationMeta) {
    keep.registrationMeta = { ...(keep.registrationMeta || {}), ...absorb.registrationMeta };
  }

  for (const r of store.registrations || []) {
    if (r.playerId === absorb.id) r.playerId = keep.id;
  }
  for (const t of store.tournaments || []) {
    if (!Array.isArray(t.playerIds)) continue;
    t.playerIds = [...new Set(t.playerIds.map((id) => (id === absorb.id ? keep.id : id)))];
  }
  for (const team of store.teams || []) {
    if (!Array.isArray(team.playerIds)) continue;
    team.playerIds = [...new Set(team.playerIds.map((id) => (id === absorb.id ? keep.id : id)))];
  }
  store.players = store.players.filter((p) => p.id !== absorb.id);
  return keep;
}

/** Link an auction player to an ACPL history record (by id or exact name). */
export function linkPlayerToAcpl(store, playerId, acplIdOrName) {
  ensureCollections(store);
  const player = store.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const match = findAcplPlayer(store, acplIdOrName);
  if (!match) throw new Error("No matching ACPL stats player found");
  player.acplPlayerId = match.id;
  player.acplName = match.name;
  player.acplLinkSource = "manual";
  // Optionally align display name to ACPL canonical spelling
  if (normalizePlayerNameKey(player.name) === normalizePlayerNameKey(match.name)) {
    player.name = match.name;
  }
  return { player, acpl: match };
}

/** Clear ACPL stats link from an auction/registration player. */
export function unlinkPlayerFromAcpl(store, playerId) {
  ensureCollections(store);
  const player = store.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  player.acplPlayerId = null;
  player.acplName = null;
  player.acplLinkSource = "manual-cleared";
  return { player };
}

/**
 * Clear base price for auction players linked to registrations of a form
 * (or all registration-linked players when formId is omitted).
 * Registration must not invent a base price — admin sets it later.
 */
export function clearRegistrationBasePrices(store, { formId } = {}) {
  ensureCollections(store);
  const playerIds = new Set(
    (store.registrations || [])
      .filter((r) => r.playerId && (!formId || r.formId === formId))
      .map((r) => r.playerId)
  );
  let cleared = 0;
  for (const p of store.players || []) {
    if (!playerIds.has(p.id)) continue;
    if (p.basePrice == null || p.basePrice === "") continue;
    p.basePrice = null;
    cleared += 1;
  }
  return { cleared, playerIds: [...playerIds] };
}

/** Substring search over ACPL history players (name). */
export function searchAcplPlayers(store, query, { limit = 20 } = {}) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const players = store.acplHistory?.players || [];
  if (!q) return players.slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    seasonsCount: p.seasonsCount,
    seasonsPlayed: p.seasonsPlayed,
    career: p.career
  }));
  const scored = [];
  for (const p of players) {
    const name = String(p.name || "").toLowerCase();
    const norm = String(p.normalizedName || "").toLowerCase();
    if (!name.includes(q) && !norm.includes(q)) continue;
    const exact = name === q || norm === q;
    const starts = name.startsWith(q) || norm.startsWith(q);
    scored.push({
      score: exact ? 0 : starts ? 1 : 2,
      player: {
        id: p.id,
        name: p.name,
        seasonsCount: p.seasonsCount,
        seasonsPlayed: p.seasonsPlayed,
        career: p.career
      }
    });
  }
  scored.sort((a, b) => a.score - b.score || a.player.name.localeCompare(b.player.name));
  return scored.slice(0, limit).map((x) => x.player);
}

/**
 * Match ACPL stats by player name and store link for auction UI.
 *
 * Only fills a link that is not already set: registration names often differ from
 * the ACPL spelling, so re-deriving from the name would drop an admin's link every
 * time a registration is promoted or its payment is verified. Pass force to
 * deliberately re-resolve from the current name.
 */
export function linkPlayerAcplStats(store, player, { force = false } = {}) {
  if (!player) return null;

  if (!force) {
    if (player.acplPlayerId) {
      // Re-resolve so an ACPL re-import with new ids heals the stored link.
      const linked = findAcplPlayer(store, player.acplPlayerId) || findAcplPlayer(store, player.acplName);
      if (linked) {
        player.acplPlayerId = linked.id;
        player.acplName = linked.name;
        return linked;
      }
      return null;
    }
    // Admin removed the link on purpose — do not silently re-attach one.
    if (String(player.acplLinkSource || "").startsWith("manual")) return null;
  }

  const match = findAcplPlayer(store, player.name);
  if (match) {
    player.acplPlayerId = match.id;
    player.acplName = match.name;
    player.acplLinkSource = "auto";
    return match;
  }
  player.acplPlayerId = null;
  player.acplName = null;
  return null;
}

export function setAcplLinker(_fn) {
  /* no-op — kept for compatibility */
}

/** Activate a registration into the tournament player list (promote or payment verified). */
export function activateRegistrationPlayer(store, registration, { saveUploadFn } = {}) {
  ensureCollections(store);
  const form = store.registrationForms.find((f) => f.id === registration.formId);
  if (!form) throw new Error("Form not found");

  // Default to shared saveUpload when callers forget to pass it (keeps photos on promote)
  const materialize = saveUploadFn || saveUpload;
  const publicPhotoUrl = resolveRegistrationPlayerPhoto(store, registration, materialize);

  const player = findOrCreatePlayer(store, form, registration.values || {}, { publicPhotoUrl }, {
    attachToTournament: true,
    linkAcpl: true
  });
  registration.playerId = player.id;
  // Always keep registration photo on the auction player when materialization succeeded
  if (publicPhotoUrl) player.photo = publicPhotoUrl;
  return player;
}

/**
 * Rematerialize registration player photos onto auction player records.
 * Use after deploy or when player.photo is missing / 404.
 */
export function syncRegistrationPhotos(store, { saveUploadFn, formId, force = false } = {}) {
  ensureCollections(store);
  if (!saveUploadFn) throw new Error("saveUploadFn required");
  let updated = 0;
  let skipped = 0;
  for (const reg of store.registrations || []) {
    if (formId && reg.formId !== formId) continue;
    if (!reg.playerId) {
      skipped += 1;
      continue;
    }
    const player = store.players.find((p) => p.id === reg.playerId);
    if (!player) {
      skipped += 1;
      continue;
    }
    if (!force && player.photo) {
      skipped += 1;
      continue;
    }
    const url = resolveRegistrationPlayerPhoto(store, reg, saveUploadFn);
    if (!url) {
      skipped += 1;
      continue;
    }
    player.photo = url;
    updated += 1;
  }
  return { updated, skipped };
}

/** Remove player from tournament roster when registration leaves active registered set. */
function detachRegistrationPlayer(store, registration) {
  if (!registration?.playerId) return;
  const tournament = store.tournaments.find((t) => t.id === registration.tournamentId);
  if (tournament && Array.isArray(tournament.playerIds)) {
    tournament.playerIds = tournament.playerIds.filter((id) => id !== registration.playerId);
  }
  const player = store.players.find((p) => p.id === registration.playerId);
  if (player) {
    player.tournamentIds = (player.tournamentIds || []).filter((id) => id !== registration.tournamentId);
  }
}

export function getFormByToken(store, tokenOrSlug) {
  ensureCollections(store);
  const key = String(tokenOrSlug || "").trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  return (
    store.registrationForms.find((f) => f.publicToken === key) ||
    store.registrationForms.find((f) => String(f.publicSlug || "").toLowerCase() === lower) ||
    null
  );
}

export function formPublicPath(form) {
  if (!form) return "";
  return form.publicSlug || form.publicToken || "";
}

function assertUniqueSlug(store, slug, exceptFormId) {
  const normalized = normalizePublicSlug(slug);
  if (!normalized) throw new Error("Public URL slug is required");
  if (normalized.length < 2) throw new Error("Public URL slug is too short");
  const clash = store.registrationForms.find(
    (f) => f.id !== exceptFormId && String(f.publicSlug || "").toLowerCase() === normalized.toLowerCase()
  );
  if (clash) throw new Error(`Public URL slug "${normalized}" is already used by another form`);
  return normalized;
}

export function getFormByTournament(store, tournamentId) {
  ensureCollections(store);
  return store.registrationForms.find((f) => f.tournamentId === tournamentId) || null;
}

export function publicFormPayload(store, form) {
  const tournament = store.tournaments.find((t) => t.id === form.tournamentId);
  const teamIds = tournament?.teamIds || [];
  const teams = (store.teams || [])
    .filter((t) => teamIds.includes(t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  const fields = (form.fields || []).map((f) => {
    // Auction team choices always come from teams added to the tournament
    if (f.key === "auctionTeam") {
      return {
        ...f,
        options: teams.map((t) => t.name),
        config: { ...(f.config || {}), source: "tournamentTeams" }
      };
    }
    if (f.config?.source === "tournamentTeams" && teams.length) {
      return { ...f, options: teams.map((t) => t.name) };
    }
    return f;
  });

  const accepting = formIsAccepting(form);
  // Tournament logo is the source of truth for the public header
  let logo = tournament?.logo || form.logo || "";
  // Cache-bust so browsers pick up newly uploaded logos (Next used to 404 until restart)
  if (logo && logo.startsWith("/uploads/")) {
    const ver = tournament?.updatedAt || form.updatedAt || Date.now();
    logo = `${logo.split("?")[0]}?v=${ver}`;
  }
  return {
    form: {
      id: form.id,
      tournamentId: form.tournamentId,
      title: form.title,
      description: form.description,
      logo,
      publicSlug: form.publicSlug || "",
      status: form.status,
      opensAt: form.opensAt,
      closesAt: form.closesAt,
      payment: form.payment,
      sections: form.sections,
      fields,
      rules: form.rules,
      version: form.version
    },
    tournament: tournament
      ? {
          id: tournament.id,
          name: tournament.name,
          sport: tournament.sport,
          venue: tournament.venue,
          logo: tournament.logo || ""
        }
      : null,
    accepting
  };
}

export function createForm(store, { tournamentId, template }) {
  ensureCollections(store);
  const tournament = store.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) throw new Error("Tournament not found");
  if (getFormByTournament(store, tournamentId)) throw new Error("Registration form already exists for this tournament");

  const form =
    template === "blank" ? blankRegistrationForm(tournament) : buildAcplSeason6Form(tournament, store);
  store.registrationForms.push(form);
  return form;
}

/** Remove a form so a new one can be created. Blocks if registrations exist unless force=true. */
export function deleteForm(store, formId, { force = false } = {}) {
  ensureCollections(store);
  const i = store.registrationForms.findIndex((f) => f.id === formId);
  if (i < 0) throw new Error("Form not found");
  const form = store.registrationForms[i];
  const regCount = (store.registrations || []).filter((r) => r.formId === formId).length;
  if (regCount > 0 && !force) {
    throw new Error(
      `This form has ${regCount} registration(s). Confirm force delete to remove the form and its registrations.`
    );
  }
  if (force && regCount > 0) {
    const regIds = new Set(
      (store.registrations || []).filter((r) => r.formId === formId).map((r) => r.id)
    );
    store.registrations = (store.registrations || []).filter((r) => r.formId !== formId);
    store.registrationAudits = (store.registrationAudits || []).filter((a) => !regIds.has(a.registrationId));
    store.registrationFiles = (store.registrationFiles || []).filter((f) => f.formId !== formId);
  }
  store.registrationForms.splice(i, 1);
  return { deletedId: form.id, tournamentId: form.tournamentId, removedRegistrations: force ? regCount : 0 };
}

/** Delete existing form (if any) and create a fresh template for the tournament. */
export function recreateForm(store, { tournamentId, template, force = false }) {
  ensureCollections(store);
  const existing = getFormByTournament(store, tournamentId);
  if (existing) {
    deleteForm(store, existing.id, { force });
  }
  return createForm(store, { tournamentId, template: template || "acpl6" });
}

export function upsertForm(store, patch, { saveUploadFn, performedBy } = {}) {
  ensureCollections(store);
  const i = store.registrationForms.findIndex((f) => f.id === patch.id);
  if (i < 0) throw new Error("Form not found");
  const prev = store.registrationForms[i];
  const tournament = store.tournaments.find((t) => t.id === prev.tournamentId);
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    tournamentId: prev.tournamentId,
    publicToken: prev.publicToken,
    version: Number(prev.version || 1) + (patch.bumpVersion ? 1 : 0),
    updatedAt: Date.now()
  };
  delete next.bumpVersion;
  if (patch.publicSlug != null) {
    next.publicSlug = assertUniqueSlug(store, patch.publicSlug, prev.id);
  } else if (!next.publicSlug) {
    next.publicSlug = assertUniqueSlug(store, suggestPublicSlug(tournament, { idPrefix: next.idPrefix }), prev.id);
  }
  if (!next.logo && tournament?.logo) next.logo = tournament.logo;
  // Keep tournament logo aligned when form logo is set
  if (next.logo && tournament && !tournament.logo) {
    tournament.logo = next.logo;
  }
  if (Array.isArray(patch.fields) && patch.fields !== prev.fields) {
    next.fieldHistory = [...(prev.fieldHistory || []), { version: prev.version, fields: prev.fields, at: Date.now() }].slice(
      -20
    );
  }
  store.registrationForms[i] = next;
  // Capacity increases (overall or per-category) should immediately absorb the waiting list.
  fillAvailableSlotsFromWaiting(store, next, {
    saveUploadFn,
    performedBy: performedBy || "system"
  });
  return next;
}

export function setFormStatus(store, formId, status) {
  const form = store.registrationForms.find((f) => f.id === formId);
  if (!form) throw new Error("Form not found");
  if (status === "open") {
    const errors = validateFormForOpen(form);
    if (errors.length) throw new Error(errors.join("; "));
    // Manual Open starts registration immediately — don't leave a future opensAt blocking the public form.
    if (form.opensAt) {
      const t = parseFormDateTime(form.opensAt);
      if (!Number.isNaN(t) && t > Date.now()) {
        form.opensAt = "";
      }
    }
  }
  if (!["draft", "open", "closed"].includes(status)) throw new Error("Invalid status");
  form.status = status;
  form.updatedAt = Date.now();
  return form;
}

function sniffMime(buf, filename) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf.toString("ascii", 0, 4) === "RIFF") return "image/webp";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  const ext = String(filename || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

export function savePrivateUpload(store, { dataUrl, filename, fieldKey, formId, maxBytes, allowedMime }) {
  ensureCollections(store);
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Invalid file data");
  const buf = Buffer.from(match[2], "base64");
  if (maxBytes && buf.length > maxBytes) throw new Error("File too large");
  const mime = sniffMime(buf, filename);
  if (allowedMime?.length && !allowedMime.includes(mime)) throw new Error(`File type not allowed (${mime})`);

  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "application/pdf"
            ? "pdf"
            : "bin";
  const stored = `${randomBytes(16).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(PRIVATE_UPLOAD_DIR, stored), buf);
  const file = {
    id: uid(),
    formId,
    fieldKey,
    registrationId: null,
    playerId: null,
    originalFilename: filename || stored,
    storedFilename: stored,
    mimeType: mime,
    fileSize: buf.length,
    storagePath: stored,
    uploadedAt: Date.now()
  };
  store.registrationFiles.push(file);
  return file;
}

/** Copy player photo into public uploads for auction UI when registering. */
export function materializePlayerPhoto(store, file, saveUploadFn) {
  if (!file || !saveUploadFn) return "";
  const abs = path.join(PRIVATE_UPLOAD_DIR, file.storedFilename);
  if (!fs.existsSync(abs)) {
    console.warn("[registration] player photo missing on disk", file.storedFilename);
    return "";
  }
  const buf = fs.readFileSync(abs);
  const b64 = buf.toString("base64");
  const dataUrl = `data:${file.mimeType || "image/jpeg"};base64,${b64}`;
  const url = saveUploadFn(dataUrl, file.originalFilename || "photo.jpg");
  return url || "";
}

/** Resolve registration playerPhoto file id → public /uploads URL (always attach when present). */
export function resolveRegistrationPlayerPhoto(store, registration, saveUploadFn) {
  const photoId =
    registration?.fileIds?.playerPhoto ||
    registration?.fileIds?.photo ||
    registration?.fileIds?.player_photo ||
    "";
  if (!photoId) return "";
  const photoFile = (store.registrationFiles || []).find((f) => f.id === photoId);
  if (!photoFile) return "";
  if (saveUploadFn) return materializePlayerPhoto(store, photoFile, saveUploadFn) || "";
  const existing = (store.players || []).find((p) => p.id === registration.playerId);
  return existing?.photo || "";
}

export async function submitRegistration(store, { token, values, fileIds }, { saveUploadFn, performedBy, appUrl, sendEmail = true } = {}) {
  const result = await withRegLock(() => {
    ensureCollections(store);
    const form = getFormByToken(store, token);
    if (!form) throw new Error("Registration form not found");
    const accepting = formIsAccepting(form);
    if (!accepting.ok) throw new Error(accepting.message);

    const cleanValues = { ...(values || {}) };
    const cleanFiles = { ...(fileIds || {}) };
    const { visible } = evaluateFieldState(form, cleanValues);
    for (const key of Object.keys(cleanValues)) {
      if (visible[key] === false) delete cleanValues[key];
    }
    for (const key of Object.keys(cleanFiles)) {
      if (visible[key] === false) delete cleanFiles[key];
    }

    const validation = validateSubmission(form, cleanValues, cleanFiles);
    if (!validation.ok) {
      const err = new Error("Validation failed");
      err.validation = validation.errors;
      throw err;
    }

    const dup = findDuplicate(store, form, cleanValues.mobile, cleanValues.playerName);
    if (dup) {
      const err = new Error(
        `A registration already exists for this tournament. Registration ID: ${dup.registrationId}. Status: ${dup.status}`
      );
      err.duplicate = dup;
      throw err;
    }

    // Verify file ids belong to this form and are unused
    for (const [key, fid] of Object.entries(cleanFiles)) {
      const file = store.registrationFiles.find((f) => f.id === fid);
      if (!file || file.formId !== form.id) throw new Error(`Invalid upload for ${key}`);
      if (file.registrationId) throw new Error(`Upload already used for ${key}`);
    }

    const registeredAt = Date.now();
    const cat = categoryKey(cleanValues);
    const limit = capacityLimit(form, cat);
    const used = form.useCategoryCapacity ? countRegistered(store, form, cat) : countRegistered(store, form);
    let status = "registered";
    let waitingPosition = null;
    if (limit > 0 && used >= limit) {
      status = "waiting";
    }

    let publicPhotoUrl = "";
    const photoFileId = cleanFiles.playerPhoto || cleanFiles.photo || cleanFiles.player_photo;
    if (photoFileId && saveUploadFn) {
      const photoFile = store.registrationFiles.find((f) => f.id === photoFileId);
      publicPhotoUrl = materializePlayerPhoto(store, photoFile, saveUploadFn);
    }

    // Create/update player record; only attach to tournament roster when registered
    const player = findOrCreatePlayer(
      store,
      form,
      cleanValues,
      { publicPhotoUrl },
      { attachToTournament: status === "registered", linkAcpl: status === "registered" }
    );
    if (publicPhotoUrl) player.photo = publicPhotoUrl;

    const registration = {
      id: uid(),
      registrationId: "",
      tournamentId: form.tournamentId,
      formId: form.id,
      formVersion: form.version,
      playerId: player.id,
      registrationSequence: 0,
      sequence: 0,
      categorySequence: 0,
      registeredAt,
      status,
      waitingPosition,
      paymentStatus: "pending",
      values: cleanValues,
      fileIds: cleanFiles,
      createdAt: registeredAt,
      updatedAt: registeredAt
    };
    store.registrations.push(registration);

    for (const fid of Object.values(cleanFiles)) {
      const file = store.registrationFiles.find((f) => f.id === fid);
      if (file) {
        file.registrationId = registration.id;
        file.playerId = player.id;
      }
    }

    assignNextCategorySequence(store, form, registration);
    recomputeWaitingPositions(store, form);

    audit(store, registration.id, "submitted", null, { status, sequence: registration.sequence, registrationId: registration.registrationId }, performedBy || "public");
    audit(store, registration.id, "sequence_assigned", null, registration.sequence, "system");
    if (status === "waiting") {
      audit(store, registration.id, "waiting_list", null, registration.waitingPosition, "system");
    } else {
      audit(store, registration.id, "registered", null, status, "system");
    }

    return {
      form,
      registrationFull: registration,
      registration: {
        registrationId: registration.registrationId,
        sequence: registration.sequence,
        categorySequence: registration.categorySequence || registration.sequence,
        category: cat,
        registeredAt: registration.registeredAt,
        status: registration.status,
        waitingPosition: registration.waitingPosition,
        tournamentName: store.tournaments.find((t) => t.id === form.tournamentId)?.name || "",
        email: cleanValues.email || ""
      }
    };
  });

  if (sendEmail) {
    try {
      const { sendRegistrationEmails } = await import("./email.mjs");
      await sendRegistrationEmails({
        store,
        form: result.form,
        registration: result.registrationFull,
        appUrl: appUrl || process.env.PUBLIC_URL || ""
      });
    } catch (e) {
      console.error("[email] registration notify failed", e.message);
    }
  }

  return { registration: result.registration };
}

export function promoteNextWaiting(store, form, category, performedBy, { saveUploadFn } = {}) {
  const waiting = (store.registrations || [])
    .filter((r) => {
      if (r.formId !== form.id || r.status !== "waiting") return false;
      if (form.useCategoryCapacity && category) return categoryKey(r.values) === category;
      return true;
    })
    .sort((a, b) => {
      const ta = Number(a.registeredAt) || 0;
      const tb = Number(b.registeredAt) || 0;
      if (ta !== tb) return ta - tb;
      return (a.sequence || 0) - (b.sequence || 0);
    });
  const next = waiting[0];
  if (!next) return null;
  const old = next.status;
  next.status = "registered";
  next.waitingPosition = null;
  next.updatedAt = Date.now();
  // Keep existing category number (timestamp order). If demoted earlier (no number), rebuild by time.
  if (!holdsCategoryNumber(next)) {
    recomputeCategorySequences(store, form, categoryKey(next.values));
  }
  activateRegistrationPlayer(store, next, { saveUploadFn });
  audit(store, next.id, "promoted", old, "registered", performedBy || "system");
  recomputeWaitingPositions(store, form);
  return next;
}

/**
 * Promote waiting-list registrations into any free capacity (overall or per-category).
 * Used after capacity increases and on store migration so dashboard slots match the list.
 */
export function fillAvailableSlotsFromWaiting(store, form, { saveUploadFn, performedBy } = {}) {
  if (!form) return [];
  ensureCollections(store);
  const promoted = [];
  const who = performedBy || "system";

  const promoteWhileRoom = (category) => {
    while (true) {
      const limit = capacityLimit(form, category);
      if (!(limit > 0)) break;
      const used = category != null ? countRegistered(store, form, category) : countRegistered(store, form);
      if (used >= limit) break;
      const next = promoteNextWaiting(store, form, category, who, { saveUploadFn });
      if (!next) break;
      promoted.push(next);
    }
  };

  if (form.useCategoryCapacity) {
    const cats = new Set([
      ...Object.keys(form.categoryCapacity || {}),
      ...(store.registrations || [])
        .filter((r) => r.formId === form.id)
        .map((r) => categoryKey(r.values))
        .filter(Boolean)
    ]);
    for (const cat of cats) promoteWhileRoom(cat);
  } else {
    promoteWhileRoom(null);
  }
  return promoted;
}

export function updateRegistrationStatus(store, registrationId, status, performedBy, { confirmPromote, saveUploadFn } = {}) {
  return withRegLock(() => {
    ensureCollections(store);
    const reg = store.registrations.find((r) => r.id === registrationId || r.registrationId === registrationId);
    if (!reg) throw new Error("Registration not found");
    const form = store.registrationForms.find((f) => f.id === reg.formId);
    if (!form) throw new Error("Form not found");

    const allowed = ["registered", "waiting", "cancelled", "rejected", "approved", "under_review"];
    if (!allowed.includes(status)) throw new Error("Invalid status");

    if (status === "registered" && reg.status === "waiting") {
      if (!confirmPromote) throw new Error("Confirmation required to promote");
    }

    const old = reg.status;
    const wasRegistered = old === "registered";
    const cat = categoryKey(reg.values);
    const priorSeq = Number(reg.categorySequence || reg.sequence) || 0;
    const hadNumber = holdsCategoryNumber(reg);

    reg.status = status;
    reg.updatedAt = Date.now();
    if (status !== "waiting") reg.waitingPosition = null;
    audit(store, reg.id, "status_changed", old, status, performedBy || "admin");

    if (status === "registered") {
      activateRegistrationPlayer(store, reg, { saveUploadFn });
      // Promote keeps original number; if missing (after demote), restore by timestamp order
      if (!holdsCategoryNumber(reg)) {
        recomputeCategorySequences(store, form, cat);
      }
    } else if (wasRegistered && (status === "waiting" || status === "cancelled" || status === "rejected")) {
      detachRegistrationPlayer(store, reg);
    }

    // Demote / cancel / reject → later registration numbers in this category drop by 1
    if (
      hadNumber &&
      (status === "cancelled" || status === "rejected" || (wasRegistered && status === "waiting"))
    ) {
      clearCategoryNumber(reg);
      decrementCategorySequencesAfter(store, form, cat, priorSeq);
    }

    if (wasRegistered && (status === "cancelled" || status === "rejected")) {
      promoteNextWaiting(store, form, cat, performedBy || "system", { saveUploadFn });
    }

    recomputeWaitingPositions(store, form);
    return reg;
  });
}

export function setPaymentStatus(store, registrationId, paymentStatus, performedBy, { saveUploadFn } = {}) {
  ensureCollections(store);
  const reg = store.registrations.find((r) => r.id === registrationId || r.registrationId === registrationId);
  if (!reg) throw new Error("Registration not found");
  if (!["pending", "verified", "rejected"].includes(paymentStatus)) throw new Error("Invalid payment status");
  const oldPay = reg.paymentStatus;
  const oldStatus = reg.status;
  reg.paymentStatus = paymentStatus;
  reg.updatedAt = Date.now();
  audit(store, reg.id, "payment_status", oldPay, paymentStatus, performedBy || "admin");

  if (paymentStatus === "verified") {
    if (reg.status !== "registered") {
      reg.status = "registered";
      reg.waitingPosition = null;
      audit(store, reg.id, "status_changed", oldStatus, "registered", performedBy || "admin");
      if (!holdsCategoryNumber(reg)) {
        const form = store.registrationForms.find((f) => f.id === reg.formId);
        if (form) recomputeCategorySequences(store, form, categoryKey(reg.values));
      }
    }
    activateRegistrationPlayer(store, reg, { saveUploadFn });
    const form = store.registrationForms.find((f) => f.id === reg.formId);
    if (form) recomputeWaitingPositions(store, form);
  }
  return reg;
}

export function deleteRegistration(store, registrationId, performedBy, { saveUploadFn } = {}) {
  return withRegLock(() => {
    ensureCollections(store);
    const reg = store.registrations.find((r) => r.id === registrationId || r.registrationId === registrationId);
    if (!reg) throw new Error("Registration not found");
    const form = store.registrationForms.find((f) => f.id === reg.formId);
    if (!form) throw new Error("Form not found");
    const cat = categoryKey(reg.values);
    const wasRegistered = reg.status === "registered";
    const priorSeq = Number(reg.categorySequence || reg.sequence) || 0;
    const hadNumber = holdsCategoryNumber(reg);

    detachRegistrationPlayer(store, reg);
    store.registrations = store.registrations.filter((r) => r.id !== reg.id);
    audit(store, reg.id, "deleted", reg.status, null, performedBy || "admin");

    if (hadNumber) decrementCategorySequencesAfter(store, form, cat, priorSeq);

    if (wasRegistered) {
      promoteNextWaiting(store, form, cat, performedBy || "system", { saveUploadFn });
    }
    recomputeWaitingPositions(store, form);
    return { deletedId: reg.id, category: cat };
  });
}

export function dashboardForForm(store, formId) {
  ensureCollections(store);
  const form = store.registrationForms.find((f) => f.id === formId);
  if (!form) throw new Error("Form not found");
  const regs = store.registrations.filter((r) => r.formId === formId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const byCategory = {};
  const byStatus = {};
  const byPayment = {};
  for (const r of regs) {
    const c = categoryKey(r.values) || "—";
    // Match the per-category slot cards: only count fully registered players.
    if (r.status === "registered") {
      byCategory[c] = (byCategory[c] || 0) + 1;
    }
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byPayment[r.paymentStatus || "pending"] = (byPayment[r.paymentStatus || "pending"] || 0) + 1;
  }
  const registered = byStatus.registered || 0;
  const waiting = byStatus.waiting || 0;
  const capacity = Number(form.capacity) || 0;
  const availableSlotsByCategory = {};
  const catOptions =
    (form.fields || []).find((f) => f.key === "category")?.options ||
    Object.keys(form.categoryCapacity || {}) ||
    [];
  const cats = new Set([...catOptions, ...Object.keys(byCategory)]);
  for (const cat of cats) {
    if (!cat || cat === "—") continue;
    const registeredInCat = (store.registrations || []).filter(
      (r) => r.formId === formId && r.status === "registered" && categoryKey(r.values) === cat
    ).length;
    const cap = form.useCategoryCapacity
      ? Number(form.categoryCapacity?.[cat]) || 0
      : capacity;
    availableSlotsByCategory[cat] = {
      registered: registeredInCat,
      capacity: cap,
      available: cap > 0 ? Math.max(0, cap - registeredInCat) : null
    };
  }
  return {
    total: regs.length,
    registered,
    waiting,
    availableSlots: Math.max(0, capacity - registered),
    availableSlotsByCategory,
    today: regs.filter((r) => r.registeredAt >= todayStart.getTime()).length,
    byCategory,
    byStatus,
    byPayment,
    capacity,
    useCategoryCapacity: !!form.useCategoryCapacity,
    categoryCapacity: form.categoryCapacity || {}
  };
}

export function listRegistrations(store, formId, { status } = {}) {
  ensureCollections(store);
  return store.registrations
    .filter((r) => r.formId === formId && (!status || r.status === status))
    .sort((a, b) => {
      const ca = categoryKey(a.values);
      const cb = categoryKey(b.values);
      if (ca !== cb) return ca.localeCompare(cb);
      const ta = Number(a.registeredAt) || 0;
      const tb = Number(b.registeredAt) || 0;
      if (ta !== tb) return ta - tb;
      return (a.sequence || 0) - (b.sequence || 0);
    })
    .map((r) => ({
      ...r,
      playerName: r.values?.playerName || store.players.find((p) => p.id === r.playerId)?.name || "",
      mobile: r.values?.mobile || "",
      category: r.values?.category || "",
      categorySequence: r.categorySequence || r.sequence
    }));
}

/** CSV of a form's registrations, optionally narrowed to one category and/or status. */
export function exportCsv(store, formId, { category = "", status = "" } = {}) {
  const wanted = String(category || "").trim();
  const rows = listRegistrations(store, formId, { status }).filter(
    (r) => !wanted || categoryKey(r.values) === wanted
  );
  const headers = [
    "Registration ID",
    "Sequence",
    "Category No",
    "Registered At",
    "Player Name",
    "Mobile",
    "Date of Birth",
    "Category",
    "Jersey Name/Number",
    "Jersey Size",
    "Player Type",
    "Batting Style",
    "Bowling Style",
    "Wicketkeeper",
    "CricHeroes",
    "Auction Team",
    "Arcus Relationship",
    "Payment Preference",
    "Payment Status",
    "Registration Status",
    "Waiting Position"
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    const v = r.values || {};
    lines.push(
      [
        r.registrationId,
        r.sequence,
        r.categorySequence || r.sequence,
        new Date(r.registeredAt).toISOString(),
        v.playerName,
        v.mobile,
        v.dob,
        v.category,
        v.jerseyNameNumber,
        v.jerseySize,
        v.playerType,
        v.battingStyle,
        v.bowlingStyle,
        v.wicketkeeper,
        v.cricHeroesProfile || v.cricHeroesHas,
        v.auctionTeam,
        v.arcusRelation,
        v.paymentPreference,
        r.paymentStatus,
        r.status,
        r.waitingPosition ?? ""
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function signFileAccess(store, fileId, ttlMs = 15 * 60 * 1000) {
  ensureCollections(store);
  const exp = Date.now() + ttlMs;
  const payload = `${fileId}.${exp}`;
  const sig = createHmac("sha256", store.meta.regFileSecret).update(payload).digest("hex");
  return { exp, sig };
}

export function verifyFileAccess(store, fileId, exp, sig) {
  ensureCollections(store);
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const payload = `${fileId}.${exp}`;
  const expected = createHmac("sha256", store.meta.regFileSecret).update(payload).digest("hex");
  try {
    const a = Buffer.from(String(sig));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getPrivateFile(store, fileId) {
  ensureCollections(store);
  const file = store.registrationFiles.find((f) => f.id === fileId);
  if (!file) return null;
  const abs = path.join(PRIVATE_UPLOAD_DIR, file.storedFilename);
  if (!fs.existsSync(abs)) return null;
  return { file, abs };
}

export function registrationAdminState(store) {
  ensureCollections(store);
  return {
    forms: store.registrationForms,
    registrations: store.registrations.map((r) => {
      const player = store.players.find((p) => p.id === r.playerId);
      return {
        id: r.id,
        registrationId: r.registrationId,
        tournamentId: r.tournamentId,
        formId: r.formId,
        formVersion: r.formVersion,
        playerId: r.playerId,
        sequence: r.sequence,
        categorySequence: r.categorySequence || r.sequence,
        registeredAt: r.registeredAt,
        status: r.status,
        waitingPosition: r.waitingPosition,
        paymentStatus: r.paymentStatus,
        values: r.values,
        fileIds: r.fileIds,
        playerName: r.values?.playerName || player?.name || "",
        mobile: r.values?.mobile || player?.phone || "",
        category: r.values?.category || "",
        acplPlayerId: player?.acplPlayerId || null,
        acplName: player?.acplName || null,
        basePrice: player?.basePrice ?? null
      };
    }),
    audits: store.registrationAudits.slice(-500)
  };
}
