"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminGate";
import { inr } from "@/lib/format";

export default function AdminOverview() {
  const { admin, emit } = useAdmin();
  const [err, setErr] = useState("");
  const live = admin.auctions.filter((a: any) => a.status === "live" || a.status === "paused");
  const draft = admin.auctions.filter((a: any) => a.status === "draft");
  const done = admin.auctions.filter((a: any) => a.status === "completed");

  const start = async (id: string) => {
    try {
      setErr("");
      await emit("start-auction", { auctionId: id });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-5xl">Console</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Setup: Tournament → Auction → Teams → Owners. Use the top nav to manage records.
        </p>
      </div>
      {err && <p style={{ color: "var(--crimson)" }}>{err}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Live auctions", live.length, "#2563EB"],
          ["Completed", done.length, "#06B6D4"],
          ["Tournaments", admin.tournaments.length, "#F97316"],
          ["Players in pool", admin.players.length, "#7C3AED"]
        ].map(([label, n, color]) => (
          <Card key={label as string} className="min-h-[140px]">
            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: color as string }}>
              {label}
            </p>
            <p className="font-display mt-2 text-7xl">{n as number}</p>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="font-display mb-3 text-3xl">Live now</h2>
        {live.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((a: any) => (
              <Card key={a.id} className="min-h-[160px] space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--aqua)" }}>
                      {a.status}
                    </p>
                    <h3 className="font-display text-4xl">{a.name}</h3>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      Code {a.code} · purse {inr(a.purse)} · sold {a.live?.sold?.length || 0} · remaining{" "}
                      {a.live?.remainingCount ?? a.playerIds?.length ?? 0}
                    </p>
                  </div>
                  <Link className="btn btn-lime px-4 py-2 text-sm" href="/auctioneer">
                    Hammer desk
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="min-h-[120px] text-lg">
            <p style={{ color: "var(--muted)" }}>No live session. Start an auction from Auctions in the nav.</p>
          </Card>
        )}
      </section>

      <section>
        <h2 className="font-display mb-3 text-3xl">Draft / upcoming</h2>
        {draft.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {draft.map((a: any) => (
              <Card key={a.id} className="flex min-h-[140px] items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-3xl">{a.name}</h3>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {a.code} · {a.teamIds?.length || 0} teams · {a.playerIds?.length || 0} players
                  </p>
                </div>
                <Button variant="lime" onClick={() => start(a.id)}>
                  Start live
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p style={{ color: "var(--muted)" }}>No draft auctions.</p>
          </Card>
        )}
      </section>

      <section>
        <h2 className="font-display mb-3 text-3xl">Past auctions</h2>
        {done.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {done.map((a: any) => {
              const sold = a.live?.sold || [];
              const top = [...sold].sort((x: any, y: any) => y.soldPrice - x.soldPrice)[0];
              const player = admin.players.find((p: any) => p.id === top?.playerId);
              return (
                <Card key={a.id} className="min-h-[150px]">
                  <h3 className="font-display text-3xl">{a.name}</h3>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {sold.length} sold · highest {player?.name || "—"} {top ? inr(top.soldPrice) : ""}
                  </p>
                  <Link className="mt-3 mr-3 inline-block text-sm font-bold" style={{ color: "var(--accent)" }} href={`/summary/${a.code}`}>
                    Open summary →
                  </Link>
                  <Link className="mt-3 inline-block text-sm font-bold" style={{ color: "var(--turf)" }} href={`/admin/schedule/${a.id}`}>
                    Groups & schedule →
                  </Link>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <p style={{ color: "var(--muted)" }}>No completed auctions yet.</p>
          </Card>
        )}
      </section>

      <section>
        <h2 className="font-display mb-3 text-3xl">Tournaments</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {admin.tournaments.map((t: any) => (
            <Card key={t.id} className="min-h-[150px]">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--orange)" }}>
                {t.sport}
              </p>
              <h3 className="font-display text-3xl">{t.name}</h3>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {t.venue} · {t.startDate} → {t.endDate}
              </p>
              <p className="mt-2 text-sm">
                {admin.categories.find((c: any) => c.id === t.categoryId)?.name || "—"} · {(t.teamIds || []).length} teams ·{" "}
                {admin.players.filter((p: any) => (p.tournamentIds || []).includes(t.id)).length} players · Auction{" "}
                {t.hasAuction ? "Yes" : "No"}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
