import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Known ACPL Season 6 Cricheroes share links (admin-provided). */
export const ACPL6_CRICHEROES_LINKS = [
  { name: "Royal Challengers", shareUrl: "https://chshare.link/team/kX42bL", shareSlug: "kX42bL", teamId: "3980746" },
  { name: "Mavericks", shareUrl: "https://chshare.link/team/kFUmMj", shareSlug: "kFUmMj", teamId: "3067973" },
  { name: "Royal Warriors", shareUrl: "https://chshare.link/team/iI6NfX", shareSlug: "iI6NfX", teamId: "3067975" },
  { name: "Vikings", shareUrl: "https://chshare.link/team/g2HS2a", shareSlug: "g2HS2a", teamId: "3980744" },
  { name: "Phoenix", shareUrl: "https://chshare.link/team/nQFA1C", shareSlug: "nQFA1C", teamId: "3067979" },
  { name: "Strikers", shareUrl: "https://chshare.link/team/kKfiMZ", shareSlug: "kKfiMZ", teamId: "3067980" }
];

let seedCache = null;
function loadSeed() {
  if (seedCache) return seedCache;
  const seedPath = path.join(__dirname, "cricheroes-seed.json");
  try {
    seedCache = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  } catch {
    seedCache = { teams: {}, notes: [] };
  }
  return seedCache;
}

