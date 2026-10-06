"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/ui";
import { BidTicker, Confetti, PlayerHero, PurseMeter, SoldOverlay, UnsoldOverlay } from "@/components/AuctionBits";
import { useApp } from "@/components/Providers";
import { inr, beep, crToLakhs, lakhsToCr } from "@/lib/format";

type Mode = "auctioneer" | "owner" | "spectator";

/** Full celebration GIF length (~10s at 12fps) so the popup does not cut off early */
const CELEBRATION_MS = 10500;

function rosterSize(stats: any) {
  if (stats?.rosterCount != null) return Number(stats.rosterCount);
  return (stats?.roster || []).length;
}

function teamMaxBid(stats: any, denom: number, auction: any) {
  if (stats?.maxBidMode === "baseQuotas" && stats?.maxBid != null) return Number(stats.maxBid);
  const row = (stats?.maxBidByDenom || []).find((d: any) => Number(d.purse) === Number(denom));
  if (row) return Number(row.maxBid);
  if (stats?.maxBid != null) return Number(stats.maxBid);
  const empty = Math.max(0, Number(auction.maxSquad || 0) - rosterSize(stats));
  if (empty <= 0) return 0;
  return Math.max(0, Number(stats?.purseLeft || 0) - Math.max(0, empty - 1) * Number(denom || 0));
}

function teamBlocked(stats: any, minNext: number, holding: boolean, maxSquad: number) {
  if (!stats) return true;
  if (holding) return false;
  if (stats.atBaseLimit) return true;
  if (rosterSize(stats) >= Number(maxSquad || 0) && Number(maxSquad || 0) > 0) return true;
  if (stats.cannotBidFurther) return true;
  if (minNext > Number(stats.maxBid || 0) + 1e-9) return true;
  if (minNext > Number(stats.purseLeft || 0) + 1e-9) return true;
  return false;
}

