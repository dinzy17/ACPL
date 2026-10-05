import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHash } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");

export function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

/** Public base URL when hosted on the internet (e.g. http://3.16.112.125:3000). */
export function publicBaseUrl(port = Number(process.env.PORT || 3000)) {
  const raw = String(process.env.PUBLIC_URL || process.env.PUBLIC_HOST || "").trim().replace(/\/$/, "");
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}${raw.includes(":") ? "" : `:${port}`}`;
}

/** TCP port a public base URL resolves to — 80/443 when the URL omits one. */
export function publicUrlPort(port = Number(process.env.PORT || 3000)) {
  const base = publicBaseUrl(port);
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

/** Same base URL with an explicit port, e.g. http://host -> http://host:3000. */
export function baseUrlWithPort(base, port) {
  try {
    const url = new URL(String(base));
    url.port = String(port);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return String(base || "");
  }
}

/** Point every advertised URL at `port`, in place, so live clients pick it up. */
export function repointAdvertiseUrls(urls, port) {
  if (!urls || !urls.appUrl) return urls;
  const appUrl = baseUrlWithPort(urls.appUrl, port);
  urls.appUrl = appUrl;
  urls.appUrls = [appUrl];
  urls.spectatorUrls = [`${appUrl}/live`];
  return urls;
}

/** URLs advertised to clients — prefer public host, else localhost + LAN. */
export function advertiseUrls(port = Number(process.env.PORT || 3000)) {
  const pub = publicBaseUrl(port);
  if (pub) {
    return {
      mode: "public",
      appUrl: pub,
      appUrls: [pub],
      spectatorUrls: [`${pub}/live`],
      lan: []
    };
  }
  const lan = lanAddresses();
  const appUrls = [`http://localhost:${port}`, ...lan.map((ip) => `http://${ip}:${port}`)];
  return {
    mode: "lan",
    appUrl: appUrls[0],
    appUrls,
    spectatorUrls: appUrls.map((u) => `${u}/live`),
    lan
  };
}

export function uid() {
  return randomUUID().slice(0, 8);
}

export function pin4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function hashPw(pw) {
  return createHash("sha256").update(String(pw || "")).digest("hex");
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, username: u.username, role: u.role, teamId: u.teamId || null };
}

export function ensureUsers(store) {
  store.users ||= [];
  const hasSuper = store.users.some((u) => u.username.toLowerCase() === "osinha");
  if (!hasSuper) {
    store.users.push({
      id: uid(),
      name: "Omkar",
      username: "osinha",
      passwordHash: hashPw("12345abc"),
      role: "super",
      teamId: null
    });
  }
  for (const o of store.owners || []) {
    if (!o.username) continue;
    const exists = store.users.find((u) => u.username.toLowerCase() === String(o.username).toLowerCase());
    if (!exists) {
      store.users.push({
        id: o.id || uid(),
        name: o.name,
        username: o.username,
        passwordHash: o.passwordHash,
        role: "owner",
        teamId: o.teamId || null
      });
    }
  }
  return store;
}

