import { acplCareerSummary } from "./acpl.mjs";
import { registrationAdminState } from "./registration.mjs";

export function nextIncrement(current, increments) {
  const sorted = [...(increments || [])].sort((a, b) => a.from - b.from);
  const row = sorted.find((r) => current >= r.from && current < r.to) || sorted[sorted.length - 1];
  return row?.step || 20;
}

export function nextBidAmount(current, basePrice, increments, hasBidder = false) {
  const floor = Math.max(current || 0, basePrice || 0);
  if (!hasBidder) return floor;
  return floor + nextIncrement(floor, increments);
}

function assertTeamCanAfford(store, teamId, stats, amount, label) {
  const teamName = store.teams.find((t) => t.id === teamId)?.name || "this team";
  const purseLeft = Number(stats.purseLeft) || 0;
  const maxBid = Number(stats.maxBid) || 0;
  if (amount > purseLeft + 1e-9) {
    throw new Error(`${label} is more than remaining purse for ${teamName} (${purseLeft}L / ${inrCr(purseLeft)})`);
  }
  if (amount > maxBid + 1e-9) {
    throw new Error(`${label} is more than max bid for ${teamName} (${maxBid}L / ${inrCr(maxBid)})`);
  }
}

function inrCr(lakhs) {
  const cr = Number(lakhs) / 100;
  const text = Number.isInteger(cr) ? String(cr) : cr.toFixed(2).replace(/\.?0+$/, "");
  return `₹${text} Cr`;
}

/** ABPL: remaining purse - ((empty slots - 1) * denominator). Official cap uses the largest denom. */
export function nextMaxBid(purseLeft, rosterCount, maxSquad, denom) {
  const empty = Math.max(0, Number(maxSquad || 0) - Number(rosterCount || 0));
  if (empty <= 0) return 0;
  const reserve = Math.max(0, empty - 1) * Number(denom || 0);
  return Math.max(0, Math.round((Number(purseLeft || 0) - reserve) * 10) / 10);
}

export function auctionTeamIds(store, auction) {
  const cat = auction.categoryId;
  const inCat = (id) => {
    const t = store.teams.find((x) => x.id === id);
    return Boolean(t && (!cat || t.categoryId === cat));
  };
  const tour = auction.tournamentId ? store.tournaments.find((t) => t.id === auction.tournamentId) : null;
  const fromAuction = (auction.teamIds || []).filter(inCat);
  const fromTour = (tour?.teamIds || []).filter(inCat);
  let ids = fromAuction;
  if (fromTour.length && ids.length < fromTour.length) ids = [...new Set([...ids, ...fromTour])];
  if (!ids.length) {
    ids = store.teams.filter((t) => !cat || t.categoryId === cat).map((t) => t.id);
  }
  return [...new Set(ids)];
}

export function teamRetentions(store, teamId) {
  const team = store.teams.find((t) => t.id === teamId);
  return team?.retentions || [];
}

export function teamRosterRows(store, auction, teamId) {
  const retained = teamRetentions(store, teamId).map((r) => ({
    playerId: r.playerId,
    teamId,
    basePrice: r.basePrice,
    soldPrice: r.soldPrice,
    retained: true,
    at: r.at || 0
  }));
  const sold = (auction.live?.sold || []).filter((s) => s.teamId === teamId);
  return [...retained, ...sold];
}