function fetchText(url, { headers = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/json,*/*",
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          fetchText(next, { headers, timeoutMs }).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, body, url: url });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

/** Resolve chshare.link / cricheroes profile URL → { teamId, slug, profileUrl }. */
export async function resolveCricheroesShare(shareOrProfileUrl) {
  const input = String(shareOrProfileUrl || "").trim();
  if (!input) throw new Error("Cricheroes URL required");

  const direct = input.match(/team-profile\/(\d+)\/([^/?#]+)/i);
  if (direct) {
    const teamId = direct[1];
    const slug = decodeURIComponent(direct[2]);
    return {
      teamId,
      slug,
      profileUrl: `https://cricheroes.com/team-profile/${teamId}/${slug}`,
      shareUrl: input.includes("chshare.link") ? input : "",
      shareSlug: ""
    };
  }

  const shareSlug = (input.match(/chshare\.link\/team\/([A-Za-z0-9]+)/i) || [])[1] || "";
  // Known ACPL map (works even if share host is slow)
  const known = ACPL6_CRICHEROES_LINKS.find((l) => l.shareSlug === shareSlug);
  if (known?.teamId) {
    const slug = known.name.replace(/\s+/g, "-");
    return {
      teamId: known.teamId,
      slug,
      profileUrl: `https://cricheroes.com/team-profile/${known.teamId}/${slug}`,
      shareUrl: known.shareUrl,
      shareSlug: known.shareSlug
    };
  }

  const url = shareSlug ? `https://chshare.link/team/${shareSlug}` : input;
  const { status, body } = await fetchText(url);
  if (status >= 400) throw new Error(`Could not resolve share link (HTTP ${status})`);

  const next = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (next) {
    try {
      const data = JSON.parse(next[1]);
      const profileUrl = data?.props?.pageProps?.link_data?.url || "";
      const m = String(profileUrl).match(/team-profile\/(\d+)\/([^/?#]+)/i);
      if (m) {
        return {
          teamId: m[1],
          slug: decodeURIComponent(m[2]),
          profileUrl: `https://cricheroes.com/team-profile/${m[1]}/${decodeURIComponent(m[2])}`,
          shareUrl: url,
          shareSlug: shareSlug || data?.props?.pageProps?.id || ""
        };
      }
    } catch {
      /* fall through */
    }
  }

  const m = body.match(/team-profile\/(\d+)\/([^"'/\s]+)/i);
  if (!m) throw new Error("Could not find Cricheroes team id in share page");
  return {
    teamId: m[1],
    slug: decodeURIComponent(m[2]),
    profileUrl: `https://cricheroes.com/team-profile/${m[1]}/${decodeURIComponent(m[2])}`,
    shareUrl: url,
    shareSlug
  };
}

function emptyCache(meta = {}) {
  return {
    fetchedAt: null,
    source: null,
    notes: [],
    name: meta.name || "",
    logo: "",
    location: "",
    teamId: meta.teamId || "",
    slug: meta.slug || "",
    profileUrl: meta.profileUrl || "",
    shareUrl: meta.shareUrl || "",
    tabs: {
      members: meta.profileUrl ? `${meta.profileUrl}/members` : "",
      matches: meta.profileUrl ? `${meta.profileUrl}/matches` : "",
      stats: meta.profileUrl ? `${meta.profileUrl}/stats` : "",
      leaderboard: meta.profileUrl ? `${meta.profileUrl}/leaderboard` : "",
      profile: meta.profileUrl || ""
    },
    stats: [],
    leaderboard: { batting: [], bowling: [], fielding: [] },
    matches: { past: [], upcoming: [] },
    members: []
  };
}

function applySeedToCache(meta, seedTeam, seedMeta) {
  const cache = emptyCache(meta);
  cache.fetchedAt = seedMeta?.fetchedAt || new Date().toISOString();
  cache.source = "public_profile_seed";
  cache.notes = [...(seedMeta?.notes || [])];
  cache.name = seedTeam.name || cache.name;
  cache.location = seedTeam.location || "";
  cache.logo = seedTeam.logo || "";
  cache.stats = Array.isArray(seedTeam.stats) ? seedTeam.stats : [];
  cache.leaderboard = {
    batting: seedTeam.leaderboard?.batting || [],
    bowling: seedTeam.leaderboard?.bowling || [],
    fielding: seedTeam.leaderboard?.fielding || []
  };
  cache.matches = {
    past: seedTeam.matches?.past || [],
    upcoming: seedTeam.matches?.upcoming || []
  };
  cache.members = Array.isArray(seedTeam.members) ? seedTeam.members : [];
  return cache;
}

/** Attach / refresh Cricheroes metadata + seeded public profile snapshot onto a store team. */
export async function syncTeamCricheroes(store, team, { shareUrl } = {}) {
  const url = String(shareUrl || team.cricheroesShareUrl || team.cricheroesProfileUrl || "").trim();
  if (!url) throw new Error("Set a Cricheroes share or profile URL on this team first");

  const resolved = await resolveCricheroesShare(url);
  team.cricheroesShareUrl = resolved.shareUrl || team.cricheroesShareUrl || url;
  team.cricheroesShareSlug = resolved.shareSlug || team.cricheroesShareSlug || "";
  team.cricheroesTeamId = resolved.teamId;
  team.cricheroesSlug = resolved.slug;
  team.cricheroesProfileUrl = resolved.profileUrl;

  const meta = {
    name: team.name,
    teamId: resolved.teamId,
    slug: resolved.slug,
    profileUrl: resolved.profileUrl,
    shareUrl: team.cricheroesShareUrl
  };

  const seed = loadSeed();
  const seedTeam = seed?.teams?.[String(resolved.teamId)];
  let cache;
  if (seedTeam) {
    cache = applySeedToCache(meta, seedTeam, seed);
  } else {
    cache = emptyCache(meta);
    cache.fetchedAt = new Date().toISOString();
    cache.source = "share_resolve";
    cache.notes = [
      "Share link resolved to Cricheroes team profile.",
      "No local snapshot for this team id yet. Open live tabs on CricHeroes, or ask an admin to refresh the public profile seed."
    ];
  }

  // Preserve manually entered upcoming matches if seed/API returned none
  const prevUpcoming = team.cricheroes?.matches?.upcoming || [];
  if ((!cache.matches.upcoming || !cache.matches.upcoming.length) && prevUpcoming.length) {
    cache.matches.upcoming = prevUpcoming;
    cache.notes.push("Kept previously saved upcoming matches (CricHeroes showed none).");
  }

  team.cricheroes = cache;
  return { team, cache, resolved };
}

export function applyAcpl6CricheroesLinks(store) {
  let linked = 0;
  for (const link of ACPL6_CRICHEROES_LINKS) {
    const team = (store.teams || []).find(
      (t) => String(t.name || "").trim().toLowerCase() === link.name.toLowerCase()
    );
    if (!team) continue;
    team.cricheroesShareUrl = link.shareUrl;
    team.cricheroesShareSlug = link.shareSlug;
    linked += 1;
  }
  return { linked };
}

export async function syncAllLinkedCricheroes(store) {
  applyAcpl6CricheroesLinks(store);
  const results = [];
  for (const team of store.teams || []) {
    if (!team.cricheroesShareUrl && !team.cricheroesProfileUrl) continue;
    try {
      const res = await syncTeamCricheroes(store, team);
      results.push({ teamId: team.id, name: team.name, ok: true, teamIdCh: res.resolved.teamId, source: res.cache?.source });
    } catch (e) {
      results.push({ teamId: team.id, name: team.name, ok: false, error: e.message });
    }
  }
  return { results };
}
