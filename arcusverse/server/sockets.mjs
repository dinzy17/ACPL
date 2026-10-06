import {
  adminState,
  publicState,
  ownerHome,
  auctionTeamIds,
  startAuction,
  pickNext,
  placeBid,
  markSold,
  markUnsold,
  undoLast,
  pauseAuction,
  resetTimer,
  applyAutoHammer,
  applyRetentions,
  lotCurrentBid,
  endAuction
} from "./engine.mjs";
import { uid, pin4, hashPw, saveUpload, saveCelebrationGif, saveStore, DEFAULT_INCREMENTS, publicUser } from "./store.mjs";
import { buildAuctionFixture } from "./schedule.mjs";
import { normalizeYoutubeLiveUrl } from "../lib/youtube.mjs";
import { importAcplHistory, defaultAcplDataRoot, findAcplPlayer, acplCareerSummary } from "./acpl.mjs";
import {
  applyAcpl6CricheroesLinks,
  syncAllLinkedCricheroes,
  syncTeamCricheroes
} from "./cricheroes.mjs";
import {
  createForm,
  upsertForm,
  setFormStatus,
  deleteForm,
  recreateForm,
  dashboardForForm,
  listRegistrations,
  updateRegistrationStatus,
  setPaymentStatus,
  deleteRegistration,
  exportCsv,
  signFileAccess,
  getFormByTournament,
  validateFormForOpen,
  mergeAuctionPlayers,
  linkPlayerToAcpl,
  unlinkPlayerFromAcpl,
  searchAcplPlayers,
  clearRegistrationBasePrices,
  dedupePlayersByName,
  syncRegistrationPhotos
} from "./registration.mjs";

function rosterFromTournament(store, tournament) {
  const categoryId = tournament?.categoryId || store.categories[0]?.id;
  const wantSport = String(tournament?.sport || "Cricket").toLowerCase();
  const teamIds = (tournament?.teamIds || []).filter((id) => {
    const t = store.teams.find((x) => x.id === id);
    return t && t.categoryId === categoryId && String(t.sport || "Cricket").toLowerCase() === wantSport;
  });
  const playerIds = store.players
    .filter(
      (p) =>
        p.categoryId === categoryId &&
        String(p.sport || "Cricket").toLowerCase() === wantSport &&
        p.assignment !== "team" &&
        p.assignment !== "retained"
    )
    .map((p) => p.id);
  return { categoryId, teamIds, playerIds };
}

function findAuction(store, auctionId) {
  if (!auctionId) return null;
  const key = String(auctionId);
  return store.auctions.find((a) => a.id === key || a.code === key.toUpperCase()) || null;
}

function ok(store, auctionId) {
  const auction = findAuction(store, auctionId);
  return { admin: adminState(store), public: auction ? publicState(store, auction.id) : null };
}

function lotPayload(store, auction) {
  const live = auction?.live;
  const player = live?.currentPlayerId ? store.players.find((p) => p.id === live.currentPlayerId) : null;
  return {
    auctionId: auction.id,
    code: auction.code,
    status: auction.status,
    rev: live?.rev || 0,
    phase: live?.phase || null,
    currentBid: lotCurrentBid(player, live?.currentBid),
    lastBidTeamId: live?.lastBidTeamId || null,
    timerEndsAt: live?.timerEndsAt || null,
    currentPlayer: player
      ? {
          id: player.id,
          name: player.name,
          role: player.role,
          photo: player.photo,
          basePrice: player.basePrice,
          categoryId: player.categoryId,
          categoryName: store.categories.find((c) => c.id === player.categoryId)?.name || "",
          acpl: player.acplPlayerId
            ? acplCareerSummary(store, player.acplPlayerId) || acplCareerSummary(store, player.name)
            : acplCareerSummary(store, player.name)
        }
      : null
  };
}

function requireRole(socket, roles) {
  if (!roles.includes(socket.data.role)) throw new Error("Not allowed");
}

function attachOwner(socket, store, auction, persist) {
  if (!auction) return null;
  socket.join("owners");
  socket.join("auction:" + auction.id);
  socket.data.auctionId = auction.id;
  if (socket.data.role === "owner" && socket.data.teamId) {
    const team = store.teams.find((t) => t.id === socket.data.teamId);
    if (auction.categoryId && team && team.categoryId !== auction.categoryId) {
      throw new Error("Your team is not in this tournament category");
    }
  }
  return auction;
}

const STAFF = ["super", "admin", "auctioneer"];