export function saveUpload(dataUrl, filename = "file") {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data");
  const ext = (filename.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "png";
  const name = `${uid()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(match[2], "base64"));
  return `/uploads/${name}`;
}

const DEFAULT_INCREMENTS = [
  { from: 0, to: 600, step: 20 },
  { from: 600, to: 800, step: 20 },
  { from: 800, to: 1000, step: 25 },
  { from: 1000, to: 999999, step: 50 }
];

export function emptySeed() {
  const men = { id: uid(), name: "Men" };
  const women = { id: uid(), name: "Women" };
  const kids = { id: uid(), name: "Kids" };

  const teamDefs = [
    ["Raptors", "#2563EB", men.id],
    ["Titans", "#06B6D4", men.id],
    ["Falcons", "#F97316", men.id],
    ["Strikers", "#7C3AED", men.id]
  ];
  const teams = teamDefs.map(([name, color, categoryId]) => ({
    id: uid(),
    name,
    logo: "",
    color,
    pin: pin4(),
    phone: "",
    categoryId,
    sport: "Cricket",
    ownerId: null,
    playerIds: [],
    retentions: []
  }));

  const roles = ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper"];
  const names = [
    ["Arjun Mehta", "Men"],
    ["Kabir Rao", "Men"],
    ["Dev Sharma", "Men"],
    ["Rohan Iyer", "Men"],
    ["Vikram Nair", "Men"],
    ["Samar Joshi", "Men"],
    ["Neel Kapoor", "Men"],
    ["Ayaan Khan", "Men"],
    ["Ananya Desai", "Women"],
    ["Meera Shah", "Women"],
    ["Isha Patel", "Women"],
    ["Riya Banerjee", "Women"],
    ["Tanya Gill", "Women"],
    ["Pooja Reddy", "Women"],
    ["Aarav Mini", "Kids"],
    ["Vivaan Mini", "Kids"],
    ["Advik Mini", "Kids"],
    ["Myra Mini", "Kids"],
    ["Kabir Mini", "Kids"],
    ["Anvi Mini", "Kids"],
    ["Harsh Verma", "Men"],
    ["Siddharth Bose", "Men"],
    ["Kavya Menon", "Women"],
    ["Zara Ali", "Women"]
  ];
  const catByName = { Men: men, Women: women, Kids: kids };
  const croreBases = [2, 1.5, 1];
  const tournament = {
    id: uid(),
    name: "ACPL Season 1",
    sport: "Cricket",
    logo: "",
    startDate: "2026-08-22",
    endDate: "2026-08-24",
    venue: "Arcus Ground",
    hasAuction: true,
    categoryId: men.id,
    teamIds: teams.filter((t) => t.categoryId === men.id).map((t) => t.id),
    playerIds: []
  };
  const players = names.map(([name, cat], i) => {
    const category = catByName[cat];
    const cr = croreBases[i % croreBases.length];
    return {
      id: uid(),
      name,
      photo: "",
      role: roles[i % roles.length],
      categoryId: category.id,
      sport: "Cricket",
      basePrice: cr * 100,
      phone: "",
      teamId: null,
      assignment: "auction",
      tournamentIds: [tournament.id]
    };
  });
  tournament.playerIds = players.map((p) => p.id);

  const owners = teams.map((team, i) => {
    const username = team.name.toLowerCase();
    return {
      id: uid(),
      name: `${team.name} Owner`,
      username,
      passwordHash: hashPw("owner"),
      teamId: team.id,
      categoryId: team.categoryId
    };
  });
  owners.forEach((o, i) => {
    teams[i].ownerId = o.id;
  });

  const uniqueBases = [...new Set(players.filter((p) => p.categoryId === men.id).map((p) => p.basePrice))];
  const maxByBasePrice = Object.fromEntries(uniqueBases.map((b) => [String(b), 4]));

  const auction = {
    id: uid(),
    code: "ARCS",
    name: "Opening Night Auction",
    tournamentId: tournament.id,
    categoryId: men.id,
    purse: 12000,
    denominators: [600, 800, 1000],
    minSquad: 5,
    maxSquad: 8,
    minByCategory: {},
    maxByBasePrice,
    increments: DEFAULT_INCREMENTS,
    sequence: "random",
    teamIds: teams.filter((t) => t.categoryId === men.id).map((t) => t.id),
    playerIds: players.filter((p) => p.categoryId === men.id).map((p) => p.id),
    timerSeconds: 20,
    status: "draft",
    live: null
  };

  return {
    meta: {
      superAdminPin: "0000",
      adminPin: "0000",
      auctioneerPin: "1111",
      liveBidding: false,
      updatedAt: Date.now(),
      regFileSecret: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")
    },
    tournaments: [tournament],
    categories: [men, women, kids],
    teams,
    players,
    owners,
    users: [
      {
        id: uid(),
        name: "Omkar",
        username: "osinha",
        passwordHash: hashPw("12345abc"),
        role: "super",
        teamId: null
      }
    ],
    auctions: [auction],
    registrationForms: [],
    registrations: [],
    registrationFiles: [],
    registrationAudits: []
  };
}

export function migrate(store) {
  store.meta ||= {};
  if (!store.meta.superAdminPin) store.meta.superAdminPin = store.meta.adminPin || "0000";
  if (!store.meta.adminPin) store.meta.adminPin = "0000";
  if (!store.meta.auctioneerPin) store.meta.auctioneerPin = "1111";
  if (store.meta.liveBidding !== true) store.meta.liveBidding = false;
  store.owners ||= [];
  const firstCat = store.categories?.[0]?.id;
  store.teams = (store.teams || []).map((t) => ({
    categoryId: firstCat,
    sport: "Cricket",
    ownerId: t.ownerId || null,
    playerIds: t.playerIds || [],
    retentions: t.retentions || [],
    ...t,
    sport: t.sport || "Cricket"
  }));
  store.tournaments = (store.tournaments || []).map((t) => {
    const categoryId = t.categoryId || firstCat;
    const sport = t.sport || "Cricket";
    const sportOf = (team) => String(team?.sport || "Cricket").toLowerCase();
    const want = sportOf({ sport });
    const matching = (store.teams || []).filter(
      (team) => team.categoryId === categoryId && sportOf(team) === want
    );
    // Preserve intentional empty team lists — only default when teamIds is missing
    const teamIds = Array.isArray(t.teamIds)
      ? t.teamIds.filter((id) => matching.some((team) => team.id === id))
      : matching.map((team) => team.id);
    const matchingPlayers = (store.players || []).filter(
      (pl) => pl.categoryId === categoryId && sportOf(pl) === want
    );
    // Authoritative player list on the tournament (like teamIds). Derive once if missing.
    const playerIds = Array.isArray(t.playerIds)
      ? t.playerIds.filter((id) => matchingPlayers.some((pl) => pl.id === id))
      : matchingPlayers.filter((pl) => (pl.tournamentIds || []).includes(t.id)).map((pl) => pl.id);
    return {
      hasAuction: t.teamFormation ? t.teamFormation === "auction" : true,
      logo: "",
      ...t,
      logo: t.logo || "",
      sport,
      categoryId,
      teamIds,
      playerIds
    };
  });
  // Rebuild player.tournamentIds from tournament.playerIds (source of truth)
  const tournamentIdsByPlayer = new Map();
  for (const t of store.tournaments || []) {
    for (const pid of t.playerIds || []) {
      if (!tournamentIdsByPlayer.has(pid)) tournamentIdsByPlayer.set(pid, []);
      tournamentIdsByPlayer.get(pid).push(t.id);
    }
  }
  store.players = (store.players || []).map((p) => ({
    assignment: p.teamId ? "team" : "auction",
    sport: "Cricket",
    ...p,
    sport: p.sport || "Cricket",
    // Always derive from tournament.playerIds after migrate (authoritative)
    tournamentIds: tournamentIdsByPlayer.get(p.id) || []
  }));
  store.acplHistory ||= { meta: null, players: [], log: null };
  store.auctions = (store.auctions || []).map((a) => {
    const row = {
      timerSeconds: a.timerSeconds || 20,
      maxByBasePrice: a.maxByBasePrice || {},
      denominators: a.denominators || [a.purse],
      increments: a.increments || DEFAULT_INCREMENTS,
      categoryId: a.categoryId || firstCat,
      minByCategory: a.minByCategory || {},
      ...a
    };
    const cat = row.categoryId;
    const tour = store.tournaments.find((t) => t.id === row.tournamentId);
    const sameCat = (id) => store.teams.find((t) => t.id === id)?.categoryId === cat;
    let teamIds = (row.teamIds || []).filter(sameCat);
    const tourTeams = (tour?.teamIds || []).filter(sameCat);
    if (tourTeams.length && teamIds.length < tourTeams.length) teamIds = [...new Set([...teamIds, ...tourTeams])];
    if (!teamIds.length && tour) teamIds = tourTeams;
    if (!teamIds.length) teamIds = store.teams.filter((t) => t.categoryId === cat).map((t) => t.id);
    row.teamIds = teamIds;
    row.playerIds = (row.playerIds || []).filter((id) => {
      const pl = store.players.find((p) => p.id === id);
      if (!pl || pl.categoryId !== cat) return false;
      const tourSport = String(tour?.sport || "Cricket").toLowerCase();
      return String(pl.sport || "Cricket").toLowerCase() === tourSport;
    });
    return row;
  });
  ensureUsers(store);
  store.registrationForms ||= [];
  store.registrations ||= [];
  store.registrationFiles ||= [];
  store.registrationAudits ||= [];
  if (!store.meta.regFileSecret) {
    store.meta.regFileSecret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  }
  store.tournaments = (store.tournaments || []).map((t) => ({
    logo: "",
    ...t,
    logo: t.logo || ""
  }));
  // Friendly public URL slugs for registration forms
  const slugify = (raw) =>
    String(raw || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  const suggest = (t, idPrefix) => {
    const name = String(t?.name || "");
    const season = name.match(/\bACPL\b.*?\b(?:Season\s*)?(\d+)\b/i);
    if (season) return `ACPL-${season[1]}`;
    const fromPrefix = slugify(String(idPrefix || "").replace(/^REG-?/i, ""));
    if (fromPrefix) return fromPrefix;
    return slugify(name) || slugify(t?.id) || "register";
  };
  const used = new Set();
  store.registrationForms = store.registrationForms.map((f) => {
    let publicSlug = slugify(f.publicSlug) || suggest(
      store.tournaments.find((t) => t.id === f.tournamentId),
      f.idPrefix
    );
    let candidate = publicSlug;
    let n = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${publicSlug}-${n++}`.slice(0, 64);
    used.add(candidate.toLowerCase());
    const fields = (f.fields || []).map((field) => {
      if (field.key !== "auctionTeam") return field;
      // Prefer editable custom team lists; keep tournamentTeams if already set that way
      if (field.config?.source === "tournamentTeams") return field;
      return {
        ...field,
        config: { ...(field.config || {}), source: field.config?.source || "custom" },
        options:
          Array.isArray(field.options) && field.options.length
            ? field.options
            : ["Phoenix", "Royal Challengers", "Vikings", "Royal Warriors", "Mavericks", "Strikers"]
      };
    });
    return { ...f, publicSlug: candidate, fields };
  });
  return store;
}

export function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const seed = emptySeed();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2));
    return seed;
  }
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  try {
    const store = migrate(JSON.parse(raw));
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  } catch (err) {
    // Never replace an existing store with an empty seed — that would wipe
    // registrations, auction config, and all live data. Keep the file and fail loud.
    const backup = `${STORE_PATH}.corrupt.${Date.now()}`;
    try {
      fs.copyFileSync(STORE_PATH, backup);
    } catch {
      /* best-effort backup */
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load store.json (left in place; backup: ${backup}): ${message}`
    );
  }
}

export function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  store.meta.updatedAt = Date.now();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export { STORE_PATH, DEFAULT_INCREMENTS };
