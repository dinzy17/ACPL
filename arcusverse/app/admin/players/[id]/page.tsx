"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminGate";
import { AcplLinkPicker } from "@/components/admin/AcplLinkPicker";
import { AcplCareerPanel, AcplStatsCard } from "@/components/AcplStats";
import { Card } from "@/components/ui";
import { inr } from "@/lib/format";

export default function AuctionPlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const { admin, emit } = useAdmin();
  const player = admin.players.find((p: any) => p.id === params.id);
  const [acpl, setAcpl] = useState<any>(null);
  const [full, setFull] = useState<any>(null);
  const [photoBroken, setPhotoBroken] = useState(false);

  const refreshAcpl = async (p = player) => {
    if (!p) return;
    try {
      if (p.acplPlayerId) {
        const res: any = await emit("get-acpl-player", { id: p.acplPlayerId });
        setAcpl(res.summary);
        setFull(res.found ? res.player : null);
        return;
      }
      const res: any = await emit("get-acpl-player", { name: p.name });
      setAcpl(res.summary);
      setFull(res.found ? res.player : null);
    } catch {
      setAcpl({ found: false });
      setFull(null);
    }
  };

  useEffect(() => {
    setPhotoBroken(false);
  }, [player?.id, player?.photo]);

  useEffect(() => {
    if (!player) return;
    let alive = true;
    refreshAcpl(player).then(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, player?.id, player?.acplPlayerId, player?.name]);

  if (!player) {
    return (
      <Card>
        <p>Player not found.</p>
        <Link className="btn btn-ghost mt-3 inline-block px-4 py-2 text-sm" href="/admin/players">
          ← Players
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/players" className="btn btn-ghost inline-flex px-4 py-2 text-xs font-bold uppercase tracking-wider">
        ← Players
      </Link>
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            className="mx-auto h-44 w-44 shrink-0 overflow-hidden rounded-2xl sm:mx-0"
            style={{
              background: "color-mix(in srgb, var(--ink) 6%, transparent)",
              outline: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)"
            }}
          >
            {player.photo && !photoBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.photo}
                alt={player.name}
                className="h-full w-full object-cover"
                onError={() => setPhotoBroken(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center font-display text-5xl" style={{ color: "var(--muted)" }}>
                {String(player.name || "?")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="font-display text-5xl">{player.name}</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {player.sport || "Cricket"} · {player.role} ·{" "}
              {admin.categories.find((c: any) => c.id === player.categoryId)?.name} · Base {inr(player.basePrice)}
              {player.acplName ? (
                <>
                  {" "}
                  · ACPL: <strong style={{ color: "var(--turf)" }}>{player.acplName}</strong>
                </>
              ) : null}
            </p>
            {!player.photo || photoBroken ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No profile photo yet. Registration uploads attach automatically; you can also upload one on the Players
                page.
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Profile photo from registration / Players upload — also shown on the auction hammer desk.
              </p>
            )}
            <AcplStatsCard acpl={acpl} />
          </div>
        </div>
      </Card>
      {full && <AcplCareerPanel player={full} />}
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Link ACPL stats</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Search ACPL history and select the matching player to attach career stats.
        </p>
        <AcplLinkPicker
          emit={emit}
          playerId={player.id}
          linkedAcplId={player.acplPlayerId || null}
          linkedAcplName={player.acplName || null}
          initialQuery={player.acplName || player.name || ""}
          acplPlayers={admin.acplHistory?.players || []}
          onLinked={({ summary, acpl: linked }) => {
            setAcpl(summary);
            setFull(linked || null);
            refreshAcpl({ ...player, acplPlayerId: linked?.id, acplName: linked?.name });
          }}
          onUnlinked={() => {
            setAcpl({ found: false });
            setFull(null);
          }}
        />
      </Card>
    </div>
  );
}