export function attachSockets(io, store, urls) {
  const persist = () => saveStore(store);
  const advertise = urls && urls.appUrl ? urls : { mode: "lan", appUrl: null, appUrls: [], spectatorUrls: [], lan: Array.isArray(urls) ? urls : [] };
  const lan = advertise.lan || [];

  const broadcast = (auctionId) => {
    const auction = findAuction(store, auctionId);
    if (!auction) return;
    const pub = publicState(store, auction.id);
    const lot = lotPayload(store, auction);
    io.emit("state", pub);
    io.emit("lot", lot);
    for (const sock of io.sockets.sockets.values()) {
      if (sock.data.role === "owner") {
        if (sock.data.auctionId !== auction.id) continue;
      } else if (sock.data.auctionId === auction.id || sock.data.role === "spectator") {
        sock.join("auction:" + auction.id);
      } else {
        continue;
      }
      sock.emit("state", pub);
      sock.emit("lot", lot);
    }
    io.to("admin").emit("admin-state", adminState(store));
  };

  setInterval(() => {
    const ids = applyAutoHammer(store);
    if (ids.length) {
      persist();
      for (const id of ids) broadcast(id);
    }
  }, 250);

  io.on("connection", (socket) => {
    socket.emit("hello", {
      mode: advertise.mode || "lan",
      appUrl: advertise.appUrl || null,
      appUrls: advertise.appUrls?.length ? advertise.appUrls : lan.map((ip) => `http://${ip}:3000`),
      lan,
      defaultAuction:
        store.auctions.find((a) => a.status === "live" || a.status === "paused")?.code || store.auctions[0]?.code || null,
      spectatorUrls: advertise.spectatorUrls?.length
        ? advertise.spectatorUrls
        : [`http://localhost:3000/live`, ...lan.map((ip) => `http://${ip}:3000/live`)]
    });

    socket.on("login", (payload, cb) => {
      try {
        if (payload?.role === "spectator" || payload?.spectator) {
          const auction =
            store.auctions.find((a) => a.code === String(payload.code || "").toUpperCase() || a.id === payload.code) ||
            store.auctions.find((a) => a.status === "live" || a.status === "paused") ||
            store.auctions[0];
          if (!auction) throw new Error("Auction not found");
          socket.data.role = "spectator";
          socket.data.auctionId = auction.id;
          socket.join("auction:" + auction.id);
          cb?.({ ok: true, role: "spectator", public: publicState(store, auction.id) });
          return;
        }

        const username = String(payload?.username || "").trim().toLowerCase();
        const password = String(payload?.password || "");
        if (!username || !password) throw new Error("Enter username and password");
        const user = (store.users || []).find((u) => u.username.toLowerCase() === username);
        if (!user || user.passwordHash !== hashPw(password)) throw new Error("Invalid username or password");

        socket.data.role = user.role;
        socket.data.userId = user.id;
        socket.data.teamId = user.teamId || null;

        if (STAFF.includes(user.role)) {
          socket.join("admin");
          const auction =
            store.auctions.find((a) => a.id === payload.auctionId || a.code === String(payload.auctionId || "").toUpperCase()) ||
            store.auctions.find((a) => a.status === "live" || a.status === "paused") ||
            store.auctions[0];
          if (auction) {
            socket.join("auction:" + auction.id);
            socket.data.auctionId = auction.id;
          }
          cb?.({
            ok: true,
            role: user.role,
            user: publicUser(user),
            auctionId: auction?.id || null,
            admin: adminState(store),
            public: auction ? publicState(store, auction.id) : null,
            redirect: user.role === "auctioneer" ? "/auctioneer" : "/admin"
          });
          return;
        }

        if (user.role === "owner") {
          if (!user.teamId) {
            const linked = store.owners.find((o) => o.username.toLowerCase() === username);
            if (linked) user.teamId = linked.teamId;
          }
          const team = store.teams.find((t) => t.id === user.teamId);
          if (!team) throw new Error("This owner is not linked to a team");
          socket.data.teamId = team.id;
          socket.join("owners");
          const code = String(payload?.code || "").trim().toUpperCase();
          const auctionKey = payload?.auctionId || code || "";
          let auction = null;
          if (auctionKey) {
            auction = findAuction(store, auctionKey) || store.auctions.find((a) => String(a.code).toUpperCase() === code);
            if (!auction) throw new Error("Auction code not found");
            if (auction.categoryId && team.categoryId !== auction.categoryId) {
              throw new Error("Your team is not in this auction's category");
            }
            if (!code && !auctionTeamIds(store, auction).includes(team.id)) {
              throw new Error("Your team is not added to this auction");
            }
            attachOwner(socket, store, auction, persist);
          } else {
            socket.data.auctionId = null;
          }
          cb?.({
            ok: true,
            role: "owner",
            user: publicUser(user),
            teamId: team.id,
            teamName: team.name,
            home: ownerHome(store, team.id),
            public: auction ? publicState(store, auction.id) : null,
            redirect: "/owner"
          });
          return;
        }

        throw new Error("Unknown role");
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on("sync-live", (payload, cb) => {
      try {
        const p = payload || {};
        const team = store.teams.find((t) => t.id === socket.data.teamId);
        let auction = null;
        if (p.code || p.auctionId) {
          auction = findAuction(store, p.code || p.auctionId);
        } else if (socket.data.auctionId) {
          auction = findAuction(store, socket.data.auctionId);
        }
        if (!auction) throw new Error("Auction not found");
        if (socket.data.role === "owner") {
          if (auction.categoryId && team && team.categoryId !== auction.categoryId) {
            throw new Error("Your team is not in this auction's category");
          }
          attachOwner(socket, store, auction, persist);
        } else {
          socket.join("auction:" + auction.id);
          socket.data.auctionId = auction.id;
        }
        cb?.({ ok: true, ...ok(store, auction.id) });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on("owner-home", (_payload, cb) => {
      try {
        requireRole(socket, ["owner"]);
        const teamId = socket.data.teamId;
        if (!teamId) throw new Error("No team linked");
        socket.data.auctionId = null;
        cb?.({ ok: true, home: ownerHome(store, teamId) });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    const wrap = (fn) => (payload, cb) => {
      try {
        const result = fn(payload || {});
        persist();
        cb?.({ ok: true, ...result });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    };

    const wrapAsync = (fn) => async (payload, cb) => {
      try {
        const result = await fn(payload || {});
        persist();
        cb?.({ ok: true, ...result });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    };

    socket.on(
      "upload",
      wrap((p) => {
        requireRole(socket, STAFF);
        const url = saveUpload(p.dataUrl, p.filename || "photo.png");
        return { url };
      })
    );

    socket.on(
      "upload-celebration",
      wrap((p) => {
        requireRole(socket, ["super", "admin"]);
        const saved = saveCelebrationGif(p.dataUrl, p.kind);
        store.meta = store.meta || {};
        store.meta.celebrations = {
          ...(store.meta.celebrations || {}),
          [saved.kind]: { url: saved.url, bytes: saved.bytes, ext: saved.ext, updatedAt: Date.now() }
        };
        persist();
        io.to("admin").emit("admin-state", adminState(store));
        // Refresh live boards so overlays pick up new asset URLs
        for (const a of store.auctions) {
          if (a.status === "live" || a.status === "paused") broadcast(a.id);
        }
        return { admin: adminState(store), celebration: saved };
      })
    );

    socket.on(
      "set-live-bidding",
      wrap((p) => {
        requireRole(socket, ["super", "admin"]);
        store.meta.liveBidding = Boolean(p.enabled);
        persist();
        const targets = store.auctions.filter((a) => a.status === "live" || a.status === "paused");
        for (const a of targets.length ? targets : store.auctions.slice(0, 1)) {
          broadcast(a.id);
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-user",
      wrap((p) => {
        requireRole(socket, ["super"]);
        const username = String(p.username || "").trim().toLowerCase();
        const role = p.role;
        if (!username) throw new Error("Username required");
        if (!["admin", "auctioneer", "owner"].includes(role)) throw new Error("Role must be Admin, Auctioneer, or Team owner");
        if (role === "owner" && !p.teamId) throw new Error("Pick a team for this owner");
        const taken = (store.users || []).find((u) => u.username.toLowerCase() === username && u.id !== p.id);
        if (taken) throw new Error("Username already exists");
        let user;
        if (p.id) {
          const i = store.users.findIndex((u) => u.id === p.id);
          if (i < 0) throw new Error("User not found");
          if (store.users[i].role === "super") throw new Error("Cannot edit Super Admin this way");
          user = {
            ...store.users[i],
            name: p.name || username,
            username,
            role,
            teamId: role === "owner" ? p.teamId : null,
            passwordHash: p.password ? hashPw(p.password) : store.users[i].passwordHash
          };
          store.users[i] = user;
        } else {
          if (!p.password) throw new Error("Password required");
          user = {
            id: uid(),
            name: p.name || username,
            username,
            passwordHash: hashPw(p.password),
            role,
            teamId: role === "owner" ? p.teamId : null
          };
          store.users.push(user);
        }
        if (role === "owner") {
          let owner = store.owners.find((o) => o.username === username);
          if (owner) {
            owner.name = user.name;
            owner.teamId = user.teamId;
            owner.passwordHash = user.passwordHash;
          } else {
            owner = {
              id: uid(),
              name: user.name,
              username,
              passwordHash: user.passwordHash,
              teamId: user.teamId,
              categoryId: store.teams.find((t) => t.id === user.teamId)?.categoryId
            };
            store.owners.push(owner);
          }
          const team = store.teams.find((t) => t.id === user.teamId);
          if (team) team.ownerId = owner.id;
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "delete-user",
      wrap((p) => {
        requireRole(socket, ["super"]);
        const user = (store.users || []).find((u) => u.id === p.id);
        if (!user) throw new Error("User not found");
        if (user.role === "super" || user.username === "osinha") throw new Error("Cannot delete Super Admin");
        store.users = store.users.filter((u) => u.id !== p.id);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-tournament",
      wrap((p) => {
        requireRole(socket, STAFF);
        const body = {
          name: p.name || "New tournament",
          sport: p.sport || "Cricket",
          logo: p.logo || "",
          startDate: p.startDate || "",
          endDate: p.endDate || "",
          venue: p.venue || "",
          hasAuction: p.hasAuction === true || p.hasAuction === "yes" || p.hasAuction === "true",
          categoryId: p.categoryId || store.categories[0]?.id,
          teamIds: []
        };
        const categoryId = body.categoryId;
        const sportOf = (t) => String(t?.sport || "Cricket").toLowerCase();
        const wantSport = sportOf({ sport: body.sport });
        body.teamIds = (p.teamIds || []).filter((id) => {
          const t = store.teams.find((x) => x.id === id);
          return t && t.categoryId === categoryId && sportOf(t) === wantSport;
        });
        let tournament;
        if (p.id) {
          const i = store.tournaments.findIndex((t) => t.id === p.id);
          if (i < 0) throw new Error("Not found");
          tournament = { ...store.tournaments[i], ...body, id: p.id };
          store.tournaments[i] = tournament;
        } else {
          tournament = { id: uid(), ...body, playerIds: [] };
          store.tournaments.push(tournament);
        }

        // playerIds on the tournament is authoritative (same pattern as teamIds)
        const playerIds = Array.isArray(p.playerIds)
          ? p.playerIds.filter((id) => {
              const pl = store.players.find((x) => x.id === id);
              return (
                pl &&
                pl.categoryId === categoryId &&
                String(pl.sport || "Cricket").toLowerCase() === wantSport
              );
            })
          : Array.isArray(tournament.playerIds)
            ? tournament.playerIds
            : [];
        tournament.playerIds = playerIds;
        tournament.updatedAt = Date.now();
        const tIndex = store.tournaments.findIndex((t) => t.id === tournament.id);
        if (tIndex >= 0) store.tournaments[tIndex] = tournament;

        for (const pl of store.players) {
          const ids = new Set(pl.tournamentIds || []);
          if (playerIds.includes(pl.id)) ids.add(tournament.id);
          else ids.delete(tournament.id);
          pl.tournamentIds = Array.from(ids);
        }

        // Registration form inherits tournament logo + auction team list from tournament
        const regForm = getFormByTournament(store, tournament.id);
        if (regForm) {
          if (body.logo) regForm.logo = body.logo;
          else if (tournament.logo) regForm.logo = tournament.logo;
          const auctionTeam = (regForm.fields || []).find((f) => f.key === "auctionTeam");
          if (auctionTeam) {
            const names = body.teamIds
              .map((id) => store.teams.find((x) => x.id === id)?.name)
              .filter(Boolean);
            auctionTeam.config = { ...(auctionTeam.config || {}), source: "tournamentTeams" };
            auctionTeam.options = names;
          }
          regForm.updatedAt = Date.now();
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), tournament };
      })
    );

    socket.on(
      "delete-tournament",
      wrap((p) => {
        requireRole(socket, STAFF);
        store.tournaments = store.tournaments.filter((t) => t.id !== p.id);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-category",
      wrap((p) => {
        requireRole(socket, STAFF);
        if (p.id) {
          const i = store.categories.findIndex((c) => c.id === p.id);
          store.categories[i] = { ...store.categories[i], ...p, basePrice: Number(p.basePrice) };
        } else {
          store.categories.push({ id: uid(), name: p.name, basePrice: Number(p.basePrice) || 10 });
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-team",
      wrap((p) => {
        requireRole(socket, STAFF);
        const body = {
          name: p.name,
          logo: p.logo || "",
          color: p.color || "#2563EB",
          pin: p.pin || pin4(),
          phone: p.phone || "",
          categoryId: p.categoryId || store.categories[0]?.id,
          sport: p.sport || "Cricket",
          ownerId: p.ownerId || null,
          playerIds: p.playerIds || [],
          cricheroesShareUrl: p.cricheroesShareUrl != null ? String(p.cricheroesShareUrl).trim() : undefined
        };
        for (const id of body.playerIds) {
          const pl = store.players.find((x) => x.id === id);
          if (pl && pl.categoryId !== body.categoryId) {
            throw new Error("Cannot add a player from another category to this team");
          }
          if (pl && String(pl.sport || "Cricket").toLowerCase() !== String(body.sport || "Cricket").toLowerCase()) {
            throw new Error("Cannot add a player from another sport to this team");
          }
        }
        let team;
        if (p.id) {
          const i = store.teams.findIndex((t) => t.id === p.id);
          const prev = store.teams[i] || {};
          const nextBody = { ...body };
          if (nextBody.cricheroesShareUrl === undefined) delete nextBody.cricheroesShareUrl;
          team = {
            ...prev,
            ...nextBody,
            id: p.id,
            retentions: prev.retentions || [],
            cricheroes: prev.cricheroes || null
          };
          store.teams[i] = team;
        } else {
          team = {
            id: uid(),
            retentions: [],
            ...body,
            cricheroesShareUrl: body.cricheroesShareUrl || "",
            cricheroes: null
          };
          store.teams.push(team);
        }
        for (const pl of store.players) {
          if (pl.teamId === team.id && pl.assignment === "team" && !(team.playerIds || []).includes(pl.id)) {
            pl.teamId = null;
            pl.assignment = "auction";
          }
        }
        for (const id of team.playerIds || []) {
          const pl = store.players.find((x) => x.id === id);
          if (pl && pl.assignment !== "retained") {
            pl.teamId = team.id;
            pl.assignment = "team";
          }
        }
        if (team.ownerId) {
          const owner = store.owners.find((o) => o.id === team.ownerId);
          if (owner) {
            owner.teamId = team.id;
            owner.categoryId = team.categoryId;
          }
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "delete-team",
      wrap((p) => {
        requireRole(socket, STAFF);
        store.teams = store.teams.filter((t) => t.id !== p.id);
        store.tournaments.forEach((t) => {
          t.teamIds = (t.teamIds || []).filter((id) => id !== p.id);
        });
        store.auctions.forEach((a) => {
          a.teamIds = (a.teamIds || []).filter((id) => id !== p.id);
        });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "sync-cricheroes-team",
      wrapAsync(async (p) => {
        requireRole(socket, STAFF);
        const team = store.teams.find((t) => t.id === p.teamId);
        if (!team) throw new Error("Team not found");
        const result = await syncTeamCricheroes(store, team, { shareUrl: p.shareUrl });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "sync-all-cricheroes",
      wrapAsync(async () => {
        requireRole(socket, STAFF);
        applyAcpl6CricheroesLinks(store);
        const result = await syncAllLinkedCricheroes(store);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "save-cricheroes-upcoming",
      wrap((p) => {
        requireRole(socket, STAFF);
        const team = store.teams.find((t) => t.id === p.teamId);
        if (!team) throw new Error("Team not found");
        team.cricheroes = team.cricheroes || {};
        team.cricheroes.matches = team.cricheroes.matches || { past: [], upcoming: [] };
        team.cricheroes.matches.upcoming = Array.isArray(p.upcoming) ? p.upcoming : [];
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), team };
      })
    );

    socket.on(
      "upsert-player",
      wrap((p) => {
        requireRole(socket, STAFF);
        const clearBase = p.clearBasePrice === true || p.basePrice === null;
        const hasBase =
          !clearBase &&
          p.basePrice !== undefined &&
          p.basePrice !== null &&
          p.basePrice !== "" &&
          !Number.isNaN(Number(p.basePrice));
        // null = clear; number = set; undefined = leave unchanged on edit / null on create
        const basePrice = clearBase ? null : hasBase ? Number(p.basePrice) : p.id ? undefined : null;
        const assignment = p.assignment || (p.teamId ? "team" : "auction");
        const teamId = assignment === "auction" ? null : p.teamId || null;
        if (teamId) {
          const team = store.teams.find((t) => t.id === teamId);
          if (!team) throw new Error("Team not found");
          if (team.categoryId !== p.categoryId) throw new Error("Player category must match the team category");
          const playerSport = p.sport || "Cricket";
          if (String(team.sport || "Cricket").toLowerCase() !== String(playerSport).toLowerCase()) {
            throw new Error("Player sport must match the team sport");
          }
        }
        const body = {
          name: p.name,
          photo: p.photo || "",
          role: p.role || "Batsman",
          categoryId: p.categoryId,
          sport: p.sport || "Cricket",
          phone: p.phone || "",
          teamId,
          assignment,
          tournamentIds: Array.isArray(p.tournamentIds) ? p.tournamentIds : []
        };
        if (basePrice !== undefined) body.basePrice = basePrice;
        if (p.id) {
          const i = store.players.findIndex((x) => x.id === p.id);
          const prev = store.players[i] || {};
          store.players[i] = {
            ...prev,
            ...body,
            id: p.id,
            basePrice: basePrice !== undefined ? basePrice : prev.basePrice ?? null
          };
        } else {
          store.players.push({ id: uid(), basePrice: basePrice ?? null, ...body });
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "bulk-update-players",
      wrap((p) => {
        requireRole(socket, STAFF);
        const ids = Array.isArray(p.playerIds) ? p.playerIds : [];
        if (!ids.length) throw new Error("Select at least one player");
        const hasRole = p.role != null && String(p.role).trim() !== "";
        const clearBase = p.clearBasePrice === true || p.basePrice === null;
        const hasBase =
          !clearBase &&
          p.basePrice !== undefined &&
          p.basePrice !== null &&
          p.basePrice !== "" &&
          !Number.isNaN(Number(p.basePrice));
        if (!hasRole && !hasBase && !clearBase) {
          throw new Error("Choose a playing type and/or base price to apply");
        }
        let updated = 0;
        for (const id of ids) {
          const i = store.players.findIndex((x) => x.id === id);
          if (i < 0) continue;
          const next = { ...store.players[i] };
          if (hasRole) next.role = String(p.role).trim();
          if (clearBase) next.basePrice = null;
          else if (hasBase) next.basePrice = Number(p.basePrice);
          store.players[i] = next;
          updated += 1;
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), updated };
      })
    );

    socket.on(
      "merge-players",
      wrap((p) => {
        requireRole(socket, STAFF);
        const player = mergeAuctionPlayers(store, p.keepPlayerId, p.absorbPlayerId);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), player };
      })
    );

    socket.on(
      "link-player-acpl",
      wrap((p) => {
        requireRole(socket, STAFF);
        const result = linkPlayerToAcpl(store, p.playerId, p.acplPlayerId || p.acplName || p.name);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result, summary: acplCareerSummary(store, result.acpl.id) };
      })
    );

    socket.on(
      "unlink-player-acpl",
      wrap((p) => {
        requireRole(socket, STAFF);
        const result = unlinkPlayerFromAcpl(store, p.playerId);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "clear-registration-base-prices",
      wrap((p) => {
        requireRole(socket, STAFF);
        const result = clearRegistrationBasePrices(store, { formId: p.formId || null });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "sync-registration-photos",
      wrap((p) => {
        requireRole(socket, STAFF);
        const result = syncRegistrationPhotos(store, {
          saveUploadFn: saveUpload,
          formId: p.formId || null,
          force: p.force === true
        });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on("search-acpl", (payload, cb) => {
      try {
        const players = searchAcplPlayers(store, payload?.q || payload?.query || "", {
          limit: Number(payload?.limit) || 20
        });
        cb?.({ ok: true, players });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on(
      "dedupe-players",
      wrap(() => {
        requireRole(socket, STAFF);
        const removed = dedupePlayersByName(store);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), removed };
      })
    );

    socket.on(
      "delete-player",
      wrap((p) => {
        requireRole(socket, STAFF);
        store.players = store.players.filter((x) => x.id !== p.id);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "import-acpl",
      wrap((p) => {
        requireRole(socket, STAFF);
        const root = p.root || defaultAcplDataRoot();
        const result = importAcplHistory(root);
        store.acplHistory = {
          meta: result.meta,
          players: result.players,
          log: result.log
        };
        io.to("admin").emit("admin-state", adminState(store));
        return {
          admin: adminState(store),
          summary: {
            sourceRoot: result.meta.sourceRoot,
            totalSeasonsProcessed: result.log.totalSeasonsProcessed,
            totalFilesProcessed: result.log.totalFilesProcessed,
            uniquePlayers: result.log.uniquePlayers,
            playersBySeasonCount: result.log.playersBySeasonCount,
            duplicateAmbiguousNames: result.log.duplicateAmbiguousNames.length,
            importErrors: result.log.importErrors
          }
        };
      })
    );

    socket.on("get-acpl-player", (payload, cb) => {
      try {
        const idOrName = payload?.id || payload?.name || "";
        const full = findAcplPlayer(store, idOrName);
        if (!full) {
          cb?.({ ok: true, found: false, summary: acplCareerSummary(store, idOrName) });
          return;
        }
        cb?.({ ok: true, found: true, player: full, summary: acplCareerSummary(store, full.name) });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on("lookup-acpl", (payload, cb) => {
      try {
        cb?.({ ok: true, summary: acplCareerSummary(store, payload?.name || "") });
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on(
      "bulk-players",
      wrap((p) => {
        requireRole(socket, STAFF);
        for (const r of p.rows || []) {
          const catName = (r.category || r.Category || "Men").toString();
          const cat =
            store.categories.find((c) => c.name.toLowerCase() === catName.toLowerCase()) || store.categories[0];
          const teamName = (r.team || r.Team || "Through Auction").toString();
          const through = /auction/i.test(teamName) || !teamName;
          const sportRaw = (r.sport || r.Sport || "Cricket").toString();
          const sport =
            ["Cricket", "Badminton", "Table-tennis"].find((s) => s.toLowerCase() === sportRaw.toLowerCase()) || "Cricket";
          const team = through
            ? null
            : store.teams.find(
                (t) =>
                  t.name.toLowerCase() === teamName.toLowerCase() &&
                  t.categoryId === cat.id &&
                  String(t.sport || "Cricket").toLowerCase() === sport.toLowerCase()
              );
          if (teamName && !through && team && team.categoryId !== cat.id) continue;
          const crRaw = r["base price (cr)"] || r["Base Price (Cr)"] || r.basePrice || r["Base Price"] || 2;
          const tourName = (r.tournament || r.Tournament || "").toString();
          const tour = store.tournaments.find(
            (t) =>
              t.name.toLowerCase() === tourName.toLowerCase() &&
              String(t.sport || "Cricket").toLowerCase() === sport.toLowerCase()
          );
          store.players.push({
            id: uid(),
            name: r.name || r.Name,
            photo: r.photo || r.photoUrl || r["Photo URL"] || "",
            role: r.role || r.Role || "Batsman",
            categoryId: cat.id,
            sport,
            basePrice: Math.round(Number(crRaw) * 100),
            phone: r.phone || r["Phone No"] || "",
            teamId: team?.id || null,
            assignment: team ? "team" : "auction",
            tournamentIds: tour ? [tour.id] : []
          });
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-owner",
      wrap((p) => {
        requireRole(socket, STAFF);
        const team = store.teams.find((t) => t.id === p.teamId);
        const body = {
          name: p.name,
          username: String(p.username || "").trim().toLowerCase(),
          teamId: p.teamId || null,
          categoryId: p.categoryId || team?.categoryId || store.categories[0]?.id
        };
        if (!body.username) throw new Error("Username required");
        const taken = store.owners.find((o) => o.username === body.username && o.id !== p.id);
        if (taken) throw new Error("Username already exists");
        let owner;
        if (p.id) {
          const i = store.owners.findIndex((o) => o.id === p.id);
          owner = {
            ...store.owners[i],
            ...body,
            id: p.id,
            passwordHash: p.password ? hashPw(p.password) : store.owners[i].passwordHash
          };
          store.owners[i] = owner;
        } else {
          if (!p.password) throw new Error("Password required");
          owner = { id: uid(), ...body, passwordHash: hashPw(p.password) };
          store.owners.push(owner);
        }
        if (team) {
          team.ownerId = owner.id;
          if (body.categoryId) team.categoryId = body.categoryId;
        }
        if (Array.isArray(p.retainedPlayerIds) && team) {
          applyRetentions(store, team.id, p.retainedPlayerIds);
        }
        const existingUser = (store.users || []).find((u) => u.username === body.username);
        if (existingUser) {
          existingUser.role = "owner";
          existingUser.teamId = owner.teamId;
          existingUser.name = owner.name;
          if (p.password) existingUser.passwordHash = owner.passwordHash;
        } else {
          store.users.push({
            id: uid(),
            name: owner.name,
            username: body.username,
            passwordHash: owner.passwordHash,
            role: "owner",
            teamId: owner.teamId
          });
        }
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "delete-owner",
      wrap((p) => {
        requireRole(socket, STAFF);
        const owner = store.owners.find((o) => o.id === p.id);
        if (owner) {
          const team = store.teams.find((t) => t.id === owner.teamId);
          if (team && team.ownerId === owner.id) team.ownerId = null;
        }
        store.owners = store.owners.filter((o) => o.id !== p.id);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "upsert-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        const tournament = store.tournaments.find((t) => t.id === p.tournamentId);
        if (p.tournamentId && tournament && !tournament.hasAuction) {
          throw new Error("That tournament is not flagged for auction");
        }
        const roster = rosterFromTournament(store, tournament);
        const categoryId = roster.categoryId || p.categoryId || store.categories[0]?.id;
        const teamIds = (p.teamIds?.length ? p.teamIds : roster.teamIds).filter((id) => {
          const tm = store.teams.find((t) => t.id === id);
          if (!tm || tm.categoryId !== categoryId) return false;
          if (tournament) {
            return String(tm.sport || "Cricket").toLowerCase() === String(tournament.sport || "Cricket").toLowerCase();
          }
          return true;
        });
        for (const tid of teamIds) {
          const tm = store.teams.find((t) => t.id === tid);
          if (tm && tm.categoryId !== categoryId) throw new Error("Every team in an auction must share the same category");
        }
        const wantSport = String(tournament?.sport || "Cricket").toLowerCase();
        const playerIds = (p.playerIds?.length ? p.playerIds : roster.playerIds).filter((id) => {
          const pl = store.players.find((x) => x.id === id);
          return (
            pl &&
            pl.categoryId === categoryId &&
            pl.assignment !== "team" &&
            String(pl.sport || "Cricket").toLowerCase() === wantSport
          );
        });
        const increments = Array.isArray(p.increments) ? p.increments : DEFAULT_INCREMENTS;
        // Only replace maxByBasePrice when the client explicitly sends the field.
        // Omitting it must never wipe existing caps.
        let maxByBasePrice;
        if (p.maxByBasePrice != null && typeof p.maxByBasePrice === "object") {
          maxByBasePrice = {};
          for (const [k, v] of Object.entries(p.maxByBasePrice)) {
            const key = String(Number(k));
            if (!Number.isFinite(Number(k))) continue;
            // Blank = no cap for that base price
            if (v == null || v === "") continue;
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) continue;
            maxByBasePrice[key] = n;
          }
        }
        const body = {
          name: p.name || "Auction",
          tournamentId: p.tournamentId || store.tournaments.find((t) => t.hasAuction)?.id,
          categoryId,
          purse: Number(p.purse) || 12000,
          denominators: Array.isArray(p.denominators)
            ? p.denominators.map(Number)
            : String(p.denominators || "600,800,1000")
                .split(/[,\s]+/)
                .map(Number)
                .filter(Boolean),
          minSquad: Number(p.minSquad) || 5,
          maxSquad: Number(p.maxSquad) || 8,
          increments,
          sequence: p.sequence || "random",
          teamIds,
          playerIds
        };
        if (maxByBasePrice !== undefined) body.maxByBasePrice = maxByBasePrice;
        if (p.minByCategory && typeof p.minByCategory === "object" && Object.keys(p.minByCategory).length) {
          body.minByCategory = p.minByCategory;
        }
        if (p.timerSeconds != null && p.timerSeconds !== "") {
          body.timerSeconds = Number(p.timerSeconds) || 20;
        }
        // Additive: only touch youtubeLiveUrl when the client explicitly sends it
        if (Object.prototype.hasOwnProperty.call(p, "youtubeLiveUrl")) {
          body.youtubeLiveUrl = normalizeYoutubeLiveUrl(p.youtubeLiveUrl);
        }
        const code = p.code ? String(p.code).slice(0, 8).toUpperCase() : "";
        let i = p.id ? store.auctions.findIndex((a) => a.id === p.id) : -1;
        if (i < 0 && code) i = store.auctions.findIndex((a) => String(a.code).toUpperCase() === code);
        if (i >= 0) {
          const prev = store.auctions[i];
          store.auctions[i] = {
            ...prev,
            ...body,
            id: prev.id,
            code: code || prev.code,
            status: prev.status,
            live: prev.live,
            // Never drop existing config when the client omits these fields
            minByCategory: body.minByCategory ?? prev.minByCategory ?? {},
            timerSeconds: body.timerSeconds ?? prev.timerSeconds ?? 20,
            maxByBasePrice: body.maxByBasePrice ?? prev.maxByBasePrice ?? {},
            youtubeLiveUrl:
              body.youtubeLiveUrl !== undefined ? body.youtubeLiveUrl : prev.youtubeLiveUrl || ""
          };
        } else {
          store.auctions.push({
            id: uid(),
            code: code || uid().toString().slice(0, 6).toUpperCase(),
            status: "draft",
            live: null,
            minByCategory: body.minByCategory || {},
            timerSeconds: body.timerSeconds ?? 20,
            maxByBasePrice: body.maxByBasePrice || {},
            youtubeLiveUrl: body.youtubeLiveUrl || "",
            ...body
          });
        }
        const auction =
          (p.id && store.auctions.find((a) => a.id === p.id)) ||
          (code && store.auctions.find((a) => String(a.code).toUpperCase() === code)) ||
          store.auctions[store.auctions.length - 1];
        io.to("admin").emit("admin-state", adminState(store));
        if (auction) broadcast(auction.id);
        return { admin: adminState(store), public: auction ? publicState(store, auction.id) : null };
      })
    );

    socket.on(
      "delete-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        store.auctions = store.auctions.filter((a) => a.id !== p.id);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "save-auction-groups",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = findAuction(store, p.auctionId);
        if (!auction) throw new Error("Auction not found");
        const groups = (p.groups || []).map((g) => ({
          id: g.id || uid(),
          name: g.name || "Group",
          teamIds: (g.teamIds || []).filter((id) => (auction.teamIds || []).includes(id))
        }));
        auction.groups = groups;
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store) };
      })
    );

    socket.on(
      "generate-schedule",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = findAuction(store, p.auctionId);
        if (!auction) throw new Error("Auction not found");
        if (auction.status !== "completed" && !p.force) {
          throw new Error("Finish the auction before building a match schedule");
        }
        const groups = auction.groups?.length
          ? auction.groups
          : [{ id: uid(), name: "League", teamIds: [...(auction.teamIds || [])] }];
        if (!groups.some((g) => (g.teamIds || []).length >= 2)) {
          throw new Error("Add at least one group with 2+ teams");
        }
        const matchMinutes = Number(p.matchMinutes) || 40;
        const matches = buildAuctionFixture(groups, {
          matchMinutes,
          noBackToBack: p.noBackToBack !== false,
          equalRest: p.equalRest !== false,
          startAt: p.startAt || new Date().toISOString()
        });
        auction.fixture = {
          matchMinutes,
          noBackToBack: p.noBackToBack !== false,
          equalRest: p.equalRest !== false,
          startAt: p.startAt || matches[0]?.startAt || new Date().toISOString(),
          matches
        };
        if (!auction.groups?.length) auction.groups = groups;
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), fixture: auction.fixture };
      })
    );

    socket.on(
      "start-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = startAuction(store, p.auctionId || socket.data.auctionId);
        socket.join("auction:" + auction.id);
        socket.data.auctionId = auction.id;
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "end-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = endAuction(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "pause-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = pauseAuction(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "next-player",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = pickNext(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "sold",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = markSold(store, p.auctionId || socket.data.auctionId, { teamId: p.teamId, price: p.price });
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "unsold",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = markUnsold(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "undo",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = undoLast(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "extend-timer",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = resetTimer(store, p.auctionId || socket.data.auctionId);
        broadcast(auction.id);
        return ok(store, p.auctionId);
      })
    );

    socket.on(
      "select-auction",
      wrap((p) => {
        requireRole(socket, STAFF);
        const auction = store.auctions.find((a) => a.id === p.auctionId || a.code === p.auctionId);
        if (!auction) throw new Error("Auction not found");
        socket.data.auctionId = auction.id;
        socket.join("auction:" + auction.id);
        return ok(store, auction.id);
      })
    );

    socket.on(
      "bid",
      wrap((p) => {
        requireRole(socket, ["owner", ...STAFF]);
        const auctionId = p.auctionId || socket.data.auctionId;
        const teamId = p.teamId || socket.data.teamId;
        if (!teamId) throw new Error("Pick a team");
        const staff = STAFF.includes(socket.data.role);
        const raw = p.amount;
        const amount = raw === undefined || raw === null || raw === "" ? null : Number(raw);
        const auction = placeBid(store, auctionId, teamId, amount, {
          staff,
          denom: p.denom != null && p.denom !== "" ? Number(p.denom) : undefined
        });
        broadcast(auction.id);
        return ok(store, auction.id);
      })
    );

    const REG_ADMIN = ["super", "admin"];

    socket.on(
      "reg-create-form",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const form = createForm(store, { tournamentId: p.tournamentId, template: p.template || "acpl6" });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), form };
      })
    );

    socket.on(
      "reg-upsert-form",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const who = socket.data.userId || socket.data.role || "admin";
        const form = upsertForm(store, p, { saveUploadFn: saveUpload, performedBy: who });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), form };
      })
    );

    socket.on(
      "reg-set-status",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const form = setFormStatus(store, p.formId, p.status);
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), form };
      })
    );

    socket.on(
      "reg-delete-form",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const result = deleteForm(store, p.formId, { force: p.force === true });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "reg-recreate-form",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const form = recreateForm(store, {
          tournamentId: p.tournamentId,
          template: p.template || "acpl6",
          force: p.force === true
        });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), form };
      })
    );

    socket.on(
      "reg-dashboard",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        return { dashboard: dashboardForForm(store, p.formId) };
      })
    );

    socket.on(
      "reg-list",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        return { registrations: listRegistrations(store, p.formId, { status: p.status }) };
      })
    );

    socket.on(
      "reg-update-status",
      wrapAsync(async (p) => {
        requireRole(socket, REG_ADMIN);
        const who = socket.data.userId || socket.data.role || "admin";
        const registration = await updateRegistrationStatus(store, p.registrationId, p.status, who, {
          confirmPromote: p.confirmPromote === true,
          saveUploadFn: saveUpload
        });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), registration };
      })
    );

    socket.on(
      "reg-set-payment",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const who = socket.data.userId || socket.data.role || "admin";
        const registration = setPaymentStatus(store, p.registrationId, p.paymentStatus, who, {
          saveUploadFn: saveUpload
        });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), registration };
      })
    );

    socket.on(
      "reg-delete",
      wrapAsync(async (p) => {
        requireRole(socket, REG_ADMIN);
        const who = socket.data.userId || socket.data.role || "admin";
        const result = await deleteRegistration(store, p.registrationId, who, { saveUploadFn: saveUpload });
        io.to("admin").emit("admin-state", adminState(store));
        return { admin: adminState(store), ...result };
      })
    );

    socket.on(
      "reg-export",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        return { csv: exportCsv(store, p.formId, { category: p.category, status: p.status }) };
      })
    );

    socket.on(
      "reg-file-url",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const { exp, sig } = signFileAccess(store, p.fileId);
        return { url: `/api/registration/files/${p.fileId}?exp=${exp}&sig=${sig}` };
      })
    );

    socket.on(
      "reg-validate-form",
      wrap((p) => {
        requireRole(socket, REG_ADMIN);
        const form = store.registrationForms.find((f) => f.id === p.formId) || getFormByTournament(store, p.tournamentId);
        if (!form) throw new Error("Form not found");
        return { errors: validateFormForOpen(form) };
      })
    );
  });
}
