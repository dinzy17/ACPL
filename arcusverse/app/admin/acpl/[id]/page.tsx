"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminGate";
import { AcplCareerPanel } from "@/components/AcplStats";
import { Card } from "@/components/ui";

export default function AcplPlayerPage() {
  const params = useParams<{ id: string }>();
  const { emit } = useAdmin();
  const [player, setPlayer] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    emit("get-acpl-player", { id: params.id })
      .then((res: any) => {
        if (!alive) return;
        if (!res.found) setErr("Player not found");
        else setPlayer(res.player);
      })
      .catch((e: any) => alive && setErr(e.message || "Failed to load"));
    return () => {
      alive = false;
    };
  }, [emit, params.id]);

  return (
    <div className="space-y-4">
      <Link href="/admin/acpl" className="btn btn-ghost inline-flex px-4 py-2 text-xs font-bold uppercase tracking-wider">
        ← ACPL Stats
      </Link>
      {err && (
        <Card>
          <p style={{ color: "var(--crimson)" }}>{err}</p>
        </Card>
      )}
      {!err && !player && (
        <Card>
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        </Card>
      )}
      {player && <AcplCareerPanel player={player} />}
    </div>
  );
}