export function teamLiveStats(store, auction, teamId) {
  const live = auction.live;
  const roster = teamRosterRows(store, auction, teamId);
  const purseSpent = roster.reduce((s, r) => s + Number(r.soldPrice || 0), 0);
  const purseLeft = Math.max(0, auction.purse - purseSpent);
  const current = live ? store.players.find((p) => p.id === live.currentPlayerId) || null : null;

  const ownedRoles = {};
  for (const row of roster) {
    const pl = store.players.find((p) => p.id === row.playerId);
    if (!pl) continue;
    const role = pl.role || "Player";
    ownedRoles[role] = (ownedRoles[role] || 0) + 1;
  }

  const lookupMaxAtBase = (base) => {
    const map = auction.maxByBasePrice || {};
    const n = Number(base);
    for (const c of [String(base), String(n)]) {
      if (map[c] != null && map[c] !== "") return Number(map[c]);
    }
    for (const [k, v] of Object.entries(map)) {
      if (Number(k) === n && v != null && v !== "") return Number(v);
    }
    return null;
  };

  const countAtBase = (base) =>
    roster.filter((row) => {
      const pl = store.players.find((p) => p.id === row.playerId);
      const bp = Number(row.basePrice ?? pl?.basePrice);
      return Number.isFinite(bp) && bp === Number(base);
    }).length;

  const baseCap = current ? lookupMaxAtBase(current.basePrice) : null;
  const atBaseLimit =
    current && baseCap != null && countAtBase(current.basePrice) >= Number(baseCap);

  const denoms = auction.denominators?.length ? auction.denominators : [auction.purse];
  const maxBidByDenom = denoms.map((d) => ({
    purse: d,
    maxBid: nextMaxBid(purseLeft, roster.length, auction.maxSquad, d)
  }));
  const denomNums = denoms.map(Number).filter((n) => n > 0);
  const canonicalDenom = denomNums.length ? Math.max(...denomNums) : Number(auction.purse) || 0;
  const maxBid = nextMaxBid(purseLeft, roster.length, auction.maxSquad, canonicalDenom);

  const minNext = current
    ? nextBidAmount(live?.currentBid || 0, current.basePrice, auction.increments, Boolean(live?.lastBidTeamId))
    : 0;

  const categoryBought = Object.keys(ownedRoles).map((role) => ({
    id: role,
    name: role,
    count: ownedRoles[role],
    players: roster
      .map((row) => {
        const pl = store.players.find((p) => p.id === row.playerId);
        if (!pl || (pl.role || "Player") !== role) return null;
        return { ...pl, basePrice: row.basePrice, soldPrice: row.soldPrice, retained: !!row.retained };
      })
      .filter(Boolean)
  }));

  const baseKeys = new Set();
  for (const k of Object.keys(auction.maxByBasePrice || {})) {
    if (Number.isFinite(Number(k))) baseKeys.add(String(Number(k)));
  }
  for (const id of auction.playerIds || []) {
    const pl = store.players.find((p) => p.id === id);
    if (pl && Number.isFinite(Number(pl.basePrice))) baseKeys.add(String(Number(pl.basePrice)));
  }
  const baseSlots = [...baseKeys]
    .sort((a, b) => Number(a) - Number(b))
    .map((base) => {
      const cap = lookupMaxAtBase(base);
      const owned = countAtBase(Number(base));
      return {
        basePrice: Number(base),
        owned,
        cap,
        left: cap == null ? null : Math.max(0, cap - owned)
      };
    })
    .filter((b) => b.cap != null);

  return {
    teamId,
    rosterCount: roster.length,
    purseLeft,
    purseSpent,
    maxBid,
    maxBidByDenom,
    atBaseLimit,
    baseCount: current ? countAtBase(current.basePrice) : 0,
    baseCap: baseCap == null ? null : Number(baseCap),
    roster: roster.map((row) => {
      const pl = store.players.find((p) => p.id === row.playerId);
      return {
        ...row,
        playerName: pl?.name || "",
        role: pl?.role || ""
      };
    }),
    categoryBought,
    baseSlots,
    canBid:
      auction.status === "live" &&
      current &&
      live?.phase === "bidding" &&
      roster.length < auction.maxSquad &&
      !atBaseLimit &&
      purseLeft >= minNext &&
      maxBid >= minNext
  };
}

function catName(store, id) {
  return store.categories.find((c) => c.id === id)?.name || "";
}

