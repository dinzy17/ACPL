"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell, Card, Button } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { download, inr, teamBoughtCsv } from "@/lib/format";

function readAuth() {
  try {
    return JSON.parse(sessionStorage.getItem("arcus-auth") || "null");
  } catch {
    return null;
  }
}

export default function OwnerBoughtPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code || "").toUpperCase();
  const { emit, socket } = useApp();
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!socket) return;
    const auth = readAuth();
    if (!auth?.username) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await emit("login", {
          username: auth.username,
          password: auth.password,
          code
        });
        if (cancelled) return;
        if (res.role !== "owner") {
          router.replace(res.redirect || "/");
          return;
        }
        setTeamId(res.teamId || "");
        setTeamName(res.teamName || "");
        const synced: any = await emit("sync-live", {
          code,
          auctionId: res.public?.auction?.id
        });
        if (cancelled) return;
        setState(synced.public || res.public);
      } catch (e: any) {
        if (!cancelled) setErr(e.message || "Could not load squad");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [socket, emit, router, code]);

  const rows = useMemo(() => {
    if (!state || !teamId) return [];
    const team = state.teams?.find((t: any) => t.id === teamId);
    const bought = (state.live?.sold || [])
      .filter((s: any) => s.teamId === teamId)
      .map((s: any) => {
        const p = state.players.find((x: any) => x.id === s.playerId);
        return {
          id: s.playerId,
          name: p?.name || "Player",
          role: p?.role || "",
          categoryName: p?.categoryName || "",
          photo: p?.photo || "",
          phone: p?.phone || "",
          basePrice: s.basePrice,
          soldPrice: s.soldPrice,
          source: "Bought" as const
        };
      });
    const retained = (team?.retentions || []).map((r: any) => {
      const p = state.players.find((x: any) => x.id === r.playerId);
      return {
        id: r.playerId,
        name: p?.name || "Player",
        role: p?.role || "",
        categoryName: p?.categoryName || "",
        photo: p?.photo || "",
        phone: p?.phone || "",
        basePrice: r.basePrice,
        soldPrice: r.soldPrice,
        source: "Retained" as const
      };
    });
    return [...retained, ...bought].sort((a, b) => a.name.localeCompare(b.name));
  }, [state, teamId]);

  const spent = rows.reduce((s, r) => s + Number(r.soldPrice || 0), 0);
  const team = state?.teams?.find((t: any) => t.id === teamId);

  const exportCsv = () => {
    if (!state || !teamId) return;
    download(`${code}-${teamName || "team"}-squad.csv`, teamBoughtCsv(state, teamId));
  };

  if (err) {
    return (
      <Shell title="My squad" showLogout homeHref="/owner">
        <Card className="space-y-3 p-6">
          <p style={{ color: "var(--crimson)" }}>{err}</p>
          <Button onClick={() => router.push("/owner")}>Back to owner home</Button>
        </Card>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell title="My squad" showLogout homeHref="/owner">
        <Card>Loading your squad…</Card>
      </Shell>
    );
  }

  return (
    <Shell
      title={`${teamName || team?.name || "Team"} squad`}
      subtitle={state.auction?.name}
      showLogout
      homeHref="/owner"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          {state.auction?.tournamentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.auction.tournamentLogo}
              alt=""
              className="h-14 w-14 rounded-xl object-cover"
            />
          ) : null}
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {state.auction?.tournamentName || "Tournament"} · Code {state.auction?.code}
            </p>
            <p className="text-sm font-semibold">
              {rows.length} players · Spent {inr(spent)}
              {team?.stats?.purseLeft != null ? ` · Left ${inr(team.stats.purseLeft)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="turf" onClick={exportCsv}>
            Download CSV
          </Button>
          <Button onClick={() => window.print()}>Download PDF</Button>
          <Button onClick={() => router.push("/owner")}>Owner home</Button>
        </div>
      </div>

      <Card className="overflow-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
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
            {rows.map((p) => (
              <tr key={`${p.source}-${p.id}`} className="border-b border-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold"
                        style={{
                          background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                          color: "var(--accent)"
                        }}
                      >
                        {(p.name || "?").slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {p.categoryName}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{p.role || "—"}</td>
                <td className="px-4 py-3">{inr(p.basePrice)}</td>
                <td className="px-4 py-3">{p.soldPrice != null ? inr(p.soldPrice) : "—"}</td>
                <td className="px-4 py-3">{p.source}</td>
                <td className="px-4 py-3">{p.phone || "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No players bought in this auction yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </Shell>
  );
}
