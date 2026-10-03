"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/ui";
import { BidTicker, Confetti, GavelTimer, PlayerHero, PurseMeter, SoldOverlay } from "@/components/AuctionBits";
import { useApp } from "@/components/Providers";
import { inr, beep, crToLakhs, lakhsToCr } from "@/lib/format";

type Mode = "auctioneer" | "owner" | "spectator";

function rosterSize(stats: any) {
  if (stats?.rosterCount != null) return Number(stats.rosterCount);
  if (stats?.rosterCount != null) return Number(stats.rosterCount);
  return (stats?.roster || []).length;
}

function maxBidForDenom(stats: any, denom: number, auction: any) {
  const row = (stats?.maxBidByDenom || []).find((d: any) => Number(d.purse) === Number(denom));
  if (row) return row.maxBid;
  const empty = Math.max(0, Number(auction.maxSquad || 0) - rosterSize(stats));
  if (empty <= 0) return 0;
  return Math.max(0, Number(stats?.purseLeft || 0) - Math.max(0, empty - 1) * Number(denom || 0));
}

function RemainingToBuy({ stats }: { stats: any }) {
  const bases = (stats?.baseSlots || []).filter((b: any) => b.cap != null);
  if (!bases.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        Remaining to buy
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {bases.map((b: any) => (
          <li key={b.basePrice} className="flex justify-between gap-2">
            <span>{inr(b.basePrice)}</span>
            <span style={{ color: "var(--muted)" }}>
              {b.owned}/{b.cap} · {b.left} left
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamIntel({ team, auction, denom }: { team: any; auction: any; denom: number }) {
  const s = team.stats || {};
  const maxBid = maxBidForDenom(s, denom, auction);
  const rosterCount = rosterSize(s);
  const roster = s.roster || [];
  const bought = (s.categoryBought || s.categoryBought || []).filter((c: any) => c.count > 0);
  return (
    <div
      className="h-fit min-w-[220px] overflow-hidden rounded-2xl p-4"
      style={{
        background: "var(--neu-bg)",
        boxShadow: "8px 8px 16px var(--neu-dark), -8px -8px 16px var(--neu-light)",
        borderTop: `4px solid ${team.color || "var(--turf)"}`
      }}
    >
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
        Squad {rosterCount}/{auction.maxSquad}
      </p>
      <RemainingToBuy stats={s} />
      <ul className="mt-2 space-y-0.5 text-sm">
        {roster.map((r: any) => (
          <li key={r.playerId} className="flex justify-between gap-2 py-0.5">
            <span>
              {r.playerName || r.name || "Player"}
              {r.retained ? " (R)" : ""}
            </span>
            <span style={{ color: "var(--muted)" }}>{inr(r.soldPrice)}</span>
          </li>
        ))}
        {!roster.length && bought.length === 0 && (
          <li className="text-xs" style={{ color: "var(--muted)" }}>
            No players yet
          </li>
        )}
      </ul>
      {bought.length > 0 && !roster.length && (
        <div className="mt-2 space-y-1.5">
          {bought.map((c: any) => (
            <div key={c.id}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-turf">
                {c.name} · {c.count}
              </p>
              <ul className="text-sm">
                {(c.players || []).map((p: any) => (
                  <li key={p.id} className="flex justify-between gap-2 py-0.5">
                    <span>
                      {p.name}
                      {p.retained ? " (R)" : ""}
                    </span>
                    <span style={{ color: "var(--muted)" }}>{inr(p.soldPrice)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const currentBid = Number(pick(live, "currentBid", "currentBid") ?? 0);
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
  const [endPrompt, setEndPrompt] = useState(false);
  const [endPromptSeen, setEndPromptSeen] = useState(false);
  const denoms: number[] = auction.denominators?.length ? auction.denominators.map(Number) : [auction.purse];
  const [denom, setDenom] = useState<number>(denoms[0]);

  useEffect(() => {
    if (auction?.sport) setSport(auction.sport);
  }, [auction?.sport, setSport]);

  useEffect(() => {
    if (!denoms.includes(denom)) setDenom(denoms[0]);
  }, [denoms.join(","), denom]);

  useEffect(() => {
    const at = celebration?.at;
    if (!at) {
      setSoldStamp(null);
      return;
    }
    setSoldStamp(at);
    const t = setTimeout(() => setSoldStamp(null), 4000);
    return () => clearTimeout(t);
  }, [celebration?.at]);

  useEffect(() => {
    setSoldTeamId(lastBidTeamId || state.teams?.[0]?.id || "");
    setBidTeamId(lastBidTeamId || state.teams?.[0]?.id || "");
    setSoldPrice(currentBid ? String(lakhsToCr(currentBid)) : "");
    setBidPrice(currentBid ? String(lakhsToCr(currentBid)) : "");
  }, [live?.currentPlayer?.id, currentBid, lastBidTeamId, state.teams]);

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

  const aid = auctionId || auction?.id;
  const teams = state.teams || [];

  const paddles = useMemo(() => {
    const cur = currentBid || 0;
    const incs = auction.increments || auction.increments || [];
    const stepRow = [...incs]
      .sort((a: any, b: any) => (a.from ?? a.from) - (b.from ?? b.from))
      .find((r: any) => {
        const from = r.from ?? r.from;
        const to = r.to ?? r.to;
        return cur >= from && cur < to;
      });
    const step = stepRow?.step ?? stepRow?.step ?? 5;
    const next = lastBidTeamId ? cur + step : Math.max(cur, live?.currentPlayer?.basePrice || 0);
    const cap =
      mode === "auctioneer"
        ? Number(teams.find((t: any) => t.id === bidTeamId)?.stats?.maxBid ?? Infinity)
        : Number(mine?.stats?.maxBid ?? Infinity);
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
    auction.increments,
    mine?.stats?.maxBid,
    mine?.stats?.purseLeft,
    mode,
    bidTeamId,
    teams
  ]);

  const soldLakhs = () => (soldPrice === "" ? currentBid : crToLakhs(soldPrice));

  const refuseOverCap = (team: any, priceLakhs: number, label: string) => {
    const purse = Number(team?.stats?.purseLeft ?? 0);
    const cap = Number(team?.stats?.maxBid ?? 0);
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
      }
      const res: any = await emit(event, { auctionId: aid, ...payload });
      if (res?.public) onPublic?.(res.public);
    } catch (e: any) {
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
      const res: any = await emit("bid", { auctionId: aid, teamId: whoId, amount });
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
    mode === "owner" && liveBidding && mine?.stats?.canBid && !holding && !paused && auction.status === "live";

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
      <SoldOverlay show={!!soldStamp} team={soldTeam} onDismiss={() => setSoldStamp(null)} />

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
          <Button onClick={() => act("extend-timer")}>Reset counter</Button>
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
          </Card>
        )}

        <div className="min-w-0 space-y-3">
          <PlayerHero
            key={live?.currentPlayer?.id || "empty"}
            player={live?.currentPlayer}
            accent={lastTeam?.color}
            currentBid={currentBid}
            lastTeam={lastTeam}
            timer={
              <GavelTimer
                endsAt={pick(live, "timerEndsAt", "timerEndsAt")}
                totalSeconds={auction.timerSeconds ?? auction.timerSeconds}
                frozenMs={paused ? pick(live, "timerFrozenMs", "timerFrozenMs") : null}
              />
            }
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
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Bidding team
                      <select className="field mt-1" value={bidTeamId} onChange={(e) => setBidTeamId(e.target.value)}>
                        {!teams.length && <option value="">No teams</option>}
                        {teams.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Bid (Cr)" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} />
                    <Button
                      variant="lime"
                      onClick={() => bid(bidPrice === "" ? undefined : crToLakhs(bidPrice), bidTeamId)}
                    >
                      Call bid
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {paddles.map((p) => (
                      <Button key={p.label} variant="ghost" onClick={() => bid(p.amount, bidTeamId)}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Winning team
                      <select className="field mt-1" value={soldTeamId} onChange={(e) => setSoldTeamId(e.target.value)}>
                        {!teams.length && <option value="">No teams in this auction</option>}
                        {teams.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Sold price (Cr)" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} />
                    <Button variant="lime" onClick={() => act("sold", { teamId: soldTeamId })}>
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
                        ? "Bid locked — max players at this base price."
                        : "You cannot bid on this lot (purse, squad, or category limit)."}
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
          {mode === "auctioneer" && (
            <Card className="h-fit p-4">
              <label className="block text-[11px] uppercase tracking-widest text-turf">
                Max bid denominator
                <select className="field mt-1" value={String(denom)} onChange={(e) => setDenom(Number(e.target.value))}>
                  {denoms.map((d) => (
                    <option key={d} value={d}>
                      {inr(d)}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
          )}
          {mode === "owner" && mine && (
            <Card className="h-fit p-4">
              <h3 className="font-display text-2xl" style={{ color: mine.color }}>
                {mine.name}
              </h3>
              <PurseMeter spent={mine.stats?.purseSpent || 0} total={auction.purse} />
              <p className="mt-2 text-sm">
                Squad {rosterSize(mine.stats)}/{auction.maxSquad} · max bid {inr(mine.stats?.maxBid)}
              </p>
              <RemainingToBuy stats={mine.stats} />
              <label className="mt-2 block text-[11px] uppercase tracking-widest text-turf">
                Rival max using
                <select className="field mt-1" value={String(denom)} onChange={(e) => setDenom(Number(e.target.value))}>
                  {denoms.map((d) => (
                    <option key={d} value={d}>
                      {inr(d)}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
          )}
          {mode !== "owner" && (
            <Card className="h-fit max-h-[40vh] overflow-auto p-4">
              <h3 className="font-display text-xl">Pool · {live?.remainingCount ?? live?.remainingCount ?? 0}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {(live?.remainingPlayers || live?.remainingPlayers || []).slice(0, 30).map((p: any) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="text-[var(--muted)]">{p.role || p.categoryName}</span>
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
            <TeamIntel key={t.id} team={t} auction={auction} denom={denom} />
          ))}
        </div>
      )}

      {mode === "spectator" && (
        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {teams.map((t: any) => (
            <Card key={t.id} className="h-fit p-3">
              <button className="w-full text-left" onClick={() => setOpenTeams((o) => ({ ...o, [t.id]: !o[t.id] }))}>
                <h3 className="font-display text-2xl leading-tight" style={{ color: t.color }}>
                  {t.name}
                </h3>
              </button>
              <PurseMeter spent={t.stats?.purseSpent || 0} total={auction.purse} />
              <p className="mt-1 text-xs">
                {t.stats?.rosterCount ?? t.stats?.rosterCount}/{auction.maxSquad ?? auction.maxSquad} · max {inr(t.stats?.maxBid)}
              </p>
              <RemainingToBuy stats={t.stats} />
              {openTeams[t.id] && (
                <ul className="mt-2 space-y-1 text-xs">
                  {(t.stats?.roster || []).map((r: any) => {
                    const p = state.players.find((x: any) => x.id === r.playerId);
                    return (
                      <li key={r.playerId} className="flex justify-between gap-2">
                        <span>
                          {p?.name} {r.retained ? "★" : ""}
                        </span>
                        <span>{inr(r.soldPrice)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