export function publicState(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId || a.code === auctionId);
  if (!auction) return null;
  const teamIds = auctionTeamIds(store, auction);
  const teams = teamIds.map((id) => store.teams.find((t) => t.id === id)).filter(Boolean);
  const live = auction.live;
  const current = live ? store.players.find((p) => p.id === live.currentPlayerId) : null;
  const lastTeam = live?.lastBidTeamId ? store.teams.find((t) => t.id === live.lastBidTeamId) : null;

  const unsoldIds = Object.entries(live?.unsoldPasses || {})
    .filter(([, n]) => n > 0)
    .map(([id]) => id);

  return {
    meta: { updatedAt: store.meta.updatedAt },
    auction: {
      id: auction.id,
      code: auction.code,
      name: auction.name,
      status: auction.status,
      purse: auction.purse,
      denominators: auction.denominators,
      minSquad: auction.minSquad,
      maxSquad: auction.maxSquad,
      minByCategory: auction.minByCategory,
      maxByBasePrice: auction.maxByBasePrice,
      increments: auction.increments,
      timerSeconds: auction.timerSeconds,
      sequence: auction.sequence,
      categoryId: auction.categoryId,
      tournamentId: auction.tournamentId,
      sport: store.tournaments.find((t) => t.id === auction.tournamentId)?.sport || "Cricket",
      liveBidding: store.meta.liveBidding === true
    },
    categories: store.categories,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      logo: t.logo,
      color: t.color,
      categoryId: t.categoryId,
      retentions: t.retentions || [],
      stats: teamLiveStats(store, auction, t.id)
    })),
    players: store.players
      .filter((p) => auction.playerIds.includes(p.id) || teams.some((t) => (t.retentions || []).some((r) => r.playerId === p.id)))
      .map((p) => ({
        ...p,
        categoryName: catName(store, p.categoryId),
        pin: undefined
      })),
    live: live
      ? {
          ...live,
          currentPlayer: current
            ? {
                ...current,
                categoryName: catName(store, current.categoryId),
                acpl: current.acplPlayerId
                  ? acplCareerSummary(store, current.acplPlayerId) || acplCareerSummary(store, current.name)
                  : acplCareerSummary(store, current.name)
              }
            : null,
          lastBidTeamName: lastTeam?.name || null,
          lastBidTeamColor: lastTeam?.color || null,
          lastBidTeamLogo: lastTeam?.logo || null,
          remainingCount: live.remainingPlayerIds.filter((id) => {
            const p = store.players.find((x) => x.id === id);
            return p && !playerLockedToTeam(store, p) && id !== live.currentPlayerId;
          }).length,
          soldCount: live.sold.length,
          unsoldPlayers: unsoldIds
            .map((id) => store.players.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => ({ ...p, categoryName: catName(store, p.categoryId) })),
          remainingPlayers: scrambleIds(
            live.remainingPlayerIds.filter((id) => {
              if (id === live.currentPlayerId) return false;
              const p = store.players.find((x) => x.id === id);
              return p && !playerLockedToTeam(store, p);
            }),
            auction.id + ":" + String(live.startedAt || "")
          )
            .map((id) => store.players.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => ({ ...p, categoryName: catName(store, p.categoryId) }))
        }
      : null
  };
}