function RemainingByBase({ rows }: { rows: any[] }) {
  if (!rows?.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        Remaining by base
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {rows.map((b: any) => (
          <li key={String(b.basePrice)} className="flex justify-between gap-2">
            <span>{b.basePrice == null ? "Unset" : inr(b.basePrice)}</span>
            <span style={{ color: "var(--muted)" }}>{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamIntel({
  team,
  auction,
  denom,
  minNext,
  holdingTeamId,
  expanded,
  onToggle
}: {
  team: any;
  auction: any;
  denom: number;
  minNext: number;
  holdingTeamId?: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const s = team.stats || {};
  const maxBid = teamMaxBid(s, denom, auction);
  const rosterCount = rosterSize(s);
  const roster = s.roster || [];
  const holding = holdingTeamId === team.id;
  const blocked = teamBlocked(s, minNext, holding, Number(auction.maxSquad || 0));
  const bases = (s.baseSlots || []).filter((b: any) => b.cap != null);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative h-fit min-w-[220px] overflow-hidden rounded-2xl p-4 text-left"
      style={{
        background: "var(--neu-bg)",
        boxShadow: "8px 8px 16px var(--neu-dark), -8px -8px 16px var(--neu-light)",
        borderTop: `4px solid ${team.color || "var(--turf)"}`
      }}
    >
      {blocked ? <div className="team-blocked-overlay">Cannot bid further</div> : null}
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-2xl leading-tight" style={{ color: team.color }}>
          {team.name}
        </h4>
        {team.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-canvas px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Purse left
          </p>
          <strong>{inr(s.purseLeft)}</strong>
        </div>
        <div className="rounded-xl bg-canvas px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Next max
          </p>
          <strong>{inr(maxBid)}</strong>
        </div>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Squad {rosterCount}/{auction.maxSquad} · tap for details
      </p>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-black/5 pt-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-turf">Base slots</p>
          <ul className="space-y-0.5 text-xs">
            {bases.map((b: any) => (
              <li key={b.basePrice} className="flex justify-between gap-2">
                <span>{inr(b.basePrice)}</span>
                <span style={{ color: "var(--muted)" }}>
                  {b.owned}/{b.cap} · {b.left} left
                </span>
              </li>
            ))}
            {!bases.length && <li style={{ color: "var(--muted)" }}>No base caps configured</li>}
          </ul>
          <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-turf">Players bought</p>
          <ul className="max-h-40 space-y-0.5 overflow-auto text-sm">
            {roster.map((r: any) => (
              <li key={r.playerId} className="flex justify-between gap-2 py-0.5">
                <span>
                  {r.playerName || "Player"}
                  {r.retained ? " (R)" : ""}
                  <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>
                    {inr(r.basePrice)}
                  </span>
                </span>
                <span style={{ color: "var(--muted)" }}>{inr(r.soldPrice)}</span>
              </li>
            ))}
            {!roster.length && (
              <li className="text-xs" style={{ color: "var(--muted)" }}>
                No players yet
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </button>
  );
}

function pick(obj: any, ...keys: string[]) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

export function LiveBoard({
  mode,
  state,
  emit,
  auctionId,
  teamId,
  onPublic,
  liveBidding = false
}: {
  mode: Mode;
  state: any;
  emit: (e: string, p?: any) => Promise<any>;
  auctionId?: string;
  teamId?: string;
  onPublic?: (s: any) => void;
  liveBidding?: boolean;
}) {
  const { setSport } = useApp();
  const router = useRouter();
  const live = state.live;
  const auction = state.auction;
  const currentBid =
    Number(pick(live, "currentBid", "currentBid") ?? 0) ||
    Number(live?.currentPlayer?.basePrice) ||
    0;
  const lastBidTeamId = pick(live, "lastBidTeamId", "lastBidTeamId");
  const celebration = pick(live, "celebration", "celebration");
  const mine = state.teams.find((t: any) => t.id === teamId);
  const lastTeam =
    state.teams.find((t: any) => t.id === lastBidTeamId) ||
    (live?.lastBidTeamName ? { name: live.lastBidTeamName, color: live.lastBidTeamColor, logo: live.lastBidTeamLogo } : null);
  const soldTeam = state.teams.find((t: any) => t.id === celebration?.teamId);
  const notStarted = auction.status === "draft" && live?.phase !== "bidding" && !live?.currentPlayer;
  const paused = auction.status === "paused";
  const poolEmpty = live?.offerEnd === true || (live?.phase === "done" && !(live?.remainingCount > 0));
  const [err, setErr] = useState("");
  const [soldTeamId, setSoldTeamId] = useState("");
  const [soldPrice, setSoldPrice] = useState("");
  const [bidTeamId, setBidTeamId] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const [outbid, setOutbid] = useState(false);
  const [soldStamp, setSoldStamp] = useState<number | null>(null);
  const [unsoldStamp, setUnsoldStamp] = useState<number | null>(null);
  const [maxBidPopup, setMaxBidPopup] = useState(false);
  const [endPrompt, setEndPrompt] = useState(false);
  const [endPromptSeen, setEndPromptSeen] = useState(false);
  const configuredDenoms: number[] = auction.denominators?.length ? auction.denominators.map(Number) : [auction.purse];
  const playerBase = Number(live?.currentPlayer?.basePrice) || 0;
  const denoms = useMemo(() => {
    const set = new Set<number>(configuredDenoms.filter((n) => Number.isFinite(n) && n > 0));
    if (playerBase > 0) set.add(playerBase);
    return [...set].sort((a, b) => a - b);
  }, [configuredDenoms.join(","), playerBase]);
  const [denom, setDenom] = useState<number>(denoms[0]);

  const aid = auctionId || auction?.id;
  const teams = state.teams || [];
  const mineMaxBid = mine ? teamMaxBid(mine.stats, denom, auction) : 0;

  const minNextBid = useMemo(() => {
    const cur = currentBid || 0;
    const incs = auction.increments || [];
    const stepRow = [...incs]
      .sort((a: any, b: any) => (a.from ?? 0) - (b.from ?? 0))
      .find((r: any) => cur >= (r.from ?? 0) && cur < (r.to ?? 999999999));
    const step = stepRow?.step ?? 5;
    return lastBidTeamId ? cur + step : Math.max(cur, live?.currentPlayer?.basePrice || 0);
  }, [currentBid, lastBidTeamId, live?.currentPlayer, auction.increments]);

  const teamsEligibleForLot = useMemo(() => {
    return teams.filter((t: any) => !teamBlocked(t.stats, minNextBid, lastBidTeamId === t.id, Number(auction.maxSquad || 0)));
  }, [teams, auction.maxSquad, live?.currentPlayer?.id, minNextBid, lastBidTeamId, currentBid]);

  const teamsBlockedFurther = useMemo(
    () => teams.filter((t: any) => teamBlocked(t.stats, minNextBid, lastBidTeamId === t.id, Number(auction.maxSquad || 0))),
    [teams, auction.maxSquad, live?.currentPlayer?.id, minNextBid, lastBidTeamId, currentBid]
  );

  useEffect(() => {
    if (auction?.sport) setSport(auction.sport);
  }, [auction?.sport, setSport]);

  useEffect(() => {
    if (playerBase > 0) setDenom(playerBase);
    else if (!denoms.includes(denom)) setDenom(denoms[0]);
  }, [live?.currentPlayer?.id, playerBase]);

  // Match full celebration GIF length (~10s at 12fps) so the popup does not cut off early
  const celebrationClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armCelebrationClear = (kind: "sold" | "unsold") => {
    if (celebrationClearRef.current) clearTimeout(celebrationClearRef.current);
    celebrationClearRef.current = setTimeout(() => {
      celebrationClearRef.current = null;
      if (kind === "unsold") setUnsoldStamp(null);
      else setSoldStamp(null);
    }, CELEBRATION_MS);
  };

  useEffect(() => {
    const soldUrl = state?.meta?.celebrations?.sold?.url || "/celebrations/tiger-sold.gif";
    const unsoldUrl = state?.meta?.celebrations?.unsold?.url || "/celebrations/tiger-unsold.gif";
    // Preload so sold/unsold overlays appear immediately with animation ready
    const a = new Image();
    a.src = soldUrl;
    const b = new Image();
    b.src = unsoldUrl;
  }, [state?.meta?.celebrations?.sold?.url, state?.meta?.celebrations?.unsold?.url]);

  useEffect(() => {
    const at = celebration?.at;
    // Keep optimistic overlay up until its own timer finishes (do not clear on null at)
    if (!at) return;
    const kind = celebration?.type === "unsold" ? "unsold" : "sold";
    if (kind === "unsold") {
      setSoldStamp(null);
      setUnsoldStamp(at);
      armCelebrationClear("unsold");
      return;
    }
    setUnsoldStamp(null);
    setSoldStamp(at);
    armCelebrationClear("sold");
  }, [celebration?.at, celebration?.type]);

  useEffect(() => {
    const preferred =
      lastBidTeamId && teamsEligibleForLot.some((t: any) => t.id === lastBidTeamId)
        ? lastBidTeamId
        : teamsEligibleForLot[0]?.id || "";
    setSoldTeamId(preferred);
    setBidTeamId(preferred);
    setSoldPrice(currentBid ? String(lakhsToCr(currentBid)) : "");
    setBidPrice(currentBid ? String(lakhsToCr(currentBid)) : "");
  }, [live?.currentPlayer?.id, currentBid, lastBidTeamId, teamsEligibleForLot]);

  useEffect(() => {
    if (mode !== "auctioneer") return;
    if (live?.offerEnd && !endPromptSeen) {
      setEndPrompt(true);
      setEndPromptSeen(true);
    }
    if (!live?.offerEnd) {
      setEndPromptSeen(false);
      setEndPrompt(false);
    }
  }, [live?.offerEnd, mode, endPromptSeen]);

  useEffect(() => {
    if (mode !== "owner" || !teamId) return;
    if (lastBidTeamId && lastBidTeamId !== teamId) {
      setOutbid(true);
      beep("outbid");
      try {
        navigator.vibrate?.(40);
      } catch {
        /* */
      }
      const t = setTimeout(() => setOutbid(false), 800);
      return () => clearTimeout(t);
    }
  }, [currentBid, lastBidTeamId, mode, teamId]);

  useEffect(() => {
    if (mode !== "owner" || !mine || !live?.currentPlayer || live?.phase !== "bidding") {
      setMaxBidPopup(false);
      return;
    }
    const holding = lastBidTeamId === teamId;
    const blocked = teamBlocked(mine.stats, minNextBid, holding, Number(auction.maxSquad || 0));
    setMaxBidPopup(blocked && !holding);
  }, [mode, mine, live?.currentPlayer?.id, live?.phase, minNextBid, lastBidTeamId, teamId, auction.maxSquad, currentBid]);

  const paddles = useMemo(() => {
    const cur = currentBid || 0;
    const incs = auction.increments || [];
    const stepRow = [...incs]
      .sort((a: any, b: any) => (a.from ?? 0) - (b.from ?? 0))
      .find((r: any) => cur >= (r.from ?? 0) && cur < (r.to ?? 999999999));
    const step = stepRow?.step ?? 5;
    const next = lastBidTeamId ? cur + step : Math.max(cur, live?.currentPlayer?.basePrice || 0);
    const cap =
      mode === "auctioneer"
        ? teamMaxBid(teams.find((t: any) => t.id === bidTeamId)?.stats, denom, auction)
        : teamMaxBid(mine?.stats, denom, auction);
    const purse =
      mode === "auctioneer"
        ? Number(teams.find((t: any) => t.id === bidTeamId)?.stats?.purseLeft ?? Infinity)
        : Number(mine?.stats?.purseLeft ?? Infinity);
    const jumps = [
      { label: `+ ${inr(step)}`, amount: next },
      { label: "+ ₹20 L", amount: cur + 20 },
      { label: "+ ₹50 L", amount: cur + 50 },
      { label: "+ ₹1 Cr", amount: cur + 100 }
    ];
    const seen = new Set<number>();
    return jumps.filter((j) => {
      if (seen.has(j.amount)) return false;
      seen.add(j.amount);
      return j.amount >= next && j.amount <= cap + 1e-9 && j.amount <= purse + 1e-9;
    });
  }, [
    currentBid,
    lastBidTeamId,
    live?.currentPlayer,
    auction.increments,
    mine?.stats,
    mode,
    bidTeamId,
    teams,
    denom,
    auction
  ]);

  const soldLakhs = () => (soldPrice === "" ? currentBid : crToLakhs(soldPrice));

  const refuseOverCap = (team: any, priceLakhs: number, label: string) => {
    const purse = Number(team?.stats?.purseLeft ?? 0);
    const cap = teamMaxBid(team?.stats, denom, auction);
    if (priceLakhs > purse + 1e-9) {
      throw new Error(`${label} exceeds remaining purse for ${team?.name || "this team"} (${inr(purse)})`);
    }
    if (priceLakhs > cap + 1e-9) {
      throw new Error(`${label} exceeds max bid for ${team?.name || "this team"} (${inr(cap)})`);
    }
  };

  const act = async (event: string, payload: any = {}) => {
    try {
      setErr("");
      if (event === "sold") {
        const team = teams.find((t: any) => t.id === (payload.teamId || soldTeamId));
        const price = soldLakhs();
        refuseOverCap(team, price, "Sold price");
        payload = { teamId: payload.teamId || soldTeamId, price };
        // Show immediately — do not wait for the socket round-trip
        setUnsoldStamp(null);
        setSoldStamp(Date.now());
        armCelebrationClear("sold");
      }
      if (event === "unsold") {
        setSoldStamp(null);
        setUnsoldStamp(Date.now());
        armCelebrationClear("unsold");
      }
      const res: any = await emit(event, { auctionId: aid, ...payload });
      if (res?.public) onPublic?.(res.public);
    } catch (e: any) {
      // Roll back optimistic overlay if the server rejected the action
      if (event === "sold" || event === "unsold") {
        if (celebrationClearRef.current) {
          clearTimeout(celebrationClearRef.current);
          celebrationClearRef.current = null;
        }
        if (event === "sold") setSoldStamp(null);
        if (event === "unsold") setUnsoldStamp(null);
      }
      setErr(e.message);
      beep("warn");
    }
  };

  const bid = async (amount?: number, forTeam?: string) => {
    try {
      setErr("");
      const whoId = forTeam || teamId;
      if (!whoId) throw new Error("Pick a team");
      const who = teams.find((t: any) => t.id === whoId);
      if (amount != null) refuseOverCap(who, amount, "Bid");
      const res: any = await emit("bid", { auctionId: aid, teamId: whoId, amount, denom });
      if (res?.public) onPublic?.(res.public);
    } catch (e: any) {
      setErr(e.message);
      beep("warn");
    }
  };

  const endAuctionNow = async () => {
    try {
      setErr("");
      setEndPrompt(false);
      const res: any = await emit("end-auction", { auctionId: aid });
      if (res?.public) onPublic?.(res.public);
      const code = res?.public?.auction?.code || auction?.code;
      if (code) router.push(`/summary/${code}`);
    } catch (e: any) {
      setErr(e.message);
      beep("warn");
    }
  };

  const holding = lastBidTeamId === teamId;

  const canBid =
    mode === "owner" &&
    liveBidding &&
    !holding &&
    !paused &&
    auction.status === "live" &&
    !!mine &&
    !teamBlocked(mine.stats, minNextBid, false, Number(auction.maxSquad || 0)) &&
    Number(mine.stats?.purseLeft || 0) >= minNextBid &&
    mineMaxBid >= minNextBid;

  if (notStarted && mode !== "auctioneer") {
    return (
      <Card className="mx-auto max-w-xl py-16 text-center">
        <p className="font-display text-5xl">Auction not started</p>
        <p className="mt-3 text-[var(--muted)]">
          The Auctioneer hasn&apos;t started the auction yet. Please contact the auctioneer or wait for it to start.
        </p>
      </Card>
    );
  }

  const rivals = (() => {
    const others = teams.filter((t: any) => t.id !== teamId);
    const sameCat = others.filter((t: any) => !auction.categoryId || t.categoryId === auction.categoryId);
    return sameCat.length ? sameCat : others;
  })();

  return (
    <div className="space-y-4">
      <Confetti show={!!soldStamp} />
      <SoldOverlay
        show={!!soldStamp}
        team={soldTeam}
        onDismiss={() => setSoldStamp(null)}
        gifSrc={state?.meta?.celebrations?.sold?.url || null}
      />
      <UnsoldOverlay
        show={!!unsoldStamp}
        onDismiss={() => setUnsoldStamp(null)}
        gifSrc={state?.meta?.celebrations?.unsold?.url || null}
      />
      {mode === "owner" && maxBidPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <Card className="relative z-[71] max-w-md space-y-3 p-6 text-center">
            <h2 className="font-display text-3xl">Maximum bid reached</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;ve reached maximum bid count. Cannot bid further on this player.
            </p>
            <p className="text-sm">
              Your max for this lot: <strong>{inr(mineMaxBid)}</strong>
            </p>
            <Button variant="turf" onClick={() => setMaxBidPopup(false)}>
              OK
            </Button>
          </Card>
        </div>
      )}

      {mode === "auctioneer" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="lime" onClick={() => act("start-auction")}>
            {auction.status === "live" || auction.status === "paused" ? "Reset live auction" : "Start auction"}
          </Button>
          <Button variant="turf" onClick={() => act("next-player")} disabled={poolEmpty}>
            Next player
          </Button>
          <Button variant="lime" onClick={() => act("sold", { teamId: soldTeamId })} disabled={poolEmpty && live?.phase !== "bidding"}>
            Sold
          </Button>
          <Button onClick={() => act("pause-auction")}>{paused ? "Resume" : "Pause"}</Button>
          <Button onClick={() => act("undo")}>Undo</Button>
          <Button variant="danger" onClick={() => act("unsold")} disabled={live?.phase !== "bidding"}>
            Unsold
          </Button>
          {(poolEmpty || auction.status === "completed") && (
            <Button variant="turf" onClick={endAuctionNow}>
              End auction
            </Button>
          )}
        </div>
      )}
      {mode === "auctioneer" && endPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <Card className="relative z-[71] max-w-md space-y-4 p-6">
            <h2 className="font-display text-4xl">End auction?</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Every player has been through the auction. End now to open the summary, or continue on the hammer desk and end later.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="turf" onClick={endAuctionNow}>
                End
              </Button>
              <Button
                onClick={() => {
                  setEndPrompt(false);
                }}
              >
                Continue
              </Button>
            </div>
          </Card>
        </div>
      )}
      {err && (
        <p className="font-semibold" style={{ color: "var(--crimson)" }}>
          {err}
        </p>
      )}

      <div
        className={
          mode === "owner"
            ? "grid items-start gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
            : "grid items-start gap-3 lg:grid-cols-[minmax(160px,0.7fr)_minmax(0,1.8fr)_minmax(180px,0.75fr)]"
        }
      >
        {(mode === "auctioneer" || mode === "owner" || mode === "spectator") && (
          <Card className="h-fit max-h-[52vh] overflow-auto p-4">
            <h3 className="font-display text-xl">Unsold · {live?.unsoldPlayers?.length || 0}</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {(live?.unsoldPlayers || []).map((p: any) => (
                <li key={p.id} className="rounded-xl bg-canvas px-2.5 py-1.5">
                  {p.name}
                  <span className="block text-[11px] text-[var(--muted)]">
                    {p.role || p.categoryName} · {inr(p.basePrice)}
                  </span>
                </li>
              ))}
              {!live?.unsoldPlayers?.length && <li className="text-xs text-[var(--muted)]">None yet</li>}
            </ul>
            {(mode === "auctioneer" || mode === "spectator") && (
              <RemainingByBase rows={live?.remainingByBase || []} />
            )}
          </Card>
        )}

        <div className="min-w-0 space-y-3">
          <PlayerHero
            key={live?.currentPlayer?.id || "empty"}
            player={live?.currentPlayer}
            accent={lastTeam?.color}
            currentBid={currentBid}
            lastTeam={lastTeam}
          />
          {mode !== "owner" && (
            <div className={`card h-fit p-4 ${outbid ? "outbid-shake" : lastBidTeamId ? "lime-flash" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--muted)]">Current bid</p>
                <BidTicker team={lastTeam} amount={currentBid} />
              </div>
              <p className="font-display mt-1 text-6xl leading-none text-turf">{inr(currentBid)}</p>
              <p className="mt-1 text-lg">{lastTeam?.name || "Waiting for a raise"}</p>
              {mode === "auctioneer" && (
                <div className="mt-4 space-y-3 border-t border-[color-mix(in_srgb,var(--ink)_10%,transparent)] pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-turf">Call a bid (shown live)</p>
                  {teamsBlockedFurther.length > 0 && live?.currentPlayer ? (
                    <p className="text-sm font-semibold" style={{ color: "var(--crimson)" }}>
                      Cannot bid further: {teamsBlockedFurther.map((t: any) => t.name).join(", ")}
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Bidding team
                      <select className="field mt-1" value={bidTeamId} onChange={(e) => setBidTeamId(e.target.value)}>
                        {!teamsEligibleForLot.length && <option value="">No eligible teams</option>}
                        {teamsEligibleForLot.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Bid (Cr)" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} />
                    <Button
                      variant="lime"
                      disabled={!bidTeamId}
                      onClick={() => bid(bidPrice === "" ? undefined : crToLakhs(bidPrice), bidTeamId)}
                    >
                      Call bid
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {paddles.map((p) => (
                      <Button key={p.label} variant="ghost" disabled={!bidTeamId} onClick={() => bid(p.amount, bidTeamId)}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Winning team
                      <select className="field mt-1" value={soldTeamId} onChange={(e) => setSoldTeamId(e.target.value)}>
                        {!teamsEligibleForLot.length && <option value="">No eligible teams</option>}
                        {teamsEligibleForLot.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Sold price (Cr)" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} />
                    <Button variant="lime" disabled={!soldTeamId} onClick={() => act("sold", { teamId: soldTeamId })}>
                      Confirm sold
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {mode === "owner" && liveBidding && (
            <div className={`card h-fit p-4 ${outbid ? "outbid-shake" : ""}`}>
              {holding && <p className="text-sm">You have the current bid.</p>}
              {!canBid && live?.phase === "bidding" && !holding && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {!mine
                    ? "Your team is not linked to this auction yet — re-enter the auction code."
                    : paused
                      ? "Auction is paused."
                      : mine.stats?.atBaseLimit
                        ? `Cannot bid — max players at ${inr(live?.currentPlayer?.basePrice)} base` +
                          (mine.stats.baseCap != null
                            ? ` (${mine.stats.baseCount}/${mine.stats.baseCap}).`
                            : ".")
                        : "You've reached maximum bid count. Cannot bid further."}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {paddles.map((p) => (
                  <Button key={p.label} variant="ghost" disabled={!canBid} onClick={() => bid(p.amount)}>
                    {p.label}
                  </Button>
                ))}
                <Button variant="bid" disabled={!canBid} onClick={() => bid()}>
                  Place bid
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {(mode === "auctioneer" || mode === "owner" || mode === "spectator") && (
            <Card className="h-fit p-4">
              <label className="block text-[11px] uppercase tracking-widest text-turf">
                Max bid using (auto: player base)
                <select className="field mt-1" value={String(denom)} onChange={(e) => setDenom(Number(e.target.value))}>
                  {denoms.map((d) => (
                    <option key={d} value={d}>
                      {inr(d)}
                      {playerBase > 0 && d === playerBase ? " · lot base" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {mode === "owner" && mine ? (
                <>
                  <h3 className="font-display mt-3 text-2xl" style={{ color: mine.color }}>
                    {mine.name}
                  </h3>
                  <PurseMeter spent={mine.stats?.purseSpent || 0} total={auction.purse} />
                  <p className="mt-2 text-sm">
                    Squad {rosterSize(mine.stats)}/{auction.maxSquad} · max bid {inr(mineMaxBid)}
                  </p>
                </>
              ) : null}
              {mode === "auctioneer" ? <RemainingByBase rows={live?.remainingByBase || []} /> : null}
            </Card>
          )}
          {mode !== "owner" && (
            <Card className="h-fit max-h-[40vh] overflow-auto p-4">
              <h3 className="font-display text-xl">Pool · {live?.remainingCount ?? 0}</h3>
              <RemainingByBase rows={live?.remainingByBase || []} />
              <ul className="mt-2 space-y-1 text-sm">
                {(live?.remainingPlayers || []).slice(0, 30).map((p: any) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="text-[var(--muted)]">{inr(p.basePrice)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {(mode === "owner" || mode === "auctioneer") && (
        <div className="grid w-full items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {(mode === "auctioneer" ? teams : rivals).map((t: any) => (
            <TeamIntel
              key={t.id}
              team={t}
              auction={auction}
              denom={denom}
              minNext={minNextBid}
              holdingTeamId={lastBidTeamId}
              expanded={!!openTeams[t.id]}
              onToggle={() => setOpenTeams((o) => ({ ...o, [t.id]: !o[t.id] }))}
            />
          ))}
        </div>
      )}

      {mode === "spectator" && (
        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {teams.map((t: any) => (
            <TeamIntel
              key={t.id}
              team={t}
              auction={auction}
              denom={denom}
              minNext={minNextBid}
              holdingTeamId={lastBidTeamId}
              expanded={!!openTeams[t.id]}
              onToggle={() => setOpenTeams((o) => ({ ...o, [t.id]: !o[t.id] }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
