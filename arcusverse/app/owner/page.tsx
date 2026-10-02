"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Card, Button, Field } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { LiveBoard } from "@/components/LiveBoard";
import { beep, inr } from "@/lib/format";

function readAuth() {
  try {
    return JSON.parse(sessionStorage.getItem("arcus-auth") || "null");
  } catch {
    return null;
  }
}

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "paused") return "Paused";
  if (status === "completed") return "Completed";
  return "Not started";
}

export default function OwnerPage() {
  const { emit, socket } = useApp();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [home, setHome] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewingRef = useRef<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const setViewing = useCallback((id: string | null) => {
    viewingRef.current = id;
    setViewingId(id);
  }, []);

  const applyPublic = useCallback((s: any) => {
    if (!s?.auction) return;
    setState((prev: any) => {
      const incoming = s.live?.rev || s.meta?.updatedAt || 0;
      const have = prev?.live?.rev || prev?.meta?.updatedAt || 0;
      if (prev && incoming && have && incoming < have) {
        if ((prev.teams || []).length || !(s.teams || []).length) return prev;
        return { ...prev, teams: s.teams, players: s.players || prev.players };
      }
      return s;
    });
  }, []);

  const goHome = useCallback(async () => {
    setState(null);
    setViewing(null);
    setErr("");
    const saved = readAuth();
    if (saved) {
      sessionStorage.setItem("arcus-auth", JSON.stringify({ ...saved, code: "" }));
    }
    try {
      const res: any = await emit("owner-home", {});
      if (res?.home) setHome(res.home);
    } catch {
      /* keep existing home */
    }
  }, [emit, setViewing]);

  useEffect(() => {
    if (!socket) return;
    const saved = readAuth();
    if (!saved?.username) {
      router.replace("/");
      return;
    }

    const onLot = (lot: any) => {
      if (!lot) return;
      const vid = viewingRef.current;
      if (!vid || (lot.auctionId && lot.auctionId !== vid)) return;
      setState((prev: any) => {
        if (!prev) return prev;
        if (lot.rev && prev?.live?.rev && lot.rev < prev.live.rev) return prev;
        const live = {
          ...(prev?.live || {}),
          rev: lot.rev,
          phase: lot.phase,
          currentBid: lot.currentBid,
          lastBidTeamId: lot.lastBidTeamId,
          timerEndsAt: lot.timerEndsAt,
          currentPlayer: lot.currentPlayer,
          currentPlayerId: lot.currentPlayer?.id || null
        };
        return {
          ...prev,
          auction: {
            ...prev.auction,
            id: lot.auctionId || prev.auction.id,
            code: lot.code || prev.auction.code,
            status: lot.status || prev.auction.status
          },
          live
        };
      });
    };

    const onState = (s: any) => {
      if (!s?.auction) return;
      const vid = viewingRef.current;
      if (!vid || s.auction.id !== vid) return;
      if (s.live?.currentBid) beep("bid");
      applyPublic(s);
    };

    const boot = () => {
      const auth = readAuth();
      if (!auth?.username) return;
      emit("login", { username: auth.username, password: auth.password })
        .then((res: any) => {
          if (res.role !== "owner") {
            router.replace(res.redirect || "/");
            return;
          }
          setTeamId(res.teamId);
          setTeamName(res.teamName);
          setHome(res.home || null);
          setState(null);
          setViewing(null);
          if (auth.code) {
            sessionStorage.setItem("arcus-auth", JSON.stringify({ ...auth, code: "" }));
          }
        })
        .catch(() => router.replace("/"));
    };

    socket.on("state", onState);
    socket.on("lot", onLot);
    socket.on("connect", boot);
    if (socket.connected) boot();

    return () => {
      socket.off("state", onState);
      socket.off("lot", onLot);
      socket.off("connect", boot);
    };
  }, [socket, emit, router, applyPublic, setViewing]);

  const enterAuction = async (opts: { code?: string; auctionId?: string }) => {
    const saved = readAuth();
    if (!saved?.username) {
      setErr("Session expired. Log in again from the home page.");
      return;
    }
    const joinCode = (opts.code || "").trim().toUpperCase();
    if (!joinCode && !opts.auctionId) {
      setErr("Enter the auction code");
      return;
    }
    try {
      setBusy(true);
      setErr("");
      const res: any = await emit("login", {
        username: saved.username,
        password: saved.password,
        code: joinCode || undefined,
        auctionId: opts.auctionId
      });
      if (res.role !== "owner") {
        setErr("This login is not a team owner account");
        return;
      }
      if (res.home) setHome(res.home);
      const storeCode = joinCode || res.public?.auction?.code || "";
      sessionStorage.setItem("arcus-auth", JSON.stringify({ ...saved, code: storeCode }));
      const synced: any = await emit("sync-live", {
        code: storeCode,
        auctionId: opts.auctionId || res.public?.auction?.id
      });
      setTeamId(res.teamId);
      setTeamName(res.teamName);
      const next = synced.public || res.public;
      if (!next?.auction) {
        setErr("Could not open that auction. Check the code.");
        return;
      }
      setViewing(next.auction.id);
      applyPublic(next);
    } catch (e: any) {
      setErr(e.message || "Could not join auction");
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await enterAuction({ code });
  };

  if (state && viewingId) {
    const liveBidding = state.auction?.liveBidding === true;
    return (
      <Shell
        title={`${teamName || home?.team?.name || "Team"} owner`}
        subtitle={liveBidding ? "Live bidding on" : "Watching"}
        showLogout
        homeHref="/owner"
        onHome={goHome}
      >
        <LiveBoard
          mode="owner"
          liveBidding={liveBidding}
          state={state}
          emit={emit}
          auctionId={state.auction.id}
          teamId={teamId}
          onPublic={applyPublic}
        />
      </Shell>
    );
  }

  const team = home?.team;
  const roster = home?.roster || [];
  const tournaments = home?.tournaments || [];
  const auctions = home?.auctions || [];

  return (
    <Shell title="Owner home" showLogout homeHref="/owner" onHome={goHome}>
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-5xl" style={{ color: team?.color || "var(--accent)" }}>
                {team?.name || teamName || "Your team"}
              </h1>
              {team ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {team.sport} · {team.categoryName || "—"} · {team.rosterCount} players
                  {team.purseSpent ? ` · Spent ${inr(team.purseSpent)}` : ""}
                </p>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Loading team…
                </p>
              )}
            </div>
            {team?.logo ? (
              <img src={team.logo} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : null}
          </div>
        </Card>

        <Card className="overflow-auto p-0">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h2 className="font-display text-3xl">Squad</h2>
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {roster.length} players
            </p>
          </div>
          <table className="mt-2 w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr
                className="border-b border-[color-mix(in_srgb,var(--ink)_12%,transparent)] text-[11px] uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Sold / fee</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Phone</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p: any) => (
                <tr key={p.id} className="border-b border-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.photo ? (
                        <img src={p.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold"
                          style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}
                        >
                          {(p.name || "?").slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          {p.categoryName || team?.categoryName || ""}
                          {p.auctionName ? ` · ${p.auctionName}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.role || "—"}</td>
                  <td className="px-4 py-3">{inr(p.basePrice)}</td>
                  <td className="px-4 py-3">{p.soldPrice != null ? inr(p.soldPrice) : "—"}</td>
                  <td className="px-4 py-3 capitalize">{p.source || "—"}</td>
                  <td className="px-4 py-3">{p.phone || "—"}</td>
                </tr>
              ))}
              {!roster.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No players on this team yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-display text-3xl">Tournaments</h2>
            {!tournaments.length && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Your team is not in a tournament yet.
              </p>
            )}
            {tournaments.map((t: any) => (
              <div key={t.id} className="neu-sm space-y-1 px-4 py-3">
                <p className="font-display text-2xl">{t.name}</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {t.sport} · {t.categoryName} · {t.venue || "Venue TBD"}
                  {t.startDate ? ` · ${t.startDate}` : ""}
                  {t.endDate ? ` → ${t.endDate}` : ""}
                </p>
              </div>
            ))}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-display text-3xl">Auctions</h2>
            {!auctions.length && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No auctions list your team yet. Use a code below when the auctioneer shares one.
              </p>
            )}
            {auctions.map((a: any) => (
              <div key={a.id} className="neu-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-display text-2xl">{a.name}</p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {a.sport} · {a.tournamentName || "Tournament"} · {statusLabel(a.status)}
                    {a.code ? ` · Code ${a.code}` : ""}
                  </p>
                </div>
                <Button
                  variant="bid"
                  disabled={busy || a.status === "completed"}
                  onClick={() => enterAuction({ auctionId: a.id, code: a.code })}
                >
                  {a.status === "completed" ? "Ended" : busy ? "Opening…" : "Enter auction"}
                </Button>
              </div>
            ))}
          </Card>
        </div>

        <form onSubmit={joinByCode}>
          <Card className="mx-auto max-w-md space-y-4">
            <h2 className="font-display text-3xl">Enter with code</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              If your team is not listed above, type the auction code from the hammer desk.
            </p>
            <Field
              label="Auction code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
            {err && <p style={{ color: "var(--crimson)" }}>{err}</p>}
            <Button variant="bid" type="submit" disabled={busy}>
              {busy ? "Joining…" : "Enter auction"}
            </Button>
          </Card>
        </form>
      </div>
    </Shell>
  );
}