export function adminState(store) {
  return {
    meta: {
      updatedAt: store.meta.updatedAt,
      liveBidding: store.meta.liveBidding === true
    },
    tournaments: store.tournaments,
    categories: store.categories,
    teams: store.teams,
    players: store.players,
    owners: store.owners.map((o) => ({ ...o, passwordHash: undefined })),
    users: (store.users || []).map((u) => ({ ...u, passwordHash: undefined })),
    auctions: store.auctions.map((a) => ({
      ...a,
      live: a.live ? { ...a.live, remainingCount: a.live.remainingPlayerIds.length } : null
    })),
    acplHistory: {
      meta: store.acplHistory?.meta || null,
      playerCount: store.acplHistory?.players?.length || 0,
      log: store.acplHistory?.log
        ? {
            totalSeasonsProcessed: store.acplHistory.log.totalSeasonsProcessed,
            totalFilesProcessed: store.acplHistory.log.totalFilesProcessed,
            uniquePlayers: store.acplHistory.log.uniquePlayers,
            playersBySeasonCount: store.acplHistory.log.playersBySeasonCount,
            duplicateAmbiguousNames: (store.acplHistory.log.duplicateAmbiguousNames || []).length,
            importErrors: store.acplHistory.log.importErrors || []
          }
        : null,
      players: (store.acplHistory?.players || []).map((p) => ({
        id: p.id,
        name: p.name,
        normalizedName: p.normalizedName,
        seasonsPlayed: p.seasonsPlayed,
        seasonsCount: p.seasonsCount,
        career: p.career
      }))
    },
    registration: registrationAdminState(store)
  };
}

/** Dashboard payload for a team owner: team, linked tournaments, and auctions. */
export function ownerHome(store, teamId) {
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const category = store.categories.find((c) => c.id === team.categoryId);
  const byId = new Map();
  const addPlayer = (p, extra = {}) => {
    if (!p) return;
    const prev = byId.get(p.id) || {};
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      role: p.role || "",
      photo: p.photo || "",
      phone: p.phone || "",
      basePrice: p.basePrice,
      categoryId: p.categoryId,
      categoryName: catName(store, p.categoryId),
      assignment: p.assignment || "",
      source: extra.source || prev.source || (p.assignment === "retained" ? "retained" : p.assignment === "team" ? "assigned" : "bought"),
      soldPrice: extra.soldPrice != null ? extra.soldPrice : prev.soldPrice ?? p.soldPrice ?? null,
      auctionName: extra.auctionName || prev.auctionName || "",
      auctionId: extra.auctionId || prev.auctionId || null
    });
  };
  for (const p of store.players) {
    if (p.teamId === team.id || (team.playerIds || []).includes(p.id)) {
      addPlayer(p);
    }
  }
  for (const a of store.auctions || []) {
    for (const s of a.live?.sold || []) {
      if (s.teamId !== team.id) continue;
      addPlayer(store.players.find((x) => x.id === s.playerId), {
        source: "bought",
        soldPrice: s.soldPrice,
        auctionName: a.name,
        auctionId: a.id
      });
    }
  }
  for (const r of team.retentions || []) {
    addPlayer(store.players.find((x) => x.id === r.playerId), {
      source: "retained",
      soldPrice: r.soldPrice
    });
  }
  const roster = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const purseSpent = roster.reduce((s, p) => s + Number(p.soldPrice || 0), 0);
  const tournaments = (store.tournaments || [])
    .filter((t) => (t.teamIds || []).includes(team.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport || "Cricket",
      venue: t.venue || "",
      startDate: t.startDate || "",
      endDate: t.endDate || "",
      categoryId: t.categoryId,
      categoryName: store.categories.find((c) => c.id === t.categoryId)?.name || "",
      hasAuction: t.hasAuction !== false
    }));
  const auctions = (store.auctions || [])
    .filter((a) => auctionTeamIds(store, a).includes(team.id))
    .map((a) => {
      const tour = store.tournaments.find((t) => t.id === a.tournamentId);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        status: a.status || "draft",
        tournamentId: a.tournamentId || null,
        tournamentName: tour?.name || "",
        sport: tour?.sport || "Cricket",
        categoryId: a.categoryId,
        categoryName: store.categories.find((c) => c.id === a.categoryId)?.name || "",
        inAuction: true
      };
    })
    .sort((a, b) => {
      const rank = { live: 0, paused: 1, draft: 2, completed: 3 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.name.localeCompare(b.name);
    });
  return {
    team: {
      id: team.id,
      name: team.name,
      color: team.color,
      logo: team.logo || "",
      sport: team.sport || "Cricket",
      categoryId: team.categoryId,
      categoryName: category?.name || "",
      rosterCount: roster.length,
      purseSpent
    },
    roster,
    tournaments,
    auctions
  };
}

