"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/Providers";

type ViewerStats = {
  auctionId?: string | null;
  spectators?: number;
  owners?: number;
  staff?: number;
  viewers?: number;
};

/**
 * Live spectator count for auctioneer / admin hammer desk.
 * Presence only — does not change auction configuration or stored data.
 */
export function LiveSpectatorBadge({ auctionId }: { auctionId?: string }) {
  const { socket, emit } = useApp();
  const [stats, setStats] = useState<ViewerStats>({ spectators: 0, owners: 0 });

  useEffect(() => {
    if (!socket || !auctionId) return;

    const onStats = (s: ViewerStats) => {
      if (s?.auctionId && s.auctionId !== auctionId) return;
      setStats(s || { spectators: 0 });
    };
    socket.on("viewer-stats", onStats);

    const pull = () => {
      emit("get-viewer-stats", { auctionId })
        .then((res: any) => {
          if (res && res.ok !== false) setStats(res);
        })
        .catch(() => {
          /* ignore */
        });
    };
    pull();
    const t = setInterval(pull, 8000);

    return () => {
      socket.off("viewer-stats", onStats);
      clearInterval(t);
    };
  }, [socket, emit, auctionId]);

  const spectators = Number(stats.spectators || 0);
  const owners = Number(stats.owners || 0);

  return (
    <div
      className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2 text-sm"
      style={{ background: "color-mix(in srgb, var(--neu-light) 70%, transparent)" }}
      title="People currently connected to this hammer desk"
    >
      <span>
        <span className="font-semibold">{spectators}</span>{" "}
        <span style={{ color: "var(--muted)" }}>live spectator{spectators === 1 ? "" : "s"}</span>
      </span>
      <span className="text-[11px]" style={{ color: "var(--muted)" }}>
        · {owners} owner{owners === 1 ? "" : "s"} online
      </span>
    </div>
  );
}
