"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ROLE_META, inr } from "@/lib/format";
import { AcplStatsCard } from "@/components/AcplStats";

export function Confetti({ show }: { show: boolean }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.45,
        color: ["#0284C7", "#22D3EE", "#2563EB", "#FFFFFF", "#38BDF8"][i % 5]
      })),
    [show]
  );
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bits.map((b) => (
        <span
          key={b.id}
          className="confetti-bit rounded-sm"
          style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s` }}
        />
      ))}
    </div>
  );
}

/** Animated celebration GIFs (transparent / green already keyed out). */
function TigerGif({
  src,
  alt,
  className = "",
  mood = "sold"
}: {
  src: string;
  alt: string;
  className?: string;
  mood?: "sold" | "unsold";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`tiger-mascot tiger-mascot-${mood} ${className}`}
    />
  );
}

export function SoldOverlay({
  show,
  team,
  onDismiss
}: {
  show: boolean;
  team?: { name?: string; logo?: string; color?: string } | null;
  onDismiss?: () => void;
}) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="relative flex min-h-[320px] w-[min(92vw,560px)] flex-col items-center justify-center overflow-hidden rounded-3xl p-6 text-center shadow-2xl sm:p-8"
        style={{
          background: `linear-gradient(160deg, ${team?.color || "#0284C7"} 0%, #fff7ed 55%, #fff 100%)`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <TigerGif
          src="/celebrations/tiger-sold.gif"
          alt="Tiger celebrating sold"
          mood="sold"
          className="h-[210px] w-auto max-w-[min(90vw,420px)] object-contain sm:h-[260px]"
        />
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.35em] text-turf">Hammer down</p>
        <div className="sold-stamp mt-2 border-4 border-crimson px-6 py-2 font-display text-6xl text-crimson">SOLD</div>
        <p className="mt-3 font-display text-3xl" style={{ color: team?.color || "var(--turf)" }}>
          to {team?.name || "—"}
        </p>
        {team?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo} alt="" className="mt-3 h-16 w-16 rounded-full object-cover ring-4 ring-gold" />
        ) : null}
        <p className="mt-3 text-xs" style={{ color: "#64748b" }}>
          Closes in a few seconds · click outside to return
        </p>
      </div>
    </div>
  );
}

export function UnsoldOverlay({ show, onDismiss }: { show: boolean; onDismiss?: () => void }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="relative flex min-h-[320px] w-[min(92vw,560px)] flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 to-slate-950 p-6 text-center shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <TigerGif
          src="/celebrations/tiger-unsold.gif"
          alt="Tiger disappointed unsold"
          mood="unsold"
          className="h-[210px] w-auto max-w-[min(90vw,420px)] object-contain sm:h-[260px]"
        />
        <div className="unsold-stamp mt-2 border-4 border-amber-200/80 px-6 py-2 font-display text-6xl text-amber-100">
          UNSOLD
        </div>
        <p className="mt-3 text-sm text-slate-300">No buyers — back to the pavilion</p>
        <p className="mt-2 text-xs text-slate-500">Closes in a few seconds · click outside to return</p>
      </div>
    </div>
  );
}

export function GavelTimer({
  endsAt,
  totalSeconds,
  frozenMs
}: {
  endsAt: number | null;
  totalSeconds?: number;
  frozenMs?: number | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const total = totalSeconds || 20;
  const left = endsAt ? Math.max(0, (endsAt - now) / 1000) : frozenMs != null ? frozenMs / 1000 : 0;
  const hot = left > 0 && left <= 10;
  const going = left > 0 && left <= 5;
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, left / total);
  return (
    <div className="inline-flex h-fit items-center gap-2 rounded-2xl px-2.5 py-1.5" style={{ background: "color-mix(in srgb, var(--neu-light) 55%, transparent)" }}>
      <svg viewBox="0 0 56 56" className="h-11 w-11 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={hot ? "var(--crimson)" : "var(--gold)"}
          strokeWidth="5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
        />
      </svg>
      <div className="leading-none">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
          {frozenMs != null && !endsAt ? "Paused" : going ? "Going" : "Gavel"}
        </p>
        <p className="font-display text-2xl" style={{ color: hot ? "var(--crimson)" : "var(--turf)" }}>
          {endsAt || frozenMs != null ? `${Math.ceil(left)}s` : "—"}
        </p>
      </div>
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] || ROLE_META.Batsman;
  return (
    <span className={`badge ${meta.className}`}>
      <span>{meta.emoji}</span> {meta.label}
    </span>
  );
}

export function PlayerHero({
  player,
  accent,
  compact = false,
  currentBid,
  lastTeam,
  timer
}: {
  player: any;
  accent?: string;
  compact?: boolean;
  currentBid?: number;
  lastTeam?: any;
  timer?: ReactNode;
}) {
  if (!player) {
    return (
      <div className="card flex min-h-[200px] flex-col items-center justify-center p-6 text-center">
        <p className="font-display text-4xl text-[var(--muted)]">Waiting for next lot</p>
        {timer ? <div className="mt-4">{timer}</div> : null}
      </div>
    );
  }
  const color = accent || "var(--turf)";
  return (
    <div className="card lot-card overflow-hidden">
      <div className={`grid gap-0 ${compact ? "grid-cols-[140px_1fr]" : "md:grid-cols-[240px_1fr]"}`}>
        <div
          className={`relative overflow-hidden ${compact ? "min-h-[180px]" : "min-h-[260px]"}`}
          style={{
            background: `radial-gradient(circle at 30% 18%, ${color}, #1e1b4b 78%)`
          }}
        >
          {player.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center font-display text-6xl text-white">
              {player.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className={compact ? "p-4" : "p-5 md:p-6"}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {player.categoryName ? <span className="badge bg-turf/10 text-turf">{player.categoryName}</span> : null}
            </div>
            {timer}
          </div>
          <h2 className={`font-display mt-2 leading-none ${compact ? "text-3xl md:text-5xl" : "text-4xl md:text-6xl"}`}>
            {player.name}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-canvas px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Base
              </p>
              <p className="font-display text-2xl">{inr(player.basePrice)}</p>
            </div>
            <div className="rounded-2xl bg-canvas px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Current bid
              </p>
              <p className="font-display text-2xl" style={{ color: "var(--turf)" }}>
                {currentBid != null ? inr(currentBid) : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-canvas px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Last raise
              </p>
              <p className="truncate text-sm font-bold">{lastTeam?.name || "No bid yet"}</p>
            </div>
          </div>
          <div className="mt-3">
            <AcplStatsCard
              acpl={player.acpl}
              compact
              href={player.acpl?.found && player.acpl?.id ? `/admin/acpl/${player.acpl.id}` : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PurseMeter({ spent, total }: { spent: number; total: number }) {
  const left = Math.max(0, total - spent);
  const pct = total ? Math.min(100, (spent / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold">
        <span>Spent {inr(spent)}</span>
        <span className="text-turf">Remaining {inr(left)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-turf transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BidTicker({ team, amount }: { team?: any; amount?: number }) {
  if (!team) return null;
  return (
    <div className="lime-flash flex items-center gap-3 rounded-full bg-lime px-4 py-2 text-sm font-bold" style={{ color: "var(--ink)" }}>
      {team.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] text-white"
          style={{ background: team.color }}
        >
          {team.name.slice(0, 2)}
        </span>
      )}
      {team.name} · {inr(amount)}
    </div>
  );
}