function scrambleIds(ids, salt) {
  return [...ids].sort((a, b) => {
    const ha = [...String(salt) + a].reduce((s, c) => (Math.imul(s, 33) + c.charCodeAt(0)) | 0, 5381);
    const hb = [...String(salt) + b].reduce((s, c) => (Math.imul(s, 33) + c.charCodeAt(0)) | 0, 5381);
    return ha - hb;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function playerLockedToTeam(store, p) {
  if (!p) return true;
  if (p.assignment === "team" || p.assignment === "retained") return true;
  if (store.teams.some((t) => (t.playerIds || []).includes(p.id))) return true;
  if (store.teams.some((t) => (t.retentions || []).some((r) => r.playerId === p.id))) return true;
  return false;
}

export function retainedPlayerIds(store, teamIds) {
  const ids = new Set();
  for (const t of store.teams) {
    if (teamIds && !teamIds.includes(t.id)) continue;
    for (const r of t.retentions || []) ids.add(r.playerId);
  }
  return ids;
}

export function buildQueue(store, auction) {
  const players = auction.playerIds
    .map((id) => store.players.find((p) => p.id === id))
    .filter(Boolean)
    .filter((p) => !playerLockedToTeam(store, p));
  if (auction.sequence === "category") {
    const groups = {};
    for (const p of players) (groups[p.categoryId] ||= []).push(p.id);
    const order = [];
    for (const cat of store.categories) order.push(...shuffle(groups[cat.id] || []));
    for (const id of Object.keys(groups)) {
      if (!store.categories.some((c) => c.id === id)) order.push(...shuffle(groups[id]));
    }
    return order;
  }
  return shuffle(players.map((p) => p.id));
}

export function startAuction(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId || a.code === String(auctionId || "").toUpperCase());
  if (!auction) throw new Error("Auction not found");
  auction.teamIds = auctionTeamIds(store, auction);
  for (const row of auction.live?.sold || []) {
    const p = store.players.find((x) => x.id === row.playerId);
    if (p && !playerLockedToTeam(store, p)) p.teamId = null;
  }
  const queue = buildQueue(store, auction);
  auction.status = "live";
  auction.live = {
    remainingPlayerIds: queue,
    currentPlayerId: null,
    currentBid: 0,
    lastBidTeamId: null,
    phase: "idle",
    timerEndsAt: null,
    timerFrozenMs: null,
    sold: [],
    unsoldPasses: {},
    finalUnsold: [],
    history: [],
    celebration: null,
    offerEnd: false,
    startedAt: Date.now(),
    endedAt: null,
    lotStartedAt: null,
    lotTimes: [],
    rev: Date.now()
  };
  const retained = retainedPlayerIds(store, auction.teamIds);
  for (const p of store.players) {
    if (!auction.playerIds.includes(p.id)) continue;
    if (playerLockedToTeam(store, p) || retained.has(p.id)) continue;
    p.teamId = null;
  }
  if (queue.length) pickNext(store, auction.id);
  else {
    auction.live.phase = "done";
    auction.live.offerEnd = true;
  }
  return auction;
}

function bumpLive(live) {
  if (live) live.rev = Date.now();
}

function closeLotClock(live, playerId) {
  if (live.lotStartedAt) {
    live.lotTimes.push({ playerId, ms: Date.now() - live.lotStartedAt });
    live.lotStartedAt = null;
  }
}

export function pickNext(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId || a.code === String(auctionId || "").toUpperCase());
  if (!auction?.live) throw new Error("Start the auction first");
  if (auction.status === "paused") throw new Error("Resume the auction first");
  if (auction.live.phase === "bidding") {
    if (auction.live.lastBidTeamId) markSold(store, auction.id);
    else markUnsold(store, auction.id);
  }
  if (auction.status === "completed" || auction.live.phase === "done") return auction;
  auction.live.remainingPlayerIds = auction.live.remainingPlayerIds.filter((id) => {
    const p = store.players.find((x) => x.id === id);
    return p && !playerLockedToTeam(store, p);
  });
  const nextId = auction.live.remainingPlayerIds[0];
  if (!nextId) {
    auction.live.phase = "done";
    auction.live.offerEnd = true;
    auction.live.currentPlayerId = null;
    bumpLive(auction.live);
    return auction;
  }
  const player = store.players.find((p) => p.id === nextId);
  auction.live.currentPlayerId = nextId;
  auction.live.currentBid = player.basePrice;
  auction.live.lastBidTeamId = null;
  auction.live.phase = "bidding";
  auction.live.timerEndsAt = Date.now() + auction.timerSeconds * 1000;
  auction.live.timerFrozenMs = null;
  auction.live.celebration = null;
  auction.live.lotStartedAt = Date.now();
  auction.live.history.push({ type: "pick", playerId: nextId, at: Date.now() });
  bumpLive(auction.live);
  return auction;
}

export function placeBid(store, auctionId, teamId, amount, opts = {}) {
  const staff = Boolean(opts.staff);
  if (store.meta.liveBidding !== true && !staff) {
    throw new Error("Live bidding is off. The auctioneer is taking bids.");
  }
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live || auction.live.phase !== "bidding") throw new Error("No live lot — put a player on the block first");
  if (auction.status !== "live") throw new Error("Auction is paused");
  const player = store.players.find((p) => p.id === auction.live.currentPlayerId);
  if (!player) throw new Error("No player on the block");
  if (!staff && auction.live.lastBidTeamId === teamId) throw new Error("You already hold the bid");

  const stats = teamLiveStats(store, auction, teamId);
  if (stats.atBaseLimit) throw new Error("Squad limit reached for this base price");
  const minNext = nextBidAmount(
    auction.live.currentBid,
    player.basePrice,
    auction.increments,
    Boolean(auction.live.lastBidTeamId)
  );
  const requested = amount == null || amount === "" ? null : Number(amount);
  const bid = Number.isFinite(requested) ? requested : minNext;
  const floor = staff ? Number(player.basePrice) || 0 : minNext;
  if (bid < floor - 1e-9) {
    throw new Error(staff ? `Bid cannot be below base (${floor}L)` : `Minimum bid is ${minNext}L`);
  }
  if (stats.rosterCount >= auction.maxSquad) throw new Error("Squad is full");
  assertTeamCanAfford(store, teamId, stats, bid, "Bid");

  auction.live.currentBid = bid;
  auction.live.lastBidTeamId = teamId;
  auction.live.timerEndsAt = Date.now() + auction.timerSeconds * 1000;
  auction.live.history.push({ type: "bid", teamId, playerId: player.id, amount: bid, at: Date.now() });
  bumpLive(auction.live);
  return auction;
}

