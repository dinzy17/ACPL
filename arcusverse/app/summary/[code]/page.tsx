"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Card, Button } from "@/components/ui";
import { useApp } from "@/components/Providers";
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
    const highest = [...withPlayers].sort((a, b) => b.soldPrice - a.soldPrice)[0];
    const byBase: Record<string, any> = {};
    for (const row of withPlayers) {
      const key = String(row.basePrice);
      if (!byBase[key] || row.soldPrice > byBase[key].soldPrice) byBase[key] = row;
    }
    const started = state.live?.startedAt;
    const ended = state.live?.endedAt || (state.auction.status === "live" ? Date.now() : started);
    const duration = started && ended ? ended - started : 0;
    const lotTimes: number[] = (state.live?.lotTimes || []).map((x: any) => x.ms);
    const avg = lotTimes.length ? lotTimes.reduce((a: number, b: number) => a + b, 0) / lotTimes.length : duration / Math.max(1, sold.length);
    return { sold, withPlayers, highest, byBase, duration, avg, count: sold.length };
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
      <div className="mb-4 flex gap-2 print:hidden">
        <Button variant="turf" onClick={() => download(`${state.auction.code}-rosters.csv`, rosterCsv(state))}>
          Export CSV
        </Button>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Highest bid</p>
          <p className="font-display text-4xl">{stats.highest ? stats.highest.player?.name : "—"}</p>
          <p className="text-sm">
            {stats.highest?.team?.name} · {inr(stats.highest?.soldPrice)}
          </p>
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
        <ul className="mt-3 space-y-2">
          {Object.values(stats.byBase).map((row: any) => (
            <li key={row.playerId} className="flex justify-between text-sm">
              <span>
                Base {inr(row.basePrice)} · {row.player?.name} ({row.team?.name})
              </span>
              <strong>{inr(row.soldPrice)}</strong>
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
