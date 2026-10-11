"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Card, Button } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { TeamwiseExportBar } from "@/components/TeamwiseExportBar";
import { download, inr, rosterCsv } from "@/lib/format";

function fmtDur(ms: number) {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function SummaryPage() {
  const params = useParams<{ code: string }>();
  const { emit, socket } = useApp();
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;
    emit("login", { role: "spectator", code: params.code }).then((res: any) => setState(res.public));
    socket.on("state", setState);
    return () => {
      socket.off("state", setState);
    };
  }, [socket, params.code]);

  const stats = useMemo(() => {
    if (!state) return null;
    const sold = state.live?.sold || [];
    const withPlayers = sold.map((s: any) => ({
      ...s,
      player: state.players.find((p: any) => p.id === s.playerId),
      team: state.teams.find((t: any) => t.id === s.teamId)
    }));
    const topPrice = withPlayers.reduce((m: number, row: any) => Math.max(m, Number(row.soldPrice) || 0), 0);
    const highestPlayers = topPrice
      ? withPlayers.filter((row: any) => Number(row.soldPrice) === topPrice)
      : [];
    const byBase: Record<string, any[]> = {};
    for (const row of withPlayers) {
      const key = String(row.basePrice);
      const list = byBase[key] || [];
      if (!list.length || Number(row.soldPrice) > Number(list[0].soldPrice)) {
        byBase[key] = [row];
      } else if (Number(row.soldPrice) === Number(list[0].soldPrice)) {
        list.push(row);
        byBase[key] = list;
      }
    }
    const started = state.live?.startedAt;
    const ended = state.live?.endedAt || (state.auction.status === "live" ? Date.now() : started);
    const duration = started && ended ? ended - started : 0;
    const lotTimes: number[] = (state.live?.lotTimes || []).map((x: any) => x.ms);
    const avg = lotTimes.length ? lotTimes.reduce((a: number, b: number) => a + b, 0) / lotTimes.length : duration / Math.max(1, sold.length);
    return { sold, withPlayers, highestPlayers, topPrice, byBase, duration, avg, count: sold.length };
  }, [state]);

  if (!state || !stats) {
    return (
      <Shell title="Summary">
        <Card>Loading sheets…</Card>
      </Shell>
    );
  }

  const byTeam = state.teams.map((t: any) => ({
    team: t,
    players: stats.withPlayers.filter((s: any) => s.teamId === t.id)
  }));

  return (
    <Shell title="Summary" subtitle={state.auction.name} showLogout>
      <div className="mb-4 space-y-4 print:hidden">
        <TeamwiseExportBar state={state} />
        <div className="flex flex-wrap gap-2">
          <Button variant="turf" onClick={() => download(`${state.auction.code}-rosters.csv`, rosterCsv(state))}>
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>Print page</Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Highest bid</p>
          <p className="mt-1 font-display text-3xl">{stats.topPrice ? inr(stats.topPrice) : "—"}</p>
          <div className="mt-3 space-y-2">
            {stats.highestPlayers.map((row: any) => (
              <div key={row.playerId} className="flex items-center gap-2">
                {row.player?.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.player.photo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                      color: "var(--accent)"
                    }}
                  >
                    {(row.player?.name || "?").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold leading-tight">{row.player?.name || "—"}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{row.team?.name}</p>
                </div>
              </div>
            ))}
            {!stats.highestPlayers.length && <p className="text-sm text-[var(--muted)]">No sales yet</p>}
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Players bought</p>
          <p className="font-display text-5xl">{stats.count}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Total duration</p>
          <p className="font-display text-4xl">{fmtDur(stats.duration)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Avg time / player</p>
          <p className="font-display text-4xl">{fmtDur(stats.avg)}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="font-display text-3xl">Highest bid by base price</h2>
        <ul className="mt-3 space-y-3">
          {Object.entries(stats.byBase).map(([base, rows]) => (
            <li key={base} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Base {inr(Number(base))}</span>
                <strong>{inr(rows[0]?.soldPrice)}</strong>
              </div>
              <div className="flex flex-wrap gap-3">
                {rows.map((row: any) => (
                  <div key={row.playerId} className="flex items-center gap-2 text-sm">
                    {row.player?.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.player.photo} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold"
                        style={{
                          background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                          color: "var(--accent)"
                        }}
                      >
                        {(row.player?.name || "?").slice(0, 1)}
                      </div>
                    )}
                    <span>
                      {row.player?.name}{" "}
                      <span className="text-[var(--muted)]">({row.team?.name})</span>
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {byTeam.map(({ team, players }: any) => {
          const roles: Record<string, any[]> = {};
          for (const row of players) {
            const r = row.player?.role || "Other";
            (roles[r] ||= []).push(row);
          }
          return (
            <Card key={team.id}>
              <h2 className="font-display text-4xl" style={{ color: team.color }}>
                {team.name}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Spent {inr(team.stats?.purseSpent)} · Left {inr(team.stats?.purseLeft)}
              </p>
              {Object.entries(roles).map(([role, rows]) => (
                <div key={role} className="mt-3">
                  <p className="text-xs uppercase tracking-widest text-turf">{role}</p>
                  <ul className="mt-1 text-sm">
                    {rows.map((row: any) => (
                      <li key={row.playerId} className="flex justify-between py-1">
                        <span>{row.player?.name}</span>
                        <span>
                          {inr(row.basePrice)} → {inr(row.soldPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </Shell>
  );
}