export function markSold(store, auctionId, override = {}) {
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live || auction.live.phase !== "bidding") throw new Error("No live lot");
  const live = auction.live;
  const player = store.players.find((p) => p.id === live.currentPlayerId);
  const teamId = override.teamId || live.lastBidTeamId;
  const hasOverride = override.price != null && override.price !== "";
  const soldPrice = hasOverride ? Number(override.price) : live.currentBid;
  if (!teamId) throw new Error("No bids yet — mark unsold instead");
  if (!Number.isFinite(soldPrice) || soldPrice <= 0) throw new Error("Enter a valid sold price");
  const stats = teamLiveStats(store, auction, teamId);
  if (stats.rosterCount >= auction.maxSquad) throw new Error("That squad is full");
  assertTeamCanAfford(store, teamId, stats, soldPrice, "Sold price");
  const row = {
    playerId: player.id,
    teamId,
    basePrice: player.basePrice,
    soldPrice,
    at: Date.now()
  };
  live.sold.push(row);
  player.teamId = teamId;
  live.remainingPlayerIds = live.remainingPlayerIds.filter((id) => id !== player.id);
  closeLotClock(live, player.id);
  live.history.push({ type: "sold", ...row });
  live.celebration = { playerId: player.id, teamId, soldPrice, at: Date.now() };
  live.phase = "idle";
  live.currentPlayerId = null;
  live.currentBid = 0;
  live.lastBidTeamId = null;
  live.timerEndsAt = null;
  if (!live.remainingPlayerIds.length) {
    live.phase = "done";
    live.offerEnd = true;
  }
  bumpLive(live);
  return auction;
}

export function markUnsold(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live || auction.live.phase !== "bidding") throw new Error("No live lot");
  const live = auction.live;
  const playerId = live.currentPlayerId;
  live.remainingPlayerIds = live.remainingPlayerIds.filter((id) => id !== playerId);
  const passes = (live.unsoldPasses[playerId] || 0) + 1;
  live.unsoldPasses[playerId] = passes;
  if (passes >= 2) {
    live.finalUnsold.push(playerId);
  } else {
    live.remainingPlayerIds.push(playerId);
  }
  closeLotClock(live, playerId);
  live.history.push({ type: "unsold", playerId, at: Date.now() });
  live.phase = "idle";
  live.currentPlayerId = null;
  live.currentBid = 0;
  live.lastBidTeamId = null;
  live.timerEndsAt = null;
  live.celebration = null;
  if (!live.remainingPlayerIds.length) {
    live.phase = "done";
    live.offerEnd = true;
  }
  bumpLive(live);
  return auction;
}

export function endAuction(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId || a.code === String(auctionId || "").toUpperCase());
  if (!auction?.live) throw new Error("Start the auction first");
  auction.status = "completed";
  auction.live.phase = "done";
  auction.live.offerEnd = false;
  auction.live.currentPlayerId = null;
  auction.live.timerEndsAt = null;
  auction.live.endedAt = Date.now();
  bumpLive(auction.live);
  return auction;
}

export function pauseAuction(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live) throw new Error("Start the auction first");
  if (auction.status === "paused") {
    auction.status = "live";
    if (auction.live.phase === "bidding") {
      const leftover = auction.live.timerFrozenMs;
      const ms = leftover != null && leftover > 0 ? leftover : auction.timerSeconds * 1000;
      auction.live.timerEndsAt = Date.now() + ms;
      auction.live.timerFrozenMs = null;
    }
  } else if (auction.status === "live") {
    auction.status = "paused";
    if (auction.live.timerEndsAt) {
      auction.live.timerFrozenMs = Math.max(0, auction.live.timerEndsAt - Date.now());
      auction.live.timerEndsAt = null;
    } else if (auction.live.phase === "bidding") {
      auction.live.timerFrozenMs = auction.timerSeconds * 1000;
    }
  } else {
    throw new Error("Start the auction first");
  }
  bumpLive(auction.live);
  return auction;
}

export function resetTimer(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live) throw new Error("Start the auction first");
  if (auction.live.phase !== "bidding") throw new Error("Bring a player on the block first");
  const ms = auction.timerSeconds * 1000;
  if (auction.status === "paused") {
    auction.live.timerFrozenMs = ms;
    auction.live.timerEndsAt = null;
  } else {
    auction.status = "live";
    auction.live.timerEndsAt = Date.now() + ms;
    auction.live.timerFrozenMs = null;
  }
  bumpLive(auction.live);
  return auction;
}

export function applyAutoHammer(store) {
  const changed = [];
  for (const auction of store.auctions) {
    if (auction.status !== "live" || auction.live?.phase !== "bidding") continue;
    if (!auction.live.timerEndsAt || Date.now() < auction.live.timerEndsAt) continue;
    if (auction.live.lastBidTeamId) markSold(store, auction.id);
    else markUnsold(store, auction.id);
    changed.push(auction.id);
  }
  return changed;
}

export function undoLast(store, auctionId) {
  const auction = store.auctions.find((a) => a.id === auctionId);
  if (!auction?.live) throw new Error("Auction is not live");
  const live = auction.live;
  const last = live.history[live.history.length - 1];
  if (!last) throw new Error("Nothing to undo");
  if (last.type === "bid" && live.phase === "bidding") {
    live.history.pop();
    const bids = live.history.filter((h) => h.type === "bid" && h.playerId === live.currentPlayerId);
    const prior = bids[bids.length - 1];
    const player = store.players.find((p) => p.id === live.currentPlayerId);
    live.currentBid = prior ? prior.amount : player.basePrice;
    live.lastBidTeamId = prior ? prior.teamId : null;
    bumpLive(live);
    return auction;
  }
  if (last.type === "sold") {
    live.sold = live.sold.filter((s) => !(s.playerId === last.playerId && s.at === last.at));
    const player = store.players.find((p) => p.id === last.playerId);
    if (player) player.teamId = null;
    live.remainingPlayerIds.unshift(last.playerId);
    live.currentPlayerId = last.playerId;
    live.currentBid = last.soldPrice;
    live.lastBidTeamId = last.teamId;
    live.phase = "bidding";
    auction.status = "live";
    live.endedAt = null;
    live.history = live.history.filter((h) => h !== last);
    live.celebration = null;
    live.timerEndsAt = Date.now() + auction.timerSeconds * 1000;
    live.offerEnd = false;
    bumpLive(live);
    return auction;
  }
  if (last.type === "unsold") {
    live.remainingPlayerIds = live.remainingPlayerIds.filter((id) => id !== last.playerId);
    live.finalUnsold = (live.finalUnsold || []).filter((id) => id !== last.playerId);
    live.unsoldPasses[last.playerId] = Math.max(0, (live.unsoldPasses[last.playerId] || 1) - 1);
    live.remainingPlayerIds.unshift(last.playerId);
    live.currentPlayerId = last.playerId;
    const player = store.players.find((p) => p.id === last.playerId);
    live.currentBid = player.basePrice;
    live.lastBidTeamId = null;
    live.phase = "bidding";
    auction.status = "live";
    live.endedAt = null;
    live.offerEnd = false;
    live.history = live.history.filter((h) => h !== last);
    live.timerEndsAt = Date.now() + auction.timerSeconds * 1000;
    bumpLive(live);
    return auction;
  }
  if (last.type === "pick") {
    live.history.pop();
    live.phase = "idle";
    live.currentPlayerId = null;
    live.currentBid = 0;
    live.lastBidTeamId = null;
    live.timerEndsAt = null;
    live.lotStartedAt = null;
    bumpLive(live);
    return auction;
  }
  throw new Error("Cannot undo");
}

export function applyRetentions(store, teamId, playerIds) {
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) throw new Error("Team not found");
  const prev = new Set((team.retentions || []).map((r) => r.playerId));
  for (const id of prev) {
    if (!playerIds.includes(id)) {
      const p = store.players.find((x) => x.id === id);
      if (p && p.teamId === teamId) {
        p.teamId = null;
        p.assignment = "auction";
      }
    }
  }
  team.retentions = [];
  for (const id of playerIds) {
    const p = store.players.find((x) => x.id === id);
    if (!p) continue;
    const soldPrice = Number(p.basePrice) * 2;
    team.retentions.push({
      playerId: p.id,
      basePrice: p.basePrice,
      soldPrice,
      at: Date.now()
    });
    p.teamId = teamId;
    p.assignment = "retained";
  }
  return team;
}
